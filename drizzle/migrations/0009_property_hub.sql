-- The property detail page: an archive guard for rooms, a function to change
-- how a property is held, a property's activity history, and a private
-- Storage bucket for documents.

-- A room with a current tenancy can't be archived.
CREATE OR REPLACE FUNCTION private.prevent_archiving_let_room()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' AND EXISTS (
    SELECT 1 FROM public.tenancies t
    WHERE t.room_id = NEW.id AND t.status IN ('active', 'ending')
  ) THEN
    RAISE EXCEPTION 'Rooms with a current tenancy can''t be archived. End the tenancy first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.prevent_archiving_let_room() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER rooms_prevent_archiving_let_room
  BEFORE UPDATE OF status ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION private.prevent_archiving_let_room();--> statement-breakpoint

-- Changes how a property is held, its head rent and its owner in one
-- transaction. Owner links are never deleted: a replaced owner's link is
-- marked removed, and choosing them again reactivates it. SECURITY INVOKER,
-- so RLS applies and the audit triggers record every change.
CREATE OR REPLACE FUNCTION public.set_property_ownership(
  p_property_id uuid,
  p_ownership_type public.ownership_type,
  p_head_rent_pence integer,
  p_owner_id uuid,
  p_new_owner_name text,
  p_new_owner_email text,
  p_new_owner_phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_owner uuid := p_owner_id;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  SELECT org_id INTO v_org FROM public.properties WHERE id = p_property_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_owner_id IS NOT NULL AND p_new_owner_name IS NOT NULL THEN
    RAISE EXCEPTION 'Choose an existing owner or add a new one, not both' USING ERRCODE = '22023';
  END IF;

  IF p_ownership_type = 'owned' AND (p_owner_id IS NOT NULL OR p_new_owner_name IS NOT NULL) THEN
    RAISE EXCEPTION 'A property you own has no separate owner' USING ERRCODE = '22023';
  END IF;

  IF p_ownership_type = 'managed' AND p_owner_id IS NULL AND p_new_owner_name IS NULL THEN
    RAISE EXCEPTION 'A managed property needs an owner' USING ERRCODE = '22023';
  END IF;

  IF p_ownership_type <> 'master_lease' AND p_head_rent_pence IS NOT NULL THEN
    RAISE EXCEPTION 'Only a master lease has a head rent' USING ERRCODE = '22023';
  END IF;

  UPDATE public.properties
  SET ownership_type = p_ownership_type, head_rent_pence = p_head_rent_pence
  WHERE id = p_property_id;

  IF p_new_owner_name IS NOT NULL THEN
    INSERT INTO public.owners (org_id, name, email, phone)
    VALUES (v_org, p_new_owner_name, p_new_owner_email, p_new_owner_phone)
    RETURNING id INTO v_owner;
  END IF;

  UPDATE public.property_owners
  SET status = 'removed'
  WHERE property_id = p_property_id
    AND status = 'active'
    AND owner_id IS DISTINCT FROM v_owner;

  -- The composite foreign key rejects an owner from another org.
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.property_owners (org_id, property_id, owner_id)
    VALUES (v_org, p_property_id, v_owner)
    ON CONFLICT (property_id, owner_id) DO UPDATE
      SET status = 'active'
      WHERE public.property_owners.status <> 'active';
  END IF;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.set_property_ownership(
  uuid, public.ownership_type, integer, uuid, text, text, text
) FROM PUBLIC, anon;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.set_property_ownership(
  uuid, public.ownership_type, integer, uuid, text, text, text
) TO authenticated;--> statement-breakpoint

-- A property's history, newest first: the property, its rooms, owner links,
-- documents (its own and its rooms'), tenancies and tenancy tenants.
-- SECURITY INVOKER, so the audit_log policy applies: only admins see rows.
CREATE OR REPLACE FUNCTION public.property_activity(p_property_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  table_name text,
  record_id uuid,
  action public.audit_action,
  before jsonb,
  after jsonb,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH property AS (
    SELECT p.id, p.org_id FROM public.properties p WHERE p.id = p_property_id
  ),
  property_rooms AS (
    SELECT r.id FROM public.rooms r WHERE r.property_id = p_property_id
  ),
  property_tenancies AS (
    SELECT t.id FROM public.tenancies t WHERE t.room_id IN (SELECT pr.id FROM property_rooms pr)
  )
  SELECT
    a.id, a.table_name, a.record_id, a.action, a.before, a.after, a.created_at,
    a.actor_user_id, COALESCE(u.full_name, u.email)
  FROM public.audit_log a
  JOIN property ON property.org_id = a.org_id
  LEFT JOIN public.users u ON u.id = a.actor_user_id
  WHERE
    (a.table_name = 'properties' AND a.record_id = property.id)
    OR (a.table_name IN ('rooms', 'property_owners', 'documents')
        AND COALESCE(a.after, a.before) ->> 'property_id' = property.id::text)
    OR (a.table_name = 'documents'
        AND (COALESCE(a.after, a.before) ->> 'room_id')::uuid IN (SELECT pr.id FROM property_rooms pr))
    OR (a.table_name = 'tenancies' AND a.record_id IN (SELECT pt.id FROM property_tenancies pt))
    OR (a.table_name = 'tenancy_tenants'
        AND (COALESCE(a.after, a.before) ->> 'tenancy_id')::uuid IN (SELECT pt.id FROM property_tenancies pt))
  ORDER BY a.created_at DESC, a.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.property_activity(uuid, integer) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.property_activity(uuid, integer) TO authenticated;--> statement-breakpoint

-- Documents live in a private bucket, one folder per org:
--   <org_id>/properties/<property_id>/<random>-<file name>
-- Members can view and upload their org's files. Nobody can overwrite or
-- delete them through the API, because documents are never hard deleted.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

-- The org id from a Storage path's first folder, or null if it isn't a uuid.
CREATE OR REPLACE FUNCTION private.org_folder(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN split_part(object_name, '/', 1)::uuid
  END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.org_folder(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.org_folder(text) TO authenticated;--> statement-breakpoint

CREATE POLICY "Members can view their organisation's documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (SELECT private.is_org_member(private.org_folder(name))));--> statement-breakpoint

CREATE POLICY "Members can upload documents to their organisation"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (SELECT private.is_org_member(private.org_folder(name))));
