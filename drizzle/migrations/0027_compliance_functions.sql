-- Compliance: RLS for the new tables, the default service types every
-- organisation starts with, the compliance_items view that works out each
-- item's status, the daily job that opens maintenance jobs, and the reminder
-- data the email job reads (guarded by a secret, so no Supabase secret key).

-- ===== Business tables =====

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_types', 'property_services', 'certificate_services', 'certificate_service_recipients'
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

-- A record of serving a certificate is never edited.
REVOKE UPDATE ON public.certificate_services, public.certificate_service_recipients FROM authenticated;--> statement-breakpoint
DROP POLICY "Members can edit their organisation's certificate_services" ON public.certificate_services;--> statement-breakpoint
DROP POLICY "Members can edit their organisation's certificate_service_recipients" ON public.certificate_service_recipients;--> statement-breakpoint

-- Not even functions that get round the grants can change the record.
CREATE OR REPLACE FUNCTION private.prevent_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'This record can''t be changed.' USING ERRCODE = 'P0001';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.prevent_update() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER certificate_services_no_update BEFORE UPDATE ON public.certificate_services
  FOR EACH ROW EXECUTE FUNCTION private.prevent_update();--> statement-breakpoint
CREATE TRIGGER certificate_service_recipients_no_update
  BEFORE UPDATE ON public.certificate_service_recipients
  FOR EACH ROW EXECUTE FUNCTION private.prevent_update();--> statement-breakpoint

-- Only admins set up service types; everyone in the organisation can see them.
CREATE OR REPLACE FUNCTION private.is_org_admin(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active' AND m.role = 'admin'
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.is_org_admin(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.is_org_admin(uuid) TO authenticated;--> statement-breakpoint

DROP POLICY "Members can add service_types to their organisation" ON public.service_types;--> statement-breakpoint
DROP POLICY "Members can edit their organisation's service_types" ON public.service_types;--> statement-breakpoint
CREATE POLICY "Admins can add service types" ON public.service_types
  FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_org_admin(org_id)));--> statement-breakpoint
CREATE POLICY "Admins can edit service types" ON public.service_types
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_org_admin(org_id)))
  WITH CHECK ((SELECT private.is_org_admin(org_id)));--> statement-breakpoint

-- ===== Extra fields =====

-- A type's extra fields: up to 20 of { key, label, kind, options }, with
-- unique keys. Choices need a list of options.
CREATE OR REPLACE FUNCTION private.check_service_type_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  f jsonb;
  v_keys text[] := '{}';
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(NEW.fields) LOOP
    IF jsonb_typeof(f) <> 'object'
      OR coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$'
      OR char_length(coalesce(f->>'label', '')) NOT BETWEEN 1 AND 60
      OR coalesce(f->>'kind', '') NOT IN ('text', 'number', 'date', 'long_text', 'choice')
      OR (f->>'kind' = 'choice' AND (
        jsonb_typeof(f->'options') IS DISTINCT FROM 'array'
        OR jsonb_array_length(f->'options') NOT BETWEEN 1 AND 20))
    THEN
      RAISE EXCEPTION 'Each extra field needs a name, a label and a kind (choices need options).'
        USING ERRCODE = 'P0001';
    END IF;
    IF (f->>'key') = ANY (v_keys) THEN
      RAISE EXCEPTION 'Two extra fields have the same name.' USING ERRCODE = 'P0001';
    END IF;
    v_keys := v_keys || (f->>'key');
  END LOOP;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER service_types_check_fields BEFORE INSERT OR UPDATE OF fields ON public.service_types
  FOR EACH ROW EXECUTE FUNCTION private.check_service_type_fields();--> statement-breakpoint

-- An item's details must answer its type's fields: known keys only, numbers
-- as numbers, dates as dates, choices from the list, text up to 2,000 characters.
CREATE OR REPLACE FUNCTION private.check_property_service_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fields jsonb;
  d record;
  f jsonb;
BEGIN
  SELECT fields INTO v_fields FROM public.service_types
  WHERE id = NEW.service_type_id AND org_id = NEW.org_id;
  FOR d IN SELECT * FROM jsonb_each(NEW.details) LOOP
    SELECT x INTO f FROM jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) x
    WHERE x->>'key' = d.key;
    IF f IS NULL THEN
      RAISE EXCEPTION 'That detail isn''t one this type records.' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(d.value) = 'null' THEN
      CONTINUE;
    END IF;
    IF (f->>'kind' = 'number' AND jsonb_typeof(d.value) <> 'number')
      OR (f->>'kind' <> 'number' AND jsonb_typeof(d.value) <> 'string')
      OR (f->>'kind' = 'date' AND (d.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$')
      OR (f->>'kind' = 'choice' AND NOT (f->'options') ? (d.value #>> '{}'))
      OR (jsonb_typeof(d.value) = 'string' AND char_length(d.value #>> '{}') > 2000)
    THEN
      RAISE EXCEPTION 'Check the value for %.', f->>'label' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER property_services_check_details BEFORE INSERT OR UPDATE ON public.property_services
  FOR EACH ROW EXECUTE FUNCTION private.check_property_service_details();--> statement-breakpoint

-- ===== Default service types =====

-- The types every organisation starts with. Periods and alert windows are
-- starting points each organisation can change.
CREATE OR REPLACE FUNCTION private.add_default_service_types(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.service_types
    (org_id, system_key, name, category, validity_months, alert_window_days, requires_document,
     document_type, auto_create_job, expiry_label, fields)
  VALUES
    (p_org_id, 'gas_safety', 'Gas safety certificate', 'gas', 12, 60, true, 'gas_safety', true, 'Expires', '[]'),
    (p_org_id, 'eicr', 'Electrical installation condition report (EICR)', 'electrical', 60, 90, true, 'eicr', true, 'Expires', '[]'),
    (p_org_id, 'epc', 'Energy performance certificate (EPC)', 'energy', 120, 90, true, 'epc', false, 'Expires',
      '[{"key":"rating","label":"Rating","kind":"choice","options":["A","B","C","D","E","F","G"]}]'),
    (p_org_id, 'smoke_alarms', 'Smoke and carbon monoxide alarm test', 'fire', 1, 7, false, 'other', false, 'Next test due', '[]'),
    (p_org_id, 'emergency_lighting', 'Emergency lighting test', 'fire', 12, 30, true, 'other', true, 'Next test due', '[]'),
    (p_org_id, 'fire_extinguishers', 'Fire extinguisher service', 'fire', 12, 30, true, 'other', true, 'Next service due', '[]'),
    (p_org_id, 'fire_doors', 'Fire door inspection', 'fire', 6, 30, false, 'other', true, 'Next inspection due', '[]'),
    (p_org_id, 'hmo_licence', 'HMO licence', 'licence', 60, 120, true, 'hmo_licence', false, 'Expires',
      '[{"key":"licence_number","label":"Licence number","kind":"text"},
        {"key":"scheme","label":"Scheme","kind":"choice","options":["Mandatory","Additional","Selective"]},
        {"key":"max_occupants","label":"Maximum occupants","kind":"number"},
        {"key":"max_households","label":"Maximum households","kind":"number"},
        {"key":"conditions","label":"Conditions","kind":"long_text"}]'),
    (p_org_id, 'boiler_service', 'Boiler service', 'gas', 12, 30, true, 'other', true, 'Next service due', '[]'),
    (p_org_id, 'pat', 'Portable appliance testing (PAT)', 'electrical', 12, 30, true, 'other', true, 'Next test due', '[]'),
    (p_org_id, 'damp_mould', 'Damp and mould inspection', 'health_and_safety', 6, 30, false, 'other', true, 'Next inspection due', '[]'),
    (p_org_id, 'building_insurance', 'Building insurance', 'insurance', 12, 30, true, 'other', false, 'Renewal date',
      '[{"key":"insurer","label":"Insurer","kind":"text"},
        {"key":"policy_number","label":"Policy number","kind":"text"}]'),
    (p_org_id, 'landlord_registration', 'Landlord registration', 'licence', NULL, 60, false, 'other', false, 'Renewal date',
      '[{"key":"landlord_number","label":"Landlord registration number","kind":"text"},
        {"key":"property_number","label":"Property registration number","kind":"text"}]')
  ON CONFLICT (org_id, system_key) DO NOTHING
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.add_default_service_types(uuid) FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.organisation_default_service_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.add_default_service_types(NEW.id);
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.organisation_default_service_types() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER organisations_default_service_types
  AFTER INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION private.organisation_default_service_types();--> statement-breakpoint

SELECT private.add_default_service_types(id) FROM public.organisations;--> statement-breakpoint

-- Certificates already uploaded become the starting point: the newest active
-- property document of each kind, with its expiry date.
INSERT INTO public.property_services (org_id, property_id, service_type_id, expires_on, document_id)
SELECT DISTINCT ON (d.property_id, t.id)
  d.org_id, d.property_id, t.id, d.expiry_date, d.id
FROM public.documents d
JOIN public.service_types t
  ON t.org_id = d.org_id
  AND t.system_key = CASE d.document_type
    WHEN 'gas_safety' THEN 'gas_safety'
    WHEN 'eicr' THEN 'eicr'
    WHEN 'epc' THEN 'epc'
    WHEN 'hmo_licence' THEN 'hmo_licence'
  END
WHERE d.property_id IS NOT NULL AND d.status = 'active'
ORDER BY d.property_id, t.id, d.expiry_date DESC NULLS LAST, d.created_at DESC
ON CONFLICT (property_id, service_type_id) DO NOTHING;--> statement-breakpoint

-- ===== Status =====

-- Every active property against every active type in its organisation, with
-- where it stands. Status, in order: not needed; missing (never recorded, no
-- date, or a required certificate isn't uploaded yet, unless already
-- overdue); overdue (expired before today in London); due soon (within the
-- alert window); ok. Runs as the caller, so RLS applies.
CREATE VIEW public.compliance_items WITH (security_invoker = true) AS
SELECT
  p.org_id,
  p.id AS property_id,
  t.id AS service_type_id,
  ps.id AS property_service_id,
  t.name AS service_name,
  t.category,
  t.system_key,
  t.validity_months,
  t.alert_window_days,
  t.requires_document,
  t.auto_create_job,
  t.expiry_label,
  ps.last_done_on,
  ps.expires_on,
  ps.document_id,
  ps.notes,
  coalesce(ps.details, '{}'::jsonb) AS details,
  coalesce(ps.not_required, false) AS not_required,
  ps.not_required_reason,
  ps.expires_on - private.today_in_london() AS days_left,
  CASE
    WHEN ps.not_required THEN 'not_needed'
    WHEN ps.id IS NULL OR ps.expires_on IS NULL THEN 'missing'
    WHEN ps.expires_on < private.today_in_london() THEN 'overdue'
    WHEN t.requires_document AND ps.document_id IS NULL THEN 'missing'
    WHEN ps.expires_on <= private.today_in_london() + t.alert_window_days THEN 'due_soon'
    ELSE 'ok'
  END AS status
FROM public.properties p
JOIN public.service_types t ON t.org_id = p.org_id AND t.status = 'active'
LEFT JOIN public.property_services ps
  ON ps.property_id = p.id AND ps.service_type_id = t.id
WHERE p.status = 'active';--> statement-breakpoint

REVOKE ALL ON public.compliance_items FROM PUBLIC, anon;--> statement-breakpoint
GRANT SELECT ON public.compliance_items TO authenticated;--> statement-breakpoint

-- ===== Daily maintenance jobs =====

-- Opens one maintenance job per item that has entered its alert window (or
-- expired), for types set to do so. Once per expiry date, so renewing the
-- item (a new expiry date) starts afresh. Returns how many it opened.
CREATE OR REPLACE FUNCTION private.run_daily_compliance(p_as_of date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_as_of date := COALESCE(p_as_of, private.today_in_london());
  v_count int;
BEGIN
  INSERT INTO public.maintenance_requests
    (org_id, property_id, title, description, urgency, property_service_id, due_cycle)
  SELECT ps.org_id, ps.property_id,
    left(t.name, 98) || ' due by ' || to_char(ps.expires_on, 'DD/MM/YYYY'),
    'Opened by the daily compliance check: ' || t.name || ' '
      || CASE WHEN ps.expires_on < v_as_of THEN 'expired on ' ELSE 'is due by ' END
      || to_char(ps.expires_on, 'DD/MM/YYYY')
      || '. Book it in, then record the new date on the property''s Compliance page.',
    CASE WHEN ps.expires_on < v_as_of THEN 'urgent' ELSE 'normal' END::public.maintenance_urgency,
    ps.id, ps.expires_on
  FROM public.property_services ps
  JOIN public.service_types t ON t.id = ps.service_type_id
  JOIN public.properties p ON p.id = ps.property_id
  WHERE t.status = 'active' AND t.auto_create_job AND p.status = 'active'
    AND NOT ps.not_required AND ps.expires_on IS NOT NULL
    AND ps.expires_on <= v_as_of + t.alert_window_days
  ON CONFLICT (property_service_id, due_cycle) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.run_daily_compliance(date) FROM PUBLIC;--> statement-breakpoint

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule(
      'daily-compliance', '45 0 * * *', 'SELECT private.run_daily_compliance()');
  END IF;
END
$do$;--> statement-breakpoint

-- ===== Reminder emails =====

-- Admins get compliance reminders by default; staff choose to.
UPDATE public.memberships SET compliance_emails = true WHERE role = 'admin';--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.default_compliance_emails()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.compliance_emails := NEW.role = 'admin';
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER memberships_default_compliance_emails BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.default_compliance_emails();--> statement-breakpoint

-- Each person sets their own reminder emails, in every organisation they're in.
CREATE OR REPLACE FUNCTION public.set_my_compliance_emails(p_on boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.memberships SET compliance_emails = p_on
  WHERE user_id = (SELECT auth.uid()) AND status = 'active'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_my_compliance_emails(boolean) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_my_compliance_emails(boolean) TO authenticated;--> statement-breakpoint

-- Secrets the app's scheduled jobs prove they know (stored as hashes only).
CREATE TABLE private.app_secrets (
  name text PRIMARY KEY,
  secret_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON private.app_secrets FROM PUBLIC, anon, authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.check_cron_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_secret IS NULL OR char_length(p_secret) < 32 OR NOT EXISTS (
    SELECT 1 FROM private.app_secrets
    WHERE name = 'cron' AND secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '28000';
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.check_cron_secret(text) FROM PUBLIC;--> statement-breakpoint

-- Reminders already emailed: one per item, expiry date, kind and person.
CREATE TABLE private.compliance_reminders_sent (
  property_service_id uuid NOT NULL REFERENCES public.property_services (id),
  expires_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('due_soon', 'overdue')),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_service_id, expires_on, kind, user_id)
);--> statement-breakpoint
ALTER TABLE private.compliance_reminders_sent ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON private.compliance_reminders_sent FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- What the daily email job should send: items that have entered their alert
-- window or expired, for each person in that organisation who wants
-- reminders, that they haven't been sent before. Catches up after a missed day.
CREATE OR REPLACE FUNCTION public.compliance_reminder_batch(p_secret text, p_as_of date DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  org_id uuid,
  org_name text,
  property_service_id uuid,
  property_id uuid,
  property_label text,
  service_name text,
  expires_on date,
  kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_as_of date := COALESCE(p_as_of, private.today_in_london());
BEGIN
  PERFORM private.check_cron_secret(p_secret);
  RETURN QUERY
  WITH due AS (
    SELECT ps.id, ps.org_id, ps.property_id, ps.expires_on, t.name,
      CASE WHEN ps.expires_on < v_as_of THEN 'overdue' ELSE 'due_soon' END AS kind,
      p.address_line_1 || ', ' || p.postcode AS label
    FROM public.property_services ps
    JOIN public.service_types t ON t.id = ps.service_type_id
    JOIN public.properties p ON p.id = ps.property_id
    WHERE t.status = 'active' AND p.status = 'active' AND NOT ps.not_required
      AND ps.expires_on IS NOT NULL
      AND ps.expires_on <= v_as_of + t.alert_window_days
  )
  SELECT m.user_id, u.email, u.full_name, d.org_id, o.name, d.id, d.property_id, d.label,
    d.name, d.expires_on, d.kind
  FROM due d
  JOIN public.memberships m ON m.org_id = d.org_id AND m.status = 'active' AND m.compliance_emails
  JOIN public.users u ON u.id = m.user_id AND u.email IS NOT NULL
  JOIN public.organisations o ON o.id = d.org_id
  WHERE NOT EXISTS (
    SELECT 1 FROM private.compliance_reminders_sent s
    WHERE s.property_service_id = d.id AND s.expires_on = d.expires_on
      AND s.kind = d.kind AND s.user_id = m.user_id
  )
  ORDER BY m.user_id, d.expires_on;
END;
$$;--> statement-breakpoint

-- Notes the reminders the email job sent: [{ property_service_id,
-- expires_on, kind, user_id }], so nobody is told twice.
CREATE OR REPLACE FUNCTION public.record_compliance_reminders(p_secret text, p_sent jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM private.check_cron_secret(p_secret);
  INSERT INTO private.compliance_reminders_sent (property_service_id, expires_on, kind, user_id)
  SELECT (x->>'property_service_id')::uuid, (x->>'expires_on')::date, x->>'kind', (x->>'user_id')::uuid
  FROM jsonb_array_elements(p_sent) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.compliance_reminder_batch(text, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.compliance_reminder_batch(text, date) TO anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_compliance_reminders(text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_compliance_reminders(text, jsonb) TO anon;
