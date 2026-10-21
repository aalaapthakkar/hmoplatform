-- Tenancies: creating them, giving notice, ending, moving in and cancelling.
-- All functions are SECURITY INVOKER, so RLS decides what the caller can
-- touch and the audit triggers record every change with the caller as actor.
-- Messages raised with ERRCODE P0001 are written for people and shown as-is.

-- Today's date in England, for comparing with tenancy dates.
CREATE OR REPLACE FUNCTION private.today_in_london()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Europe/London')::date
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.today_in_london() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.today_in_london() TO authenticated;--> statement-breakpoint

-- A tenancy only moves forward: upcoming -> current or cancelled,
-- current -> ending (notice given) -> ended. History is never rewritten.
CREATE OR REPLACE FUNCTION private.check_tenancy_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status
    OR (OLD.status = 'prospective' AND NEW.status IN ('active', 'cancelled'))
    OR (OLD.status = 'active' AND NEW.status = 'ending')
    OR (OLD.status = 'ending' AND NEW.status = 'ended')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A tenancy can''t go from % to %.', OLD.status, NEW.status
    USING ERRCODE = 'P0001';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.check_tenancy_transition() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER tenancies_check_transition
  BEFORE UPDATE OF status ON public.tenancies
  FOR EACH ROW EXECUTE FUNCTION private.check_tenancy_transition();--> statement-breakpoint

-- Keeps a room's status in step with its tenancies: Let while one is current,
-- Available again once none is. Archived rooms are never touched, and an
-- Unavailable room only changes when someone moves in.
CREATE OR REPLACE FUNCTION private.sync_room_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenancies t
    WHERE t.room_id = NEW.room_id AND t.status IN ('active', 'ending')
  ) THEN
    UPDATE public.rooms SET status = 'let'
    WHERE id = NEW.room_id AND status IN ('available', 'unavailable');
  ELSE
    UPDATE public.rooms SET status = 'available'
    WHERE id = NEW.room_id AND status = 'let';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.sync_room_status() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER tenancies_sync_room_status
  AFTER INSERT OR UPDATE OF status ON public.tenancies
  FOR EACH ROW EXECUTE FUNCTION private.sync_room_status();--> statement-breakpoint

-- Lets a room: creates the tenant, the tenancy and the link between them.
-- A start date in the future makes it upcoming (prospective); today or
-- earlier makes it current (active). Tenancies are periodic: no end date.
CREATE OR REPLACE FUNCTION public.create_tenancy(
  p_room_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_start_date date,
  p_rent_pence integer,
  p_rent_frequency public.rent_frequency,
  p_rent_due_day integer,
  p_deposit_pence integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_room_status public.room_status;
  v_status public.tenancy_status;
  v_has_current boolean;
  v_current_end date;
  v_tenant uuid;
  v_tenancy uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  SELECT org_id, status INTO v_org, v_room_status FROM public.rooms WHERE id = p_room_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_room_status = 'archived' THEN
    RAISE EXCEPTION 'This room is archived, so it can''t be let.' USING ERRCODE = 'P0001';
  END IF;

  v_status := CASE WHEN p_start_date > private.today_in_london() THEN 'prospective' ELSE 'active' END;

  SELECT true, t.end_date INTO v_has_current, v_current_end
  FROM public.tenancies t
  WHERE t.room_id = p_room_id AND t.status IN ('active', 'ending');

  IF v_status = 'active' AND v_has_current THEN
    RAISE EXCEPTION 'This room already has a current tenancy. Give the new one a start date in the future, or end the current tenancy first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'prospective' THEN
    IF EXISTS (
      SELECT 1 FROM public.tenancies t WHERE t.room_id = p_room_id AND t.status = 'prospective'
    ) THEN
      RAISE EXCEPTION 'This room already has an upcoming tenancy. Cancel it before adding another.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_current_end IS NOT NULL AND p_start_date < v_current_end THEN
      RAISE EXCEPTION 'The current tenancy ends on %. Choose a start date on or after that day.',
        to_char(v_current_end, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.tenants (org_id, first_name, last_name, email, phone)
  VALUES (v_org, p_first_name, p_last_name, p_email, p_phone)
  RETURNING id INTO v_tenant;

  INSERT INTO public.tenancies (
    org_id, room_id, start_date, status, rent_pence, rent_frequency, rent_due_day, deposit_pence
  )
  VALUES (
    v_org, p_room_id, p_start_date, v_status, p_rent_pence, p_rent_frequency, p_rent_due_day,
    p_deposit_pence
  )
  RETURNING id INTO v_tenancy;

  INSERT INTO public.tenancy_tenants (org_id, tenancy_id, tenant_id)
  VALUES (v_org, v_tenancy, v_tenant);

  RETURN v_tenancy;
END;
$$;--> statement-breakpoint

-- Records notice on a current tenancy (or corrects it): it becomes ending.
CREATE OR REPLACE FUNCTION public.give_tenancy_notice(
  p_tenancy_id uuid,
  p_end_reason public.tenancy_end_reason,
  p_notice_date date,
  p_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.tenancy_status;
  v_start date;
BEGIN
  SELECT status, start_date INTO v_status, v_start FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Only a current tenancy can be given notice.' USING ERRCODE = 'P0001';
  END IF;
  IF p_notice_date < v_start OR p_end_date < v_start THEN
    RAISE EXCEPTION 'The dates can''t be before the tenancy started on %.',
      to_char(v_start, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;
  IF p_notice_date > p_end_date THEN
    RAISE EXCEPTION 'The notice date must be on or before the end date.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenancies
  SET status = 'ending', end_reason = p_end_reason, notice_date = p_notice_date, end_date = p_end_date
  WHERE id = p_tenancy_id;
END;
$$;--> statement-breakpoint

-- Confirms a tenancy has ended, once its end date has come.
CREATE OR REPLACE FUNCTION public.end_tenancy(p_tenancy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.tenancy_status;
  v_end date;
BEGIN
  SELECT status, end_date INTO v_status, v_end FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'ending' THEN
    RAISE EXCEPTION 'Record the notice before marking the tenancy as ended.' USING ERRCODE = 'P0001';
  END IF;
  IF v_end > private.today_in_london() THEN
    RAISE EXCEPTION 'This tenancy ends on %. You can mark it as ended from that day.',
      to_char(v_end, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenancies SET status = 'ended' WHERE id = p_tenancy_id;
END;
$$;--> statement-breakpoint

-- Moves an upcoming tenant in, once the start date has come and the room is free.
CREATE OR REPLACE FUNCTION public.start_tenancy(p_tenancy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.tenancy_status;
  v_start date;
  v_room uuid;
BEGIN
  SELECT status, start_date, room_id INTO v_status, v_start, v_room
  FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'prospective' THEN
    RAISE EXCEPTION 'Only an upcoming tenancy can start.' USING ERRCODE = 'P0001';
  END IF;
  IF v_start > private.today_in_london() THEN
    RAISE EXCEPTION 'This tenancy starts on %. You can move the tenant in from that day.',
      to_char(v_start, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenancies t WHERE t.room_id = v_room AND t.status IN ('active', 'ending')
  ) THEN
    RAISE EXCEPTION 'The room''s current tenancy hasn''t ended yet. Mark it as ended first.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenancies SET status = 'active' WHERE id = p_tenancy_id;
END;
$$;--> statement-breakpoint

-- An upcoming tenancy that won't go ahead. Kept, but marked cancelled.
CREATE OR REPLACE FUNCTION public.cancel_tenancy(p_tenancy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.tenancy_status;
BEGIN
  SELECT status INTO v_status FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'prospective' THEN
    RAISE EXCEPTION 'Only an upcoming tenancy can be cancelled.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenancies SET status = 'cancelled' WHERE id = p_tenancy_id;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_tenancy(
  uuid, text, text, text, text, date, integer, public.rent_frequency, integer, integer
) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_tenancy(
  uuid, text, text, text, text, date, integer, public.rent_frequency, integer, integer
) TO authenticated;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.give_tenancy_notice(uuid, public.tenancy_end_reason, date, date)
  FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.give_tenancy_notice(uuid, public.tenancy_end_reason, date, date)
  TO authenticated;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.end_tenancy(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.end_tenancy(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_tenancy(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_tenancy(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cancel_tenancy(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cancel_tenancy(uuid) TO authenticated;
