-- Row level security, history and integrity for the business tables.
-- Every table here has org_id. Active members of an org (admin or staff) can
-- read, add and edit its rows. Nothing is ever deleted: records are retired
-- through their status column, and every change is written to audit_log.

-- A row must stay in the org it was created in.
CREATE OR REPLACE FUNCTION private.prevent_org_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'Records cannot move to another organisation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Blocks hard deletes for every role, including migrations and the dashboard.
CREATE OR REPLACE FUNCTION private.prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted. Change the status instead.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.prevent_org_change() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.prevent_delete() FROM PUBLIC;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'properties', 'rooms', 'tenants', 'tenancies', 'tenancy_tenants',
    'owners', 'property_owners', 'documents'
  ]
  LOOP
    -- Signed-out visitors get nothing; signed-in users can never delete.
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
$$;
