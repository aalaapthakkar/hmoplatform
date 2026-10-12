-- User profiles: access rules and syncing from Supabase Auth.
-- public.users has no org_id (one person can belong to several orgs), so it
-- is not written to the org-scoped audit log.

REVOKE ALL ON public.users FROM anon;--> statement-breakpoint
-- Profiles are created by the trigger below. Users may only edit their name.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.users FROM authenticated;--> statement-breakpoint
GRANT UPDATE (full_name) ON public.users TO authenticated;--> statement-breakpoint

-- True when the signed-in user and target_user are both active members of
-- at least one organisation.
CREATE OR REPLACE FUNCTION private.shares_org_with(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships mine
    JOIN public.memberships theirs ON theirs.org_id = mine.org_id
    WHERE mine.user_id = (SELECT auth.uid())
      AND mine.status = 'active'
      AND theirs.user_id = target_user
      AND theirs.status = 'active'
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.shares_org_with(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.shares_org_with(uuid) TO authenticated;--> statement-breakpoint

CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));--> statement-breakpoint

CREATE POLICY "Members can view people in their organisations"
  ON public.users FOR SELECT TO authenticated
  USING ((SELECT private.shares_org_with(id)));--> statement-breakpoint

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));--> statement-breakpoint

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();--> statement-breakpoint

-- Keep a profile for every auth user. The name is taken from sign-up
-- metadata once; after that the user owns it. Email changes are copied over.
CREATE OR REPLACE FUNCTION private.sync_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.sync_user_profile() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER on_auth_user_saved
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_user_profile();
