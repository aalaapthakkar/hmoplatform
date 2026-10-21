-- Tenancy documents and e-signing: RLS, default DRAFT templates, guarantor
-- and signature request functions, and the one function the e-sign webhook
-- may call (with a relay secret, never a Supabase key).

-- Business-table rules for everything except templates (admins edit those).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenancy_guarantors', 'signature_requests', 'signature_request_signers', 'esign_events'
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
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'tenancy_guarantors', 'document_templates', 'signature_requests',
    'signature_request_signers', 'esign_events'
  ]
  LOOP
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

REVOKE ALL ON public.document_templates FROM anon;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON public.document_templates FROM authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.document_templates TO authenticated;--> statement-breakpoint

CREATE POLICY "Members can view their organisation's document templates"
  ON public.document_templates FOR SELECT TO authenticated
  USING ((SELECT private.is_org_member(org_id)));--> statement-breakpoint
CREATE POLICY "Admins can add document templates"
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_org_role(org_id, 'admin')));--> statement-breakpoint
CREATE POLICY "Admins can edit document templates"
  ON public.document_templates FOR UPDATE TO authenticated
  USING ((SELECT private.has_org_role(org_id, 'admin')))
  WITH CHECK ((SELECT private.has_org_role(org_id, 'admin')));--> statement-breakpoint

-- Placeholder wording for every org, clearly marked DRAFT.
CREATE OR REPLACE FUNCTION private.add_default_document_templates(target_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_templates
    WHERE org_id = target_org AND kind = 'tenancy_agreement' AND is_default AND status = 'active'
  ) THEN
    INSERT INTO public.document_templates (org_id, kind, name, is_draft, is_default, body)
    VALUES (target_org, 'tenancy_agreement', 'Tenancy agreement (DRAFT)', true, true, $body$
# Tenancy agreement for a room in a shared house

DRAFT: replace with solicitor-approved wording. This placeholder is for testing only and must not be used for a real tenancy.

## The people
- Landlord: {{landlord_name}}, managed by {{organisation_name}}
- Tenant: {{tenant_name}} ({{tenant_email}})

## The room
The tenant may live in {{room}} at {{property_address}}, and share the kitchen, bathroom and other shared areas with the other people who live there.

## How long it lasts
The tenancy starts on {{start_date}}. It runs from one rent period to the next with no fixed end date, and can only end as the law allows.

## Rent
The rent is {{rent}} {{rent_frequency}}, due on the {{rent_due_day}}.

## Deposit
The tenant pays a deposit of {{deposit}}, which the landlord will protect in a government-approved scheme.

## Signatures
The tenant and the landlord, or someone signing for the landlord, sign below. Prepared on {{today}}.
$body$);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.document_templates
    WHERE org_id = target_org AND kind = 'guarantor_agreement' AND is_default AND status = 'active'
  ) THEN
    INSERT INTO public.document_templates (org_id, kind, name, is_draft, is_default, body)
    VALUES (target_org, 'guarantor_agreement', 'Guarantor agreement (DRAFT)', true, true, $body$
# Guarantor agreement

DRAFT: replace with solicitor-approved wording. This placeholder is for testing only and must not be used for a real guarantee.

## The people
- Guarantor: {{guarantor_name}}, of {{guarantor_address}}
- Tenant: {{tenant_name}}
- Landlord: {{landlord_name}}, managed by {{organisation_name}}

## What the guarantor agrees to
If the tenant doesn't pay the rent of {{rent}} {{rent_frequency}} for {{room}} at {{property_address}}, or breaks the tenancy agreement starting on {{start_date}}, the guarantor will put it right.

## Signatures
The guarantor and the landlord, or someone signing for the landlord, sign below. Prepared on {{today}}.
$body$);
  END IF;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.add_default_document_templates(uuid) FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.on_organisation_created_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.add_default_document_templates(NEW.id);
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.on_organisation_created_templates() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER organisations_default_document_templates
  AFTER INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION private.on_organisation_created_templates();--> statement-breakpoint

SELECT private.add_default_document_templates(id) FROM public.organisations;--> statement-breakpoint

-- Adds a guarantor to an upcoming or current tenancy.
CREATE OR REPLACE FUNCTION public.add_guarantor(
  p_tenancy_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_status public.tenancy_status;
  v_guarantor uuid;
BEGIN
  SELECT org_id, status INTO v_org, v_status FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('prospective', 'active') THEN
    RAISE EXCEPTION 'Guarantors can only be added to upcoming or current tenancies.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenancy_guarantors g WHERE g.tenancy_id = p_tenancy_id AND g.status = 'required'
  ) THEN
    RAISE EXCEPTION 'This tenancy already has a guarantor.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tenancy_guarantors (org_id, tenancy_id, name, email, phone, address)
  VALUES (v_org, p_tenancy_id, btrim(p_name), lower(btrim(p_email)), NULLIF(btrim(p_phone), ''),
          NULLIF(btrim(p_address), ''))
  RETURNING id INTO v_guarantor;
  RETURN v_guarantor;
END;
$$;--> statement-breakpoint

-- Removes the guarantor requirement before the guarantor has signed. Any
-- open guarantor agreement is marked cancelled (the app cancels it with the
-- provider first). The tenancy agreement and its signatures are untouched.
CREATE OR REPLACE FUNCTION public.remove_guarantor(p_guarantor_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.guarantor_status;
  v_reason text := btrim(p_reason);
BEGIN
  SELECT status INTO v_status FROM public.tenancy_guarantors WHERE id = p_guarantor_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Guarantor not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'removed' THEN
    RAISE EXCEPTION 'This guarantor has already been removed.' USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Give a reason for removing the guarantor.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.signature_requests r
    JOIN public.signature_request_signers s ON s.request_id = r.id
    WHERE r.guarantor_id = p_guarantor_id AND r.status <> 'cancelled'
      AND s.role = 'guarantor' AND s.status = 'signed'
  ) THEN
    RAISE EXCEPTION 'The guarantor has already signed, so the guarantee can''t be removed here.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.signature_requests
  SET status = 'cancelled', cancelled_at = now(),
      cancelled_reason = 'Guarantor requirement removed: ' || v_reason
  WHERE guarantor_id = p_guarantor_id AND status IN ('sent', 'partly_signed');

  UPDATE public.tenancy_guarantors
  SET status = 'removed', removed_at = now(), removed_by = (SELECT auth.uid()), removed_reason = v_reason
  WHERE id = p_guarantor_id;
END;
$$;--> statement-breakpoint

-- Records a document the app has just sent for signature, with its signers.
CREATE OR REPLACE FUNCTION public.record_signature_request(
  p_tenancy_id uuid,
  p_kind public.document_template_kind,
  p_template_id uuid,
  p_guarantor_id uuid,
  p_provider text,
  p_provider_request_id text,
  p_unsigned_document_id uuid,
  p_signers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_request uuid;
  v_signer jsonb;
BEGIN
  SELECT org_id INTO v_org FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_signers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_signers) = 0 THEN
    RAISE EXCEPTION 'A signature request needs signers' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.signature_requests (
    org_id, tenancy_id, kind, template_id, guarantor_id, provider, provider_request_id,
    unsigned_document_id, sent_by
  )
  VALUES (
    v_org, p_tenancy_id, p_kind, p_template_id, p_guarantor_id, p_provider, p_provider_request_id,
    p_unsigned_document_id, (SELECT auth.uid())
  )
  RETURNING id INTO v_request;

  FOR v_signer IN SELECT * FROM jsonb_array_elements(p_signers) LOOP
    INSERT INTO public.signature_request_signers (org_id, request_id, role, name, email, signing_order)
    VALUES (
      v_org, v_request, (v_signer ->> 'role')::public.signer_role, v_signer ->> 'name',
      lower(v_signer ->> 'email'), (v_signer ->> 'order')::smallint
    );
  END LOOP;

  RETURN v_request;
END;
$$;--> statement-breakpoint

-- Links the signed PDF once it has been saved to documents.
CREATE OR REPLACE FUNCTION public.attach_signed_document(p_request_id uuid, p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.signature_requests SET signed_document_id = p_document_id
  WHERE id = p_request_id AND status = 'completed' AND signed_document_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request isn''t waiting for its signed copy.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;--> statement-breakpoint

-- The webhook relay secret's hash (set by npm run esign:setup, never the secret itself).
CREATE TABLE private.esign_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  relay_secret_hash text NOT NULL CHECK (relay_secret_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

REVOKE ALL ON private.esign_settings FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- Applies a provider event that the app's webhook (or Refresh status) has
-- already verified with the provider. It can only move signers and the
-- request forward, records each event once, and ticks the onboarding's
-- agreement step when a tenancy agreement completes.
CREATE OR REPLACE FUNCTION public.esign_apply_event(
  p_relay_secret text,
  p_provider text,
  p_provider_request_id text,
  p_event_key text,
  p_event_type text,
  p_event_time timestamptz,
  p_request_status public.signature_request_status,
  p_signers jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.signature_requests;
  v_signer jsonb;
  v_inserted uuid;
BEGIN
  IF p_relay_secret IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.esign_settings
    WHERE relay_secret_hash = encode(sha256(convert_to(p_relay_secret, 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.signature_requests
  WHERE provider = p_provider AND provider_request_id = p_provider_request_id;
  IF v_request.id IS NULL THEN
    RETURN 'unknown';
  END IF;

  INSERT INTO public.esign_events (org_id, request_id, event_key, event_type, event_time)
  VALUES (v_request.org_id, v_request.id, left(p_event_key, 200), left(p_event_type, 100), p_event_time)
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    RETURN 'duplicate';
  END IF;

  -- Finished requests stay as they are.
  IF v_request.status IN ('completed', 'cancelled', 'declined') THEN
    RETURN 'ignored';
  END IF;

  IF jsonb_typeof(p_signers) = 'array' THEN
    FOR v_signer IN SELECT * FROM jsonb_array_elements(p_signers) LOOP
      UPDATE public.signature_request_signers
      SET status = (v_signer ->> 'status')::public.signer_status,
          signed_at = CASE WHEN v_signer ->> 'status' = 'signed'
                           THEN COALESCE(signed_at, (v_signer ->> 'signedAt')::timestamptz, now()) END
      WHERE request_id = v_request.id AND lower(email) = lower(v_signer ->> 'email')
        AND status = 'awaiting' AND v_signer ->> 'status' IN ('signed', 'declined');
    END LOOP;
  END IF;

  IF p_request_status IN ('partly_signed', 'completed', 'declined', 'error') THEN
    UPDATE public.signature_requests
    SET status = p_request_status,
        completed_at = CASE WHEN p_request_status = 'completed' THEN now() END,
        last_event_at = COALESCE(p_event_time, now())
    WHERE id = v_request.id;
  ELSE
    UPDATE public.signature_requests SET last_event_at = COALESCE(p_event_time, now())
    WHERE id = v_request.id;
  END IF;

  IF p_request_status = 'completed' AND v_request.kind = 'tenancy_agreement' THEN
    UPDATE public.onboarding_steps s
    SET status = 'done', completed_at = now()
    FROM public.onboardings o
    WHERE s.onboarding_id = o.id AND o.tenancy_id = v_request.tenancy_id
      AND o.status = 'in_progress' AND s.kind = 'agreement' AND s.status NOT IN ('done', 'skipped');
  END IF;

  RETURN 'applied';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.esign_apply_event(text, text, text, text, text, timestamptz, public.signature_request_status, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.esign_apply_event(text, text, text, text, text, timestamptz, public.signature_request_status, jsonb) TO anon, authenticated;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.add_guarantor(uuid, text, text, text, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.add_guarantor(uuid, text, text, text, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remove_guarantor(uuid, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_guarantor(uuid, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_signature_request(uuid, public.document_template_kind, uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_signature_request(uuid, public.document_template_kind, uuid, uuid, text, text, uuid, jsonb) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attach_signed_document(uuid, uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.attach_signed_document(uuid, uuid) TO authenticated;
