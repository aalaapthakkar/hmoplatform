import { describe, expect, it } from "vitest";
import { buildOnboardingList, filterOnboardingList, type OnboardingListRow } from "./list";

const TODAY = "2026-10-21";
const ME = "u-me";
const people = [
  { id: ME, name: "Alice Adams" },
  { id: "u-carol", name: "Carol Clark" },
];

function row(id: string, overrides: Partial<OnboardingListRow> = {}): OnboardingListRow {
  return {
    id,
    status: "in_progress",
    created_at: "2026-10-01T09:00:00Z",
    completed_at: null,
    rooms: { name: "Room 2", properties: { address_line_1: "42 Ash Grove" } },
    tenancies: {
      start_date: "2026-11-15",
      tenancy_tenants: [{ status: "active", tenants: { first_name: "Ava", last_name: id } }],
    },
    onboarding_steps: [],
    ...overrides,
  };
}

const step = (
  position: number,
  status: OnboardingListRow["onboarding_steps"][number]["status"],
  extra: Partial<OnboardingListRow["onboarding_steps"][number]> = {},
) => ({
  position,
  title: `Step ${position}`,
  status,
  owner_user_id: null,
  owner_is_applicant: false,
  due_date: null,
  completed_at: null,
  ...extra,
});

const items = buildOnboardingList(
  [
    row("Waiting", {
      onboarding_steps: [
        step(1, "not_started", { owner_is_applicant: true, due_date: "2026-10-30" }),
      ],
    }),
    row("Late", {
      onboarding_steps: [
        step(1, "done", { completed_at: "2026-10-11T10:00:00Z" }),
        step(2, "in_progress", { owner_user_id: ME, due_date: "2026-10-18" }),
      ],
    }),
    row("Carols", {
      onboarding_steps: [step(1, "not_started", { owner_user_id: "u-carol" })],
    }),
    row("Finished", { status: "completed", onboarding_steps: [step(1, "done")] }),
  ],
  people,
  ME,
  TODAY,
);

describe("buildOnboardingList", () => {
  it("shows the current step, its owner, due date and how long it's been stuck", () => {
    const late = items.find((item) => item.id === "Late")!;
    expect(late).toMatchObject({
      applicant: "Ava Late",
      place: "Room 2, 42 Ash Grove",
      moveIn: "15/11/2026",
      step: "Step 2",
      owner: "Alice Adams",
      mine: true,
      due: "18/10/2026",
      overdue: true,
      daysStuck: 10,
      progress: "1 of 2",
    });
    expect(items.find((item) => item.id === "Waiting")).toMatchObject({
      owner: "Applicant",
      waitingOnApplicant: true,
      overdue: false,
      daysStuck: 20,
    });
    expect(items.find((item) => item.id === "Finished")).toMatchObject({
      step: null,
      daysStuck: 0,
    });
  });
});

describe("filterOnboardingList", () => {
  const ids = (filter: Parameters<typeof filterOnboardingList>[1]) =>
    filterOnboardingList(items, filter).map((item) => item.id);

  it("lists onboardings in progress, overdue first, then the longest stuck", () => {
    expect(ids("all")).toEqual(["Late", "Waiting", "Carols"]);
  });

  it("filters by overdue, waiting on the applicant, mine and closed", () => {
    expect(ids("overdue")).toEqual(["Late"]);
    expect(ids("applicant")).toEqual(["Waiting"]);
    expect(ids("mine")).toEqual(["Late"]);
    expect(ids("closed")).toEqual(["Finished"]);
  });
});
