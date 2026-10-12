-- Row level security, audit logging and organisation onboarding.
-- RLS is enabled on every table in 0000; this migration adds the policies.
-- Clients only ever connect as `anon` or `authenticated`; nothing here grants
-- write access to tables directly. Writes go through policies or the
-- security definer functions below.

-- Helpers live in a schema that the Supabase Data API does not expose.
CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint

-- Security definer so policies can check memberships without recursing into
-- the memberships policies.
CREATE OR REPLACE FUNCTION private.is_org_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.has_org_role(target_org uuid, required_role public.membership_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.role = required_role
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.is_org_member(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.has_org_role(uuid, public.membership_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, public.membership_role) TO authenticated;--> statement-breakpoint

-- Signed-out visitors get nothing.
REVOKE ALL ON public.organisations, public.memberships, public.audit_log FROM anon;--> statement-breakpoint
-- The audit log is append-only and written by triggers only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;--> statement-breakpoint

-- organisations
CREATE POLICY "Members can view their organisations"
  ON public.organisations FOR SELECT TO authenticated
  USING ((SELECT private.is_org_member(id)));--> statement-breakpoint

-- memberships
CREATE POLICY "Users can view their own memberships"
  ON public.memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));--> statement-breakpoint

CREATE POLICY "Admins can view memberships in their organisation"
  ON public.memberships FOR SELECT TO authenticated
  USING ((SELECT private.has_org_role(org_id, 'org_admin')));--> statement-breakpoint

-- audit_log
CREATE POLICY "Admins can view their organisation's audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING ((SELECT private.has_org_role(org_id, 'org_admin')));--> statement-breakpoint

-- updated_at maintenance
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER organisations_set_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();--> statement-breakpoint

CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();--> statement-breakpoint

-- Generic audit trigger. Every audited table has an `id` uuid column and
-- either is `organisations` or carries `org_id`.
CREATE OR REPLACE FUNCTION private.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_org uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_before := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_after := to_jsonb(NEW);
  END IF;
  v_row := COALESCE(v_after, v_before);

  IF TG_TABLE_NAME = 'organisations' THEN
    v_org := (v_row ->> 'id')::uuid;
  ELSE
    v_org := (v_row ->> 'org_id')::uuid;
  END IF;

  INSERT INTO public.audit_log (org_id, actor_user_id, table_name, record_id, action, before, after)
  VALUES (
    v_org,
    (SELECT auth.uid()),
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    lower(TG_OP)::public.audit_action,
    v_before,
    v_after
  );

  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.write_audit_log() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER organisations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION private.write_audit_log();--> statement-breakpoint

CREATE TRIGGER memberships_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.write_audit_log();--> statement-breakpoint

-- Onboarding: create an organisation and make the caller its admin in one
-- transaction. The audit triggers record both rows.
CREATE OR REPLACE FUNCTION public.create_organisation(org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_name text := btrim(org_name);
  v_org uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Organisation name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organisations (name) VALUES (v_name) RETURNING id INTO v_org;
  INSERT INTO public.memberships (org_id, user_id, role) VALUES (v_org, v_user, 'org_admin');

  RETURN v_org;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_organisation(text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_organisation(text) TO authenticated;
