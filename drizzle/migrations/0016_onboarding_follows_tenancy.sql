-- Keep onboarding in step with its tenancy.

-- Cancelling an upcoming tenancy also withdraws its onboarding and switches
-- off the applicant's link, so nothing is left "in progress" for a tenancy
-- that won't happen.
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

  UPDATE public.onboardings
  SET status = 'withdrawn', portal_revoked_at = COALESCE(portal_revoked_at, now())
  WHERE tenancy_id = p_tenancy_id AND status = 'in_progress';
END;
$$;--> statement-breakpoint

-- Finishing the Move in step starts the tenancy, unless someone already
-- moved the tenant in from the room page.
CREATE OR REPLACE FUNCTION public.update_onboarding_step(
  p_step_id uuid,
  p_status public.onboarding_step_status,
  p_owner_user_id uuid,
  p_owner_is_applicant boolean,
  p_due_date date,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_onboarding uuid;
  v_kind public.onboarding_step_kind;
  v_onboarding_status public.onboarding_status;
  v_tenancy uuid;
  v_tenancy_status public.tenancy_status;
BEGIN
  SELECT s.org_id, s.onboarding_id, s.kind, o.status, o.tenancy_id, t.status
  INTO v_org, v_onboarding, v_kind, v_onboarding_status, v_tenancy, v_tenancy_status
  FROM public.onboarding_steps s
  JOIN public.onboardings o ON o.id = s.onboarding_id
  JOIN public.tenancies t ON t.id = o.tenancy_id
  WHERE s.id = p_step_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_onboarding_status <> 'in_progress' THEN
    RAISE EXCEPTION 'This onboarding has finished, so its steps can''t change.' USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_user_id IS NOT NULL AND NOT private.is_active_member(v_org, p_owner_user_id) THEN
    RAISE EXCEPTION 'Choose someone in your organisation as the owner.' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind = 'move_in' AND p_status = 'done' THEN
    IF EXISTS (
      SELECT 1 FROM public.onboarding_steps s
      WHERE s.onboarding_id = v_onboarding AND s.id <> p_step_id AND s.status NOT IN ('done', 'skipped')
    ) THEN
      RAISE EXCEPTION 'Finish or skip the other steps before moving in.' USING ERRCODE = 'P0001';
    END IF;
    IF v_tenancy_status = 'prospective' THEN
      PERFORM public.start_tenancy(v_tenancy);
    END IF;
  END IF;

  UPDATE public.onboarding_steps
  SET status = p_status,
      owner_user_id = CASE WHEN p_owner_is_applicant THEN NULL ELSE p_owner_user_id END,
      owner_is_applicant = COALESCE(p_owner_is_applicant, false),
      due_date = p_due_date,
      notes = NULLIF(btrim(p_notes), ''),
      completed_at = CASE WHEN p_status = 'done' THEN COALESCE(completed_at, now()) END,
      completed_by = CASE WHEN p_status = 'done' THEN COALESCE(completed_by, (SELECT auth.uid())) END
  WHERE id = p_step_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_steps s
    WHERE s.onboarding_id = v_onboarding AND s.status NOT IN ('done', 'skipped')
  ) THEN
    UPDATE public.onboardings SET status = 'completed', completed_at = now(), portal_revoked_at = now()
    WHERE id = v_onboarding;
  END IF;
END;
$$;
