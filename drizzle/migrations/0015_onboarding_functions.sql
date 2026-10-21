-- Tenant onboarding: RLS for the new tables, a default workflow per org,
-- staff functions (SECURITY INVOKER, so RLS and the audit log apply) and the
-- applicant portal (SECURITY DEFINER, reached only with a valid link token).

-- A trigger function: nobody needs to call it directly.
REVOKE ALL ON FUNCTION private.set_updated_at() FROM PUBLIC;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'onboarding_templates', 'onboarding_template_steps', 'onboardings', 'onboarding_steps',
    'right_to_rent_checks', 'reminders'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format(
      'CREATE POLICY "Members can view their organisation''s %1$s" ON public.%1$I
         FOR SELECT TO authenticated
         USING ((SELECT private.is_org_member(org_id)))', t);
    EXECUTE format(
      'CREATE POLICY "Members can add %1$s to their organisation" ON public.%1$I
         FOR INSERT TO authenticated
         WITH CHECK ((SELECT private.is_org_member(org_id)))', t);
    EXECUTE format(
      'CREATE POLICY "Members can edit their organisation''s %1$s" ON public.%1$I
         FOR UPDATE TO authenticated
         USING ((SELECT private.is_org_member(org_id)))
         WITH CHECK ((SELECT private.is_org_member(org_id)))', t);

    EXECUTE format(
      'CREATE TRIGGER %1$s_set_updated_at BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_prevent_org_change BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION private.prevent_org_change()', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_prevent_delete BEFORE DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION private.prevent_delete()', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION private.write_audit_log()', t);
  END LOOP;
END
$$;--> statement-breakpoint

-- Whether a user is an active member of an org (staff can't see others' memberships).
CREATE OR REPLACE FUNCTION private.is_active_member(target_org uuid, target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org AND m.user_id = target_user AND m.status = 'active'
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.is_active_member(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.is_active_member(uuid, uuid) TO authenticated;--> statement-breakpoint

-- The default onboarding workflow, in the order operators work through it.
CREATE OR REPLACE FUNCTION private.add_default_onboarding_template(target_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template uuid;
BEGIN
  SELECT id INTO v_template FROM public.onboarding_templates
  WHERE org_id = target_org AND is_default AND status = 'active';
  IF v_template IS NOT NULL THEN
    RETURN v_template;
  END IF;

  INSERT INTO public.onboarding_templates (org_id, name, is_default)
  VALUES (target_org, 'Standard onboarding', true)
  RETURNING id INTO v_template;

  INSERT INTO public.onboarding_template_steps
    (org_id, template_id, position, kind, title, applicant_title, owner_is_applicant, due_offset_days)
  VALUES
    (target_org, v_template, 1, 'application_form', 'Application form', 'Fill in your application', true, -14),
    (target_org, v_template, 2, 'right_to_rent', 'ID and right to rent check', 'ID and right to rent check', false, -10),
    (target_org, v_template, 3, 'referencing', 'Referencing', 'References', false, -7),
    (target_org, v_template, 4, 'holding_deposit', 'Holding deposit', 'Holding deposit', false, -7),
    (target_org, v_template, 5, 'agreement', 'Tenancy agreement signed', 'Sign your tenancy agreement', false, -5),
    (target_org, v_template, 6, 'deposit', 'Deposit received', 'Pay your deposit', false, -3),
    (target_org, v_template, 7, 'first_rent', 'First rent received', 'Pay your first rent', false, -1),
    (target_org, v_template, 8, 'move_in', 'Move in', 'Move in', false, 0);

  RETURN v_template;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.add_default_onboarding_template(uuid) FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.on_organisation_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.add_default_onboarding_template(NEW.id);
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.on_organisation_created() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER organisations_default_onboarding_template
  AFTER INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION private.on_organisation_created();--> statement-breakpoint

SELECT private.add_default_onboarding_template(id) FROM public.organisations;--> statement-breakpoint

-- Starts onboarding for an upcoming tenancy, copying the org's default steps.
-- Due dates count back from the move-in date, but never before today.
CREATE OR REPLACE FUNCTION public.start_onboarding(p_tenancy_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_room uuid;
  v_status public.tenancy_status;
  v_start date;
  v_template uuid;
  v_onboarding uuid;
  v_today date := private.today_in_london();
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  SELECT org_id, room_id, status, start_date INTO v_org, v_room, v_status, v_start
  FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'prospective' THEN
    RAISE EXCEPTION 'Onboarding is for upcoming tenancies.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.onboardings o WHERE o.tenancy_id = p_tenancy_id AND o.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'This tenancy already has an onboarding in progress.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_template FROM public.onboarding_templates
  WHERE org_id = v_org AND is_default AND status = 'active';
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Your organisation has no onboarding workflow set up.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.onboardings (org_id, room_id, tenancy_id, template_id)
  VALUES (v_org, v_room, p_tenancy_id, v_template)
  RETURNING id INTO v_onboarding;

  INSERT INTO public.onboarding_steps
    (org_id, onboarding_id, position, kind, title, applicant_title, owner_is_applicant, owner_user_id, due_date)
  SELECT
    v_org, v_onboarding, s.position, s.kind, s.title, s.applicant_title, s.owner_is_applicant,
    CASE WHEN s.owner_is_applicant THEN NULL ELSE (SELECT auth.uid()) END,
    GREATEST(v_start + s.due_offset_days, v_today)
  FROM public.onboarding_template_steps s
  WHERE s.template_id = v_template AND s.status = 'active'
  ORDER BY s.position;

  RETURN v_onboarding;
END;
$$;--> statement-breakpoint

-- Updates a step. Moving in needs every other step done or skipped, and
-- starts the tenancy; the onboarding completes once nothing is left.
CREATE OR REPLACE FUNCTION public.update_onboarding_step(
  p_step_id uuid,
  p_status public.onboarding_step_status,
  p_owner_user_id uuid,
  p_owner_is_applicant boolean,
  p_due_date date,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_onboarding uuid;
  v_kind public.onboarding_step_kind;
  v_onboarding_status public.onboarding_status;
  v_tenancy uuid;
BEGIN
  SELECT s.org_id, s.onboarding_id, s.kind, o.status, o.tenancy_id
  INTO v_org, v_onboarding, v_kind, v_onboarding_status, v_tenancy
  FROM public.onboarding_steps s
  JOIN public.onboardings o ON o.id = s.onboarding_id
  WHERE s.id = p_step_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_onboarding_status <> 'in_progress' THEN
    RAISE EXCEPTION 'This onboarding has finished, so its steps can''t change.' USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_user_id IS NOT NULL AND NOT private.is_active_member(v_org, p_owner_user_id) THEN
    RAISE EXCEPTION 'Choose someone in your organisation as the owner.' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind = 'move_in' AND p_status = 'done' THEN
    IF EXISTS (
      SELECT 1 FROM public.onboarding_steps s
      WHERE s.onboarding_id = v_onboarding AND s.id <> p_step_id AND s.status NOT IN ('done', 'skipped')
    ) THEN
      RAISE EXCEPTION 'Finish or skip the other steps before moving in.' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.start_tenancy(v_tenancy);
  END IF;

  UPDATE public.onboarding_steps
  SET status = p_status,
      owner_user_id = CASE WHEN p_owner_is_applicant THEN NULL ELSE p_owner_user_id END,
      owner_is_applicant = COALESCE(p_owner_is_applicant, false),
      due_date = p_due_date,
      notes = NULLIF(btrim(p_notes), ''),
      completed_at = CASE WHEN p_status = 'done' THEN COALESCE(completed_at, now()) END,
      completed_by = CASE WHEN p_status = 'done' THEN COALESCE(completed_by, (SELECT auth.uid())) END
  WHERE id = p_step_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_steps s
    WHERE s.onboarding_id = v_onboarding AND s.status NOT IN ('done', 'skipped')
  ) THEN
    UPDATE public.onboardings SET status = 'completed', completed_at = now(), portal_revoked_at = now()
    WHERE id = v_onboarding;
  END IF;
END;
$$;--> statement-breakpoint

-- Stores a new applicant link's hash (the link itself is never stored),
-- valid for 30 days. Any older link stops working.
CREATE OR REPLACE FUNCTION public.set_portal_link(p_onboarding_id uuid, p_token_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid link' USING ERRCODE = '22023';
  END IF;
  UPDATE public.onboardings
  SET portal_token_hash = p_token_hash, portal_expires_at = v_expires, portal_revoked_at = NULL
  WHERE id = p_onboarding_id AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an onboarding in progress can have an applicant link.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_expires;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.revoke_portal_link(p_onboarding_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.onboardings SET portal_revoked_at = now()
  WHERE id = p_onboarding_id AND portal_revoked_at IS NULL;
END;
$$;--> statement-breakpoint

-- Records a right to rent check. Time-limited permission creates a reminder
-- four weeks before it expires; the onboarding's check step is marked done.
CREATE OR REPLACE FUNCTION public.record_right_to_rent(
  p_tenant_id uuid,
  p_onboarding_id uuid,
  p_check_date date,
  p_method public.right_to_rent_method,
  p_permission public.right_to_rent_permission,
  p_expiry_date date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_name text;
  v_check uuid;
BEGIN
  SELECT org_id, first_name || ' ' || last_name INTO v_org, v_name
  FROM public.tenants WHERE id = p_tenant_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_check_date > private.today_in_london() THEN
    RAISE EXCEPTION 'The check date can''t be in the future.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.right_to_rent_checks
    (org_id, tenant_id, onboarding_id, check_date, method, permission, expiry_date, notes, checked_by)
  VALUES (
    v_org, p_tenant_id, p_onboarding_id, p_check_date, p_method, p_permission,
    CASE WHEN p_permission = 'time_limited' THEN p_expiry_date END,
    NULLIF(btrim(p_notes), ''), (SELECT auth.uid())
  )
  RETURNING id INTO v_check;

  IF p_permission = 'time_limited' THEN
    INSERT INTO public.reminders (org_id, kind, title, due_date, tenant_id, source_id)
    VALUES (
      v_org, 'right_to_rent_follow_up',
      'Right to rent follow-up check for ' || v_name
        || ' (permission ends ' || to_char(p_expiry_date, 'DD/MM/YYYY') || ')',
      p_expiry_date - 28, p_tenant_id, v_check
    );
  END IF;

  IF p_onboarding_id IS NOT NULL THEN
    UPDATE public.onboarding_steps
    SET status = 'done', completed_at = now(), completed_by = (SELECT auth.uid())
    WHERE onboarding_id = p_onboarding_id AND kind = 'right_to_rent'
      AND status NOT IN ('done', 'skipped');
  END IF;

  RETURN v_check;
END;
$$;--> statement-breakpoint

-- Move-in dates slip: an upcoming tenancy's start date can change.
CREATE OR REPLACE FUNCTION public.change_move_in_date(p_tenancy_id uuid, p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.tenancy_status;
  v_room uuid;
  v_current_end date;
BEGIN
  SELECT status, room_id INTO v_status, v_room FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'prospective' THEN
    RAISE EXCEPTION 'Only an upcoming tenancy''s move-in date can change.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start_date < private.today_in_london() THEN
    RAISE EXCEPTION 'Choose today or a later date.' USING ERRCODE = 'P0001';
  END IF;
  SELECT t.end_date INTO v_current_end FROM public.tenancies t
  WHERE t.room_id = v_room AND t.status IN ('active', 'ending');
  IF v_current_end IS NOT NULL AND p_start_date < v_current_end THEN
    RAISE EXCEPTION 'The current tenancy ends on %. Choose a date on or after that day.',
      to_char(v_current_end, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenancies SET start_date = p_start_date WHERE id = p_tenancy_id;
END;
$$;--> statement-breakpoint

-- Stops an onboarding that won't go ahead. The tenancy is left for staff to cancel.
CREATE OR REPLACE FUNCTION public.withdraw_onboarding(p_onboarding_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.onboardings
  SET status = 'withdrawn', portal_revoked_at = COALESCE(portal_revoked_at, now())
  WHERE id = p_onboarding_id AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an onboarding in progress can be withdrawn.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;--> statement-breakpoint

-- The people in an org, for choosing a step's owner. Empty unless the caller is a member.
CREATE OR REPLACE FUNCTION public.org_people(p_org_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, COALESCE(u.full_name, u.email, 'Unnamed')
  FROM public.memberships m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.org_id = p_org_id AND m.status = 'active'
    AND private.is_org_member(p_org_id)
  ORDER BY 2
$$;--> statement-breakpoint

-- ===== Applicant portal =====
-- Signed-out visitors can only run the portal_* functions below. Each takes
-- the link token, hashes it and finds exactly one live onboarding.

CREATE OR REPLACE FUNCTION private.portal_onboarding(p_token text)
RETURNS public.onboardings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.onboardings;
BEGIN
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 200 THEN
    RAISE EXCEPTION 'This link isn''t valid any more.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM public.onboardings o
  WHERE o.portal_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    AND o.portal_revoked_at IS NULL
    AND o.portal_expires_at > now()
    AND o.status = 'in_progress';
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'This link isn''t valid any more.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.portal_onboarding(text) FROM PUBLIC;--> statement-breakpoint

-- The lead tenant on the onboarding's tenancy.
CREATE OR REPLACE FUNCTION private.onboarding_tenant(p_tenancy_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tt.tenant_id FROM public.tenancy_tenants tt
  WHERE tt.tenancy_id = p_tenancy_id AND tt.status = 'active'
  ORDER BY tt.created_at LIMIT 1
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.onboarding_tenant(uuid) FROM PUBLIC;--> statement-breakpoint

-- Everything the applicant's page shows, and nothing more.
CREATE OR REPLACE FUNCTION public.portal_overview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.onboardings := private.portal_onboarding(p_token);
  v_tenant uuid;
  v_folder text;
BEGIN
  v_tenant := private.onboarding_tenant(v.tenancy_id);
  v_folder := v.org_id::text || '/applicants/' || v.upload_key::text || '/';

  RETURN jsonb_build_object(
    'organisation', (SELECT o.name FROM public.organisations o WHERE o.id = v.org_id),
    'address', (
      SELECT concat_ws(', ', p.address_line_1, p.town, p.postcode)
      FROM public.rooms r JOIN public.properties p ON p.id = r.property_id WHERE r.id = v.room_id
    ),
    'room', (SELECT r.name FROM public.rooms r WHERE r.id = v.room_id),
    'moveInDate', (SELECT t.start_date FROM public.tenancies t WHERE t.id = v.tenancy_id),
    'firstName', (SELECT tn.first_name FROM public.tenants tn WHERE tn.id = v_tenant),
    'expiresAt', v.portal_expires_at,
    'application', v.application,
    'submittedAt', v.application_submitted_at,
    'uploadFolder', v_folder,
    'steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'title', s.applicant_title, 'status', s.status, 'yours', s.owner_is_applicant
      ) ORDER BY s.position)
      FROM public.onboarding_steps s WHERE s.onboarding_id = v.id
    ), '[]'::jsonb),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fileName', d.file_name, 'type', d.document_type, 'uploadedAt', d.created_at
      ) ORDER BY d.created_at)
      FROM public.documents d
      WHERE d.tenant_id = v_tenant AND starts_with(d.file_path, v_folder) AND d.status = 'active'
    ), '[]'::jsonb)
  );
END;
$$;--> statement-breakpoint

-- Saves the application, as a draft or for good. Once submitted it can't change.
CREATE OR REPLACE FUNCTION public.portal_save_application(
  p_token text,
  p_application jsonb,
  p_submit boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.onboardings := private.portal_onboarding(p_token);
BEGIN
  IF v.application_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'You''ve already sent your application.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_application) IS DISTINCT FROM 'object' OR pg_column_size(p_application) > 20000 THEN
    RAISE EXCEPTION 'That application couldn''t be saved.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.onboardings
  SET application = p_application,
      application_submitted_at = CASE WHEN p_submit THEN now() END
  WHERE id = v.id;

  UPDATE public.onboarding_steps
  SET status = CASE WHEN p_submit THEN 'done' ELSE 'in_progress' END::public.onboarding_step_status,
      completed_at = CASE WHEN p_submit THEN now() END
  WHERE onboarding_id = v.id AND kind = 'application_form' AND status NOT IN ('done', 'skipped');
END;
$$;--> statement-breakpoint

-- Records a file the applicant has just uploaded into their folder.
CREATE OR REPLACE FUNCTION public.portal_record_document(
  p_token text,
  p_path text,
  p_file_name text,
  p_document_type public.document_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.onboardings := private.portal_onboarding(p_token);
  v_folder text := v.org_id::text || '/applicants/' || v.upload_key::text || '/';
  v_rest text;
BEGIN
  IF p_document_type NOT IN ('identity', 'right_to_rent', 'proof_of_income', 'other') THEN
    RAISE EXCEPTION 'That kind of document can''t be uploaded here.' USING ERRCODE = '22023';
  END IF;
  v_rest := substr(p_path, char_length(v_folder) + 1);
  IF NOT starts_with(p_path, v_folder) OR v_rest = '' OR strpos(v_rest, '/') > 0
    OR strpos(p_path, '..') > 0 THEN
    RAISE EXCEPTION 'That file isn''t in your folder.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'documents' AND o.name = p_path
  ) THEN
    RAISE EXCEPTION 'We couldn''t find that file. Please upload it again.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.documents (org_id, document_type, file_path, file_name, tenant_id)
  VALUES (v.org_id, p_document_type, p_path, left(btrim(p_file_name), 200), private.onboarding_tenant(v.tenancy_id));

  IF p_document_type IN ('identity', 'right_to_rent') THEN
    UPDATE public.onboarding_steps SET status = 'in_progress'
    WHERE onboarding_id = v.id AND kind = 'right_to_rent' AND status = 'not_started';
  END IF;
END;
$$;--> statement-breakpoint

-- Storage: an applicant may add files (only) to their own onboarding folder,
-- <org>/applicants/<upload_key>/<file>, while their link is live.
CREATE OR REPLACE FUNCTION private.applicant_upload_allowed(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT array_length(string_to_array(object_name, '/'), 1) = 4
    AND split_part(object_name, '/', 2) = 'applicants'
    AND split_part(object_name, '/', 4) <> ''
    AND EXISTS (
      SELECT 1 FROM public.onboardings o
      WHERE o.org_id::text = split_part(object_name, '/', 1)
        AND o.upload_key::text = split_part(object_name, '/', 3)
        AND o.status = 'in_progress'
        AND o.portal_revoked_at IS NULL
        AND o.portal_expires_at > now()
    )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.applicant_upload_allowed(text) FROM PUBLIC;--> statement-breakpoint

CREATE POLICY "Applicants can add files to their onboarding folder"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'documents' AND (SELECT private.applicant_upload_allowed(name)));--> statement-breakpoint

-- Grants. Signed-out visitors reach the private schema only through the
-- upload check; everything else there stays closed to them.
GRANT USAGE ON SCHEMA private TO anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.applicant_upload_allowed(text) TO anon, authenticated;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.portal_overview(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.portal_save_application(text, jsonb, boolean) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.portal_record_document(text, text, text, public.document_type) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.portal_overview(text) TO anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.portal_save_application(text, jsonb, boolean) TO anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.portal_record_document(text, text, text, public.document_type) TO anon, authenticated;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.start_onboarding(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_onboarding(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_onboarding_step(uuid, public.onboarding_step_status, uuid, boolean, date, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_onboarding_step(uuid, public.onboarding_step_status, uuid, boolean, date, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_portal_link(uuid, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_portal_link(uuid, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.revoke_portal_link(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.revoke_portal_link(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_right_to_rent(uuid, uuid, date, public.right_to_rent_method, public.right_to_rent_permission, date, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_right_to_rent(uuid, uuid, date, public.right_to_rent_method, public.right_to_rent_permission, date, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_move_in_date(uuid, date) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_move_in_date(uuid, date) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.withdraw_onboarding(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.withdraw_onboarding(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.org_people(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.org_people(uuid) TO authenticated;
