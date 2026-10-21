-- The tenant portal: business-table RLS for the new tables, tenant-only
-- policies (a tenant sees only tenancies linked to their own tenant
-- record), invites, the rent schedule, and Storage rules.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_portal_invites', 'rent_charges', 'rent_payments', 'maintenance_requests',
    'maintenance_photos', 'messages', 'document_services'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format(
      'CREATE POLICY "Members can view their organisation''s %1$s" ON public.%1$I
         FOR SELECT TO authenticated USING ((SELECT private.is_org_member(org_id)))', t);
    EXECUTE format(
      'CREATE POLICY "Members can add %1$s to their organisation" ON public.%1$I
         FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_org_member(org_id)))', t);
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

-- Messages are never edited.
REVOKE UPDATE ON public.messages FROM authenticated;--> statement-breakpoint

-- ===== Who is a tenant =====

-- The tenancies the signed-in user is a tenant on (through their tenant record).
CREATE OR REPLACE FUNCTION private.my_tenancy_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tt.tenancy_id
  FROM public.tenancy_tenants tt
  JOIN public.tenants t ON t.id = tt.tenant_id
  WHERE t.user_id = (SELECT auth.uid()) AND t.status = 'active' AND tt.status = 'active'
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.my_tenancy_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.my_tenancy_ids() TO authenticated;--> statement-breakpoint

-- ===== Tenant policies: their own records only, read-only unless stated =====

CREATE POLICY "Tenants can view their own tenant record"
  ON public.tenants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));--> statement-breakpoint

CREATE POLICY "Tenants can view their own tenancies"
  ON public.tenancies FOR SELECT TO authenticated
  USING (id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

CREATE POLICY "Tenants can view their own rent charges"
  ON public.rent_charges FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

CREATE POLICY "Tenants can view their own rent payments"
  ON public.rent_payments FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

CREATE POLICY "Tenants can view their own repair reports"
  ON public.maintenance_requests FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

-- The room and property must be the tenancy's own, and it starts as reported.
CREATE OR REPLACE FUNCTION private.tenancy_place_matches(p_tenancy uuid, p_property uuid, p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenancies t JOIN public.rooms r ON r.id = t.room_id
    WHERE t.id = p_tenancy AND r.property_id = p_property AND (p_room IS NULL OR p_room = r.id)
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.tenancy_place_matches(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.tenancy_place_matches(uuid, uuid, uuid) TO authenticated;--> statement-breakpoint

CREATE POLICY "Tenants can report repairs for their own tenancy"
  ON public.maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (
    tenancy_id IN (SELECT private.my_tenancy_ids())
    AND reported_by = (SELECT auth.uid())
    AND status = 'reported'
    AND (SELECT private.tenancy_place_matches(tenancy_id, property_id, room_id))
  );--> statement-breakpoint

CREATE POLICY "Tenants can view photos of their own repairs"
  ON public.maintenance_photos FOR SELECT TO authenticated
  USING (request_id IN (
    SELECT m.id FROM public.maintenance_requests m
    WHERE m.tenancy_id IN (SELECT private.my_tenancy_ids())
  ));--> statement-breakpoint

CREATE POLICY "Tenants can add photos to their own repairs"
  ON public.maintenance_photos FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND request_id IN (
      SELECT m.id FROM public.maintenance_requests m
      WHERE m.tenancy_id IN (SELECT private.my_tenancy_ids())
    )
  );--> statement-breakpoint

CREATE POLICY "Tenants can view their own messages"
  ON public.messages FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

CREATE POLICY "Tenants can send messages about their own tenancy"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (tenancy_id IN (SELECT private.my_tenancy_ids()) AND sender = 'tenant');--> statement-breakpoint

CREATE POLICY "Tenants can view documents served to them"
  ON public.document_services FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT private.my_tenancy_ids()));--> statement-breakpoint

CREATE POLICY "Tenants can view the documents served to them"
  ON public.documents FOR SELECT TO authenticated
  USING (id IN (
    SELECT s.document_id FROM public.document_services s
    WHERE s.tenancy_id IN (SELECT private.my_tenancy_ids())
  ));--> statement-breakpoint

-- Who sent a message is decided here, not by the client: staff of the org
-- send as staff, the tenancy's tenants as tenant.
CREATE OR REPLACE FUNCTION private.set_message_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.author_user_id := (SELECT auth.uid());
  IF NEW.author_user_id IS NULL THEN
    RETURN NEW; -- Seeds and migrations.
  END IF;
  IF private.is_org_member(NEW.org_id) THEN
    NEW.sender := 'staff';
  ELSIF NEW.tenancy_id IN (SELECT private.my_tenancy_ids()) THEN
    NEW.sender := 'tenant';
  END IF;
  NEW.body := btrim(NEW.body);
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.set_message_author() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER messages_set_author
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.set_message_author();--> statement-breakpoint

-- ===== Storage =====

-- A served document's file, or a photo of one of the user's own repairs.
CREATE OR REPLACE FUNCTION private.tenant_can_read_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.document_services s ON s.document_id = d.id
    WHERE d.file_path = object_name AND d.status = 'active'
      AND s.tenancy_id IN (SELECT private.my_tenancy_ids())
  ) OR EXISTS (
    SELECT 1 FROM public.maintenance_photos p
    JOIN public.maintenance_requests m ON m.id = p.request_id
    WHERE p.file_path = object_name AND m.tenancy_id IN (SELECT private.my_tenancy_ids())
  )
$$;--> statement-breakpoint

-- <org>/maintenance/<request>/<file>, for a repair on the user's own tenancy.
CREATE OR REPLACE FUNCTION private.tenant_can_upload_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT array_length(string_to_array(object_name, '/'), 1) = 4
    AND split_part(object_name, '/', 2) = 'maintenance'
    AND split_part(object_name, '/', 4) <> ''
    AND EXISTS (
      SELECT 1 FROM public.maintenance_requests m
      WHERE m.org_id::text = split_part(object_name, '/', 1)
        AND m.id::text = split_part(object_name, '/', 3)
        AND m.tenancy_id IN (SELECT private.my_tenancy_ids())
    )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.tenant_can_read_object(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.tenant_can_upload_object(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.tenant_can_read_object(text) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.tenant_can_upload_object(text) TO authenticated;--> statement-breakpoint

CREATE POLICY "Tenants can view their served documents and repair photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (SELECT private.tenant_can_read_object(name)));--> statement-breakpoint

CREATE POLICY "Tenants can add photos to their own repairs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (SELECT private.tenant_can_upload_object(name)));--> statement-breakpoint

-- ===== Invites =====

-- Makes an invite for a tenant (the link's hash), switching off any earlier one.
CREATE OR REPLACE FUNCTION public.create_tenant_invite(p_tenant_id uuid, p_token_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_linked uuid;
  v_expires timestamptz := now() + interval '14 days';
BEGIN
  SELECT org_id, user_id INTO v_org, v_linked FROM public.tenants WHERE id = p_tenant_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_linked IS NOT NULL THEN
    RAISE EXCEPTION 'This tenant has already joined the portal.' USING ERRCODE = 'P0001';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invite' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenant_portal_invites SET revoked_at = now()
  WHERE tenant_id = p_tenant_id AND used_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.tenant_portal_invites (org_id, tenant_id, token_hash, expires_at, created_by)
  VALUES (v_org, p_tenant_id, p_token_hash, v_expires, (SELECT auth.uid()));
  RETURN v_expires;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.live_invite(p_token text)
RETURNS public.tenant_portal_invites
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.tenant_portal_invites;
BEGIN
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 200 THEN
    RAISE EXCEPTION 'This invite isn''t valid any more.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM public.tenant_portal_invites i
  WHERE i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now();
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'This invite isn''t valid any more.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.live_invite(text) FROM PUBLIC;--> statement-breakpoint

-- What the join page shows before someone has an account.
CREATE OR REPLACE FUNCTION public.tenant_invite_info(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.tenant_portal_invites := private.live_invite(p_token);
BEGIN
  RETURN (
    SELECT jsonb_build_object('organisation', o.name, 'firstName', t.first_name, 'email', t.email)
    FROM public.tenants t JOIN public.organisations o ON o.id = t.org_id
    WHERE t.id = v.tenant_id
  );
END;
$$;--> statement-breakpoint

-- Links the signed-in user to the invited tenant record. Staff accounts can't
-- also be tenant accounts, and a tenant record is only ever linked once.
CREATE OR REPLACE FUNCTION public.claim_tenant_invite(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.tenant_portal_invites := private.live_invite(p_token);
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = v_user AND m.status = 'active') THEN
    RAISE EXCEPTION 'This account is a staff account. Log out and join with a different email address.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = v.tenant_id AND t.user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This tenant has already joined the portal.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenants SET user_id = v_user WHERE id = v.tenant_id;
  UPDATE public.tenant_portal_invites SET used_at = now(), used_by = v_user WHERE id = v.id;
END;
$$;--> statement-breakpoint

-- ===== What the tenant sees of their home =====

-- Only fields that are safe to show a tenant: never head rent, owners or tags.
CREATE OR REPLACE FUNCTION public.tenant_home()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tenancyId', t.id,
    'status', t.status,
    'startDate', t.start_date,
    'endDate', t.end_date,
    'rentPence', t.rent_pence,
    'rentFrequency', t.rent_frequency,
    'rentDueDay', t.rent_due_day,
    'depositPence', t.deposit_pence,
    'organisation', o.name,
    'room', jsonb_build_object('name', r.name, 'sizeSqm', r.size_sqm, 'features', r.features),
    'property', jsonb_build_object(
      'id', p.id,
      'address', concat_ws(', ', p.address_line_1, p.address_line_2, p.town || ' ' || p.postcode),
      'amenities', p.amenities,
      'houseRules', p.house_rules,
      'billsIncluded', p.bills_included,
      'welcomePack', p.welcome_pack
    ),
    'roomId', r.id
  ) ORDER BY (t.status IN ('active', 'ending')) DESC, t.start_date DESC), '[]'::jsonb)
  FROM public.tenancies t
  JOIN public.rooms r ON r.id = t.room_id
  JOIN public.properties p ON p.id = r.property_id
  JOIN public.organisations o ON o.id = t.org_id
  WHERE t.id IN (SELECT private.my_tenancy_ids())
    AND t.status IN ('prospective', 'active', 'ending', 'ended')
$$;--> statement-breakpoint

-- ===== Rent schedule =====

-- The last day of a month containing d, clamped day.
CREATE OR REPLACE FUNCTION private.month_day(p_year int, p_month int, p_day int)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT make_date(p_year, p_month, LEAST(
    p_day,
    EXTRACT(day FROM (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int
  ))
$$;--> statement-breakpoint

-- Creates any missing rent charges for a tenancy, up to today (or its end
-- date). Rent is due in advance on each due day; a first or last part
-- period is charged by the day (monthly: rent x 12 / 365 per day; weekly:
-- rent / 7), rounded down to the penny. Each period is charged once.
CREATE OR REPLACE FUNCTION public.sync_rent_charges(p_tenancy_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.tenancies;
  v_today date := private.today_in_london();
  v_upto date;
  v_due date;
  v_next date;
  v_period_end date;
  v_days int;
  v_full_days int;
  v_amount int;
  v_inserted int := 0;
  v_count int;
BEGIN
  SELECT * INTO v FROM public.tenancies WHERE id = p_tenancy_id;
  IF v.id IS NULL OR NOT (
    private.is_org_member(v.org_id) OR v.id IN (SELECT private.my_tenancy_ids())
  ) THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v.status NOT IN ('active', 'ending', 'ended') THEN
    RETURN 0;
  END IF;

  v_upto := LEAST(v_today, COALESCE(v.end_date, v_today));

  -- The first due date on or after the start date.
  IF v.rent_frequency = 'weekly' THEN
    v_next := v.start_date + ((v.rent_due_day - EXTRACT(isodow FROM v.start_date)::int + 7) % 7);
  ELSE
    v_next := private.month_day(EXTRACT(year FROM v.start_date)::int, EXTRACT(month FROM v.start_date)::int, v.rent_due_day);
    IF v_next < v.start_date THEN
      v_next := private.month_day(
        EXTRACT(year FROM v.start_date + interval '1 month')::int,
        EXTRACT(month FROM v.start_date + interval '1 month')::int,
        v.rent_due_day);
    END IF;
  END IF;

  v_due := v.start_date;
  WHILE v_due <= v_upto LOOP
    -- The period runs from v_due to the day before the next due date.
    IF v_next <= v_due THEN
      IF v.rent_frequency = 'weekly' THEN
        v_next := v_due + 7;
      ELSE
        v_next := private.month_day(
          EXTRACT(year FROM v_due + interval '1 month')::int,
          EXTRACT(month FROM v_due + interval '1 month')::int,
          v.rent_due_day);
      END IF;
    END IF;
    v_period_end := v_next - 1;
    IF v.end_date IS NOT NULL AND v.end_date < v_period_end THEN
      v_period_end := v.end_date;
    END IF;

    v_days := v_period_end - v_due + 1;
    v_full_days := v_next - v_due;
    IF v.rent_frequency = 'weekly' THEN
      v_amount := CASE WHEN v_days >= 7 THEN v.rent_pence ELSE floor(v.rent_pence::numeric * v_days / 7)::int END;
    ELSE
      -- A whole month (due date to due date) is the full rent; part months by the day.
      v_amount := CASE
        WHEN v_period_end = v_next - 1 AND v_due = private.month_day(EXTRACT(year FROM v_due)::int, EXTRACT(month FROM v_due)::int, v.rent_due_day)
          THEN v.rent_pence
        ELSE floor(v.rent_pence::numeric * 12 * v_days / 365)::int
      END;
    END IF;

    IF v_amount > 0 THEN
      INSERT INTO public.rent_charges
        (org_id, tenancy_id, kind, source, period_start, period_end, due_date, amount_pence, description)
      VALUES (
        v.org_id, v.id, 'rent', 'schedule', v_due, v_period_end, v_due, v_amount,
        'Rent ' || to_char(v_due, 'DD/MM/YYYY') || ' to ' || to_char(v_period_end, 'DD/MM/YYYY')
      )
      ON CONFLICT (tenancy_id, period_start) WHERE source = 'schedule' DO NOTHING;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_inserted := v_inserted + v_count;
    END IF;

    v_due := v_next;
  END LOOP;

  RETURN v_inserted;
END;
$$;--> statement-breakpoint

-- Signed tenancy agreements are served to the tenancy automatically.
CREATE OR REPLACE FUNCTION public.attach_signed_document(p_request_id uuid, p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_request public.signature_requests;
BEGIN
  UPDATE public.signature_requests SET signed_document_id = p_document_id
  WHERE id = p_request_id AND status = 'completed' AND signed_document_id IS NULL
  RETURNING * INTO v_request;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'That request isn''t waiting for its signed copy.' USING ERRCODE = 'P0001';
  END IF;
  IF v_request.kind = 'tenancy_agreement' THEN
    INSERT INTO public.document_services (org_id, document_id, tenancy_id, method, served_by)
    VALUES (v_request.org_id, p_document_id, v_request.tenancy_id, 'portal', (SELECT auth.uid()))
    ON CONFLICT (document_id, tenancy_id) DO NOTHING;
  END IF;
END;
$$;--> statement-breakpoint

-- ===== Grants =====
REVOKE ALL ON FUNCTION public.create_tenant_invite(uuid, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_invite_info(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_invite_info(text) TO anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_tenant_invite(text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_tenant_invite(text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_home() FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_home() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sync_rent_charges(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sync_rent_charges(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.month_day(int, int, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.month_day(int, int, int) TO authenticated;
