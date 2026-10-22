-- The rent ledger: append-only charges and payments, reversals as the only
-- way to put a mistake right, the rent schedule (with pro rata first and last
-- periods), and the daily job that brings every tenancy's charges up to date.

-- ===== Append-only =====

REVOKE UPDATE ON public.rent_charges, public.rent_payments FROM authenticated;--> statement-breakpoint
DROP POLICY "Members can edit their organisation's rent_charges" ON public.rent_charges;--> statement-breakpoint
DROP POLICY "Members can edit their organisation's rent_payments" ON public.rent_payments;--> statement-breakpoint

-- Even functions that bypass the grants can't edit a ledger row.
CREATE OR REPLACE FUNCTION private.prevent_ledger_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries can''t be changed. Reverse the entry instead.'
    USING ERRCODE = 'P0001';
END;
$$;--> statement-breakpoint

CREATE TRIGGER rent_charges_no_update BEFORE UPDATE ON public.rent_charges
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_update();--> statement-breakpoint
CREATE TRIGGER rent_payments_no_update BEFORE UPDATE ON public.rent_payments
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_update();--> statement-breakpoint

-- ===== Reversals =====

-- A charge reversal copies the charge it cancels (same tenancy, kind and
-- amount), carries the reason as its description, and has no period. A
-- reversal can't itself be reversed, and a charge is reversed only once.
CREATE OR REPLACE FUNCTION private.check_charge_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.rent_charges;
BEGIN
  IF NEW.reverses_charge_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM public.rent_charges
  WHERE id = NEW.reverses_charge_id AND org_id = NEW.org_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'That entry isn''t on this ledger.' USING ERRCODE = 'P0001';
  END IF;
  IF o.reverses_charge_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal can''t be reversed. Add a new charge instead.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rent_charges WHERE reverses_charge_id = o.id) THEN
    RAISE EXCEPTION 'That charge has already been reversed.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(trim(coalesce(NEW.description, ''))) = 0 THEN
    RAISE EXCEPTION 'Give a reason for the reversal.' USING ERRCODE = 'P0001';
  END IF;
  NEW.tenancy_id := o.tenancy_id;
  NEW.kind := o.kind;
  NEW.amount_pence := o.amount_pence;
  NEW.period_start := NULL;
  NEW.period_end := NULL;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.check_payment_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.rent_payments;
BEGIN
  IF NEW.reverses_payment_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM public.rent_payments
  WHERE id = NEW.reverses_payment_id AND org_id = NEW.org_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'That entry isn''t on this ledger.' USING ERRCODE = 'P0001';
  END IF;
  IF o.reverses_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal can''t be reversed. Record the payment again instead.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rent_payments WHERE reverses_payment_id = o.id) THEN
    RAISE EXCEPTION 'That payment has already been reversed.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(trim(coalesce(NEW.note, ''))) = 0 THEN
    RAISE EXCEPTION 'Give a reason for the reversal.' USING ERRCODE = 'P0001';
  END IF;
  NEW.tenancy_id := o.tenancy_id;
  NEW.amount_pence := o.amount_pence;
  NEW.method := o.method;
  NEW.reference := o.reference;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER rent_charges_check_reversal BEFORE INSERT ON public.rent_charges
  FOR EACH ROW EXECUTE FUNCTION private.check_charge_reversal();--> statement-breakpoint
CREATE TRIGGER rent_payments_check_reversal BEFORE INSERT ON public.rent_payments
  FOR EACH ROW EXECUTE FUNCTION private.check_payment_reversal();--> statement-breakpoint

-- Staff reverse a charge or a payment, dated today, with a reason the tenant
-- also sees. Runs as the caller, so RLS decides who may.
CREATE OR REPLACE FUNCTION public.reverse_ledger_entry(p_kind text, p_entry_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reason text := trim(coalesce(p_reason, ''));
  v_org uuid;
  v_tenancy uuid;
  v_amount int;
  v_method public.payment_method;
  v_id uuid;
BEGIN
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Give a reason for the reversal.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'Keep the reason to 300 characters or fewer.' USING ERRCODE = 'P0001';
  END IF;

  IF p_kind = 'charge' THEN
    SELECT org_id, tenancy_id, amount_pence INTO v_org, v_tenancy, v_amount
    FROM public.rent_charges WHERE id = p_entry_id;
  ELSIF p_kind = 'payment' THEN
    SELECT org_id, tenancy_id, amount_pence, method INTO v_org, v_tenancy, v_amount, v_method
    FROM public.rent_payments WHERE id = p_entry_id;
  ELSE
    RAISE EXCEPTION 'Unknown ledger entry kind' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'That entry isn''t on this ledger.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.is_org_member(v_org) THEN
    RAISE EXCEPTION 'Only your letting team can reverse entries.' USING ERRCODE = 'P0001';
  END IF;

  IF p_kind = 'charge' THEN
    INSERT INTO public.rent_charges
      (org_id, tenancy_id, kind, source, due_date, amount_pence, description,
       reverses_charge_id, created_by)
    VALUES (v_org, v_tenancy, 'rent', 'manual', private.today_in_london(), v_amount, v_reason,
      p_entry_id, (SELECT auth.uid()))
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.rent_payments
      (org_id, tenancy_id, paid_on, amount_pence, method, note, reverses_payment_id, recorded_by)
    VALUES (v_org, v_tenancy, private.today_in_london(), v_amount, v_method, v_reason,
      p_entry_id, (SELECT auth.uid()))
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;--> statement-breakpoint

-- ===== Rent schedule =====

-- The rent job's own reversal of a scheduled charge whose dates no longer
-- fit the tenancy (its end date was set, moved or removed).
CREATE OR REPLACE FUNCTION private.reverse_scheduled_charge(p_charge_id uuid, p_reason text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.rent_charges
    (org_id, tenancy_id, kind, source, due_date, amount_pence, description, reverses_charge_id)
  SELECT org_id, tenancy_id, kind, 'schedule', private.today_in_london(), amount_pence, p_reason, id
  FROM public.rent_charges WHERE id = p_charge_id
$$;--> statement-breakpoint

-- Brings a tenancy's rent charges up to a date. Rent is due in advance on
-- each due day (a day 29 to 31 falls on the last day of shorter months;
-- weekly rent on an ISO weekday). The first and last part periods are
-- charged by the day: monthly rent x 12 / 365, weekly rent / 7, rounded down
-- to the penny. Each period is charged once:
--   * a period with a live charge for the same dates is left alone;
--   * a period whose charge staff reversed is never charged again;
--   * if the end date has moved, the old charge is reversed and the period
--     charged again with its new dates, and charges after the end are reversed.
-- Returns how many charges it added.
CREATE OR REPLACE FUNCTION private.sync_rent_charges_as_of(p_tenancy_id uuid, p_as_of date)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v public.tenancies;
  v_upto date;
  v_due date;
  v_next date;
  v_period_end date;
  v_days int;
  v_amount int;
  v_inserted int := 0;
  v_reason text;
  c record;
BEGIN
  SELECT * INTO v FROM public.tenancies WHERE id = p_tenancy_id;
  IF v.id IS NULL OR v.status NOT IN ('active', 'ending', 'ended') THEN
    RETURN 0;
  END IF;

  -- One run at a time per tenancy, so a period can't be charged twice.
  PERFORM pg_advisory_xact_lock(hashtextextended('rent:' || v.id::text, 0));

  v_upto := LEAST(p_as_of, COALESCE(v.end_date, p_as_of));
  v_reason := CASE
    WHEN v.end_date IS NULL THEN 'Rent recalculated: the tenancy no longer has an end date'
    ELSE 'Rent recalculated: the tenancy ends on ' || to_char(v.end_date, 'DD/MM/YYYY')
  END;

  -- Charges for periods that start after the end date no longer apply.
  IF v.end_date IS NOT NULL THEN
    FOR c IN
      SELECT ch.id FROM public.rent_charges ch
      WHERE ch.tenancy_id = v.id AND ch.source = 'schedule' AND ch.reverses_charge_id IS NULL
        AND ch.period_start > v.end_date
        AND NOT EXISTS (SELECT 1 FROM public.rent_charges r WHERE r.reverses_charge_id = ch.id)
    LOOP
      PERFORM private.reverse_scheduled_charge(c.id, v_reason);
    END LOOP;
  END IF;

  -- The first due date on or after the start date.
  IF v.rent_frequency = 'weekly' THEN
    v_next := v.start_date + ((v.rent_due_day - EXTRACT(isodow FROM v.start_date)::int + 7) % 7);
  ELSE
    v_next := private.month_day(EXTRACT(year FROM v.start_date)::int,
      EXTRACT(month FROM v.start_date)::int, v.rent_due_day);
    IF v_next < v.start_date THEN
      v_next := private.month_day(
        EXTRACT(year FROM v.start_date + interval '1 month')::int,
        EXTRACT(month FROM v.start_date + interval '1 month')::int,
        v.rent_due_day);
    END IF;
  END IF;

  v_due := v.start_date;
  WHILE v_due <= v_upto LOOP
    -- The period runs from v_due to the day before the next due date.
    IF v_next <= v_due THEN
      IF v.rent_frequency = 'weekly' THEN
        v_next := v_due + 7;
      ELSE
        v_next := private.month_day(
          EXTRACT(year FROM v_due + interval '1 month')::int,
          EXTRACT(month FROM v_due + interval '1 month')::int,
          v.rent_due_day);
      END IF;
    END IF;
    v_period_end := v_next - 1;
    IF v.end_date IS NOT NULL AND v.end_date < v_period_end THEN
      v_period_end := v.end_date;
    END IF;

    v_days := v_period_end - v_due + 1;
    IF v.rent_frequency = 'weekly' THEN
      v_amount := CASE WHEN v_days >= 7 THEN v.rent_pence
        ELSE floor(v.rent_pence::numeric * v_days / 7)::int END;
    ELSE
      -- A whole month (due date to due date) is the full rent; part months by the day.
      v_amount := CASE
        WHEN v_period_end = v_next - 1 AND v_due = private.month_day(
          EXTRACT(year FROM v_due)::int, EXTRACT(month FROM v_due)::int, v.rent_due_day)
          THEN v.rent_pence
        ELSE floor(v.rent_pence::numeric * 12 * v_days / 365)::int
      END;
    END IF;

    IF v_amount > 0
      -- Already charged with these dates, and still standing.
      AND NOT EXISTS (
        SELECT 1 FROM public.rent_charges ch
        WHERE ch.tenancy_id = v.id AND ch.source = 'schedule' AND ch.reverses_charge_id IS NULL
          AND ch.period_start = v_due AND ch.period_end = v_period_end
          AND NOT EXISTS (SELECT 1 FROM public.rent_charges r WHERE r.reverses_charge_id = ch.id))
      -- Staff reversed this period's charge on purpose (for example a rent-free week).
      AND NOT EXISTS (
        SELECT 1 FROM public.rent_charges ch
        JOIN public.rent_charges r ON r.reverses_charge_id = ch.id
        WHERE ch.tenancy_id = v.id AND ch.source = 'schedule' AND ch.reverses_charge_id IS NULL
          AND ch.period_start = v_due AND r.source = 'manual')
    THEN
      -- The period was charged with other dates before the end date moved.
      FOR c IN
        SELECT ch.id FROM public.rent_charges ch
        WHERE ch.tenancy_id = v.id AND ch.source = 'schedule' AND ch.reverses_charge_id IS NULL
          AND ch.period_start = v_due
          AND NOT EXISTS (SELECT 1 FROM public.rent_charges r WHERE r.reverses_charge_id = ch.id)
      LOOP
        PERFORM private.reverse_scheduled_charge(c.id, v_reason);
      END LOOP;

      INSERT INTO public.rent_charges
        (org_id, tenancy_id, kind, source, period_start, period_end, due_date, amount_pence, description)
      VALUES (
        v.org_id, v.id, 'rent', 'schedule', v_due, v_period_end, v_due, v_amount,
        'Rent ' || to_char(v_due, 'DD/MM/YYYY') || ' to ' || to_char(v_period_end, 'DD/MM/YYYY')
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_due := v_next;
  END LOOP;

  RETURN v_inserted;
END;
$$;--> statement-breakpoint

-- Staff and the tenant can bring a tenancy up to date when they look at it,
-- in case the daily job hasn't run yet today.
CREATE OR REPLACE FUNCTION public.sync_rent_charges(p_tenancy_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.tenancies WHERE id = p_tenancy_id;
  IF v_org IS NULL OR NOT (
    private.is_org_member(v_org) OR p_tenancy_id IN (SELECT private.my_tenancy_ids())
  ) THEN
    RAISE EXCEPTION 'Tenancy not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN private.sync_rent_charges_as_of(p_tenancy_id, private.today_in_london());
END;
$$;--> statement-breakpoint

-- ===== The daily job =====

CREATE TABLE private.rent_job_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  run_for date NOT NULL,
  tenancies_checked integer NOT NULL,
  charges_added integer NOT NULL,
  failures integer NOT NULL
);--> statement-breakpoint
ALTER TABLE private.rent_job_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON private.rent_job_runs FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- Every organisation's tenancies that pay rent (and ones that ended in the
-- last 90 days, so a final part period is never missed). One tenancy going
-- wrong doesn't stop the rest; failures are counted.
CREATE OR REPLACE FUNCTION private.run_daily_rent_charges(p_as_of date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_as_of date := COALESCE(p_as_of, private.today_in_london());
  v_added int := 0;
  v_checked int := 0;
  v_failures int := 0;
  t record;
BEGIN
  FOR t IN
    SELECT id FROM public.tenancies
    WHERE status IN ('active', 'ending')
      OR (status = 'ended' AND end_date >= v_as_of - 90)
  LOOP
    BEGIN
      v_added := v_added + private.sync_rent_charges_as_of(t.id, v_as_of);
      v_checked := v_checked + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failures := v_failures + 1;
    END;
  END LOOP;
  INSERT INTO private.rent_job_runs (run_for, tenancies_checked, charges_added, failures)
  VALUES (v_as_of, v_checked, v_added, v_failures);
  RETURN v_added;
END;
$$;--> statement-breakpoint

-- When the daily job last ran, for staff.
CREATE OR REPLACE FUNCTION public.rent_charges_last_run()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT max(ran_at) FROM private.rent_job_runs
  WHERE EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active'
  )
$$;--> statement-breakpoint

-- pg_cron runs the job at 00:30 UTC (00:30 or 01:30 UK time), just after
-- midnight in London. Skipped where pg_cron isn't available (the test database).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule(
      'daily-rent-charges', '30 0 * * *', 'SELECT private.run_daily_rent_charges()');
  END IF;
END
$do$;--> statement-breakpoint

-- ===== Grants =====
REVOKE ALL ON FUNCTION private.prevent_ledger_update() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.check_charge_reversal() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.check_payment_reversal() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.reverse_scheduled_charge(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.sync_rent_charges_as_of(uuid, date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.run_daily_rent_charges(date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reverse_ledger_entry(text, uuid, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry(text, uuid, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.rent_charges_last_run() FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.rent_charges_last_run() TO authenticated;
