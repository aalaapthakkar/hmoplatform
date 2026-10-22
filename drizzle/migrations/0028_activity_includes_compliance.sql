-- A property's activity also covers its compliance items and the
-- certificates served to its tenants.
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
    OR (a.table_name IN ('rooms', 'property_owners', 'documents', 'property_services', 'certificate_services')
        AND COALESCE(a.after, a.before) ->> 'property_id' = property.id::text)
    OR (a.table_name = 'documents'
        AND (COALESCE(a.after, a.before) ->> 'room_id')::uuid IN (SELECT pr.id FROM property_rooms pr))
    OR (a.table_name = 'tenancies' AND a.record_id IN (SELECT pt.id FROM property_tenancies pt))
    OR (a.table_name IN ('tenancy_tenants', 'tenancy_guarantors', 'signature_requests')
        AND (COALESCE(a.after, a.before) ->> 'tenancy_id')::uuid IN (SELECT pt.id FROM property_tenancies pt))
  ORDER BY a.created_at DESC, a.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;
