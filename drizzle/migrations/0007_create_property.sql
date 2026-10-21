-- The Add property wizard: one call creates a property, its rooms and, when
-- given, its owner link, in a single transaction. SECURITY INVOKER, so the
-- caller's RLS policies decide which org it may write to, and the audit
-- triggers record every row with the caller as the actor.
CREATE OR REPLACE FUNCTION public.create_property(
  p_org_id uuid,
  p_address_line_1 text,
  p_address_line_2 text,
  p_town text,
  p_postcode text,
  p_council text,
  p_property_type public.property_type,
  p_letting_type public.letting_type,
  p_room_count integer,
  p_room_rent_pence integer,
  p_ownership_type public.ownership_type,
  p_head_rent_pence integer,
  p_owner_id uuid,
  p_new_owner_name text,
  p_new_owner_email text,
  p_new_owner_phone text,
  p_tags text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_property uuid;
  v_owner uuid := p_owner_id;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  IF p_room_count IS NULL OR p_room_count < 1 OR p_room_count > 50 THEN
    RAISE EXCEPTION 'Number of rooms must be between 1 and 50' USING ERRCODE = '22023';
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

  INSERT INTO public.properties (
    org_id, address_line_1, address_line_2, town, postcode, council,
    property_type, letting_type, bedrooms, ownership_type, head_rent_pence, tags
  )
  VALUES (
    p_org_id, p_address_line_1, p_address_line_2, p_town, p_postcode, p_council,
    p_property_type, p_letting_type, p_room_count, p_ownership_type, p_head_rent_pence,
    COALESCE(p_tags, '{}')
  )
  RETURNING id INTO v_property;

  -- A house share is let room by room; a single let is one unit, so that
  -- tenancies always attach to a room.
  IF p_letting_type = 'house_share' THEN
    INSERT INTO public.rooms (org_id, property_id, name, rent_pence)
    SELECT p_org_id, v_property, 'Room ' || n, p_room_rent_pence
    FROM generate_series(1, p_room_count) AS n
    ORDER BY n;
  ELSE
    INSERT INTO public.rooms (org_id, property_id, name, rent_pence)
    VALUES (p_org_id, v_property, 'Whole property', p_room_rent_pence);
  END IF;

  IF p_new_owner_name IS NOT NULL THEN
    INSERT INTO public.owners (org_id, name, email, phone)
    VALUES (p_org_id, p_new_owner_name, p_new_owner_email, p_new_owner_phone)
    RETURNING id INTO v_owner;
  END IF;

  -- The composite foreign key rejects an owner from another org.
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.property_owners (org_id, property_id, owner_id)
    VALUES (p_org_id, v_property, v_owner);
  END IF;

  RETURN v_property;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_property(
  uuid, text, text, text, text, text, public.property_type, public.letting_type, integer,
  integer, public.ownership_type, integer, uuid, text, text, text, text[]
) FROM PUBLIC, anon;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_property(
  uuid, text, text, text, text, text, public.property_type, public.letting_type, integer,
  integer, public.ownership_type, integer, uuid, text, text, text, text[]
) TO authenticated;
