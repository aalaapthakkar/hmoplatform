CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Hand-edited: profiles for anyone who signed up before this migration, so
-- the new memberships -> users foreign key below can be added.
INSERT INTO public.users (id, email, full_name)
SELECT id, email, raw_user_meta_data ->> 'full_name' FROM auth.users
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_users_id_fk";
--> statement-breakpoint
-- Hand-edited: membership roles narrow to admin and staff. Policies and the
-- helper that use the old type are dropped here and recreated below.
DROP POLICY "Admins can view memberships in their organisation" ON public.memberships;--> statement-breakpoint
DROP POLICY "Admins can view their organisation's audit log" ON public.audit_log;--> statement-breakpoint
DROP FUNCTION private.has_org_role(uuid, public.membership_role);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.memberships WHERE role::text NOT IN ('org_admin', 'staff')) THEN
    RAISE EXCEPTION 'Some memberships use a role other than org_admin or staff. Move them to admin or staff by hand, then rerun this migration.';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE public.memberships SET role = 'admin' WHERE role = 'org_admin';--> statement-breakpoint
DROP TYPE "public"."membership_role";--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'staff');--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "role" SET DATA TYPE "public"."membership_role" USING "role"::"public"."membership_role";--> statement-breakpoint
CREATE FUNCTION private.has_org_role(target_org uuid, required_role public.membership_role)
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
REVOKE ALL ON FUNCTION private.has_org_role(uuid, public.membership_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, public.membership_role) TO authenticated;--> statement-breakpoint
CREATE POLICY "Admins can view memberships in their organisation"
  ON public.memberships FOR SELECT TO authenticated
  USING ((SELECT private.has_org_role(org_id, 'admin')));--> statement-breakpoint
CREATE POLICY "Admins can view their organisation's audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING ((SELECT private.has_org_role(org_id, 'admin')));--> statement-breakpoint
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
  INSERT INTO public.memberships (org_id, user_id, role) VALUES (v_org, v_user, 'admin');

  RETURN v_org;
END;
$$;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
