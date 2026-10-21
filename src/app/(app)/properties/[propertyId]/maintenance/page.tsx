import type { Metadata } from "next";
import { Suspense } from "react";
import { RepairCard } from "@/components/maintenance/repair-card";
import { RepairStatus } from "@/components/maintenance/repair-status";
import { SectionFallback, SectionHeading } from "@/components/properties/section-heading";
import { getRepairs } from "@/lib/maintenance/queries";
import { getProperty } from "@/lib/properties/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Maintenance" };

export default function MaintenancePage({
  params,
}: PageProps<"/properties/[propertyId]/maintenance">) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Maintenance params={params} />
    </Suspense>
  );
}

async function Maintenance({
  params,
}: Pick<PageProps<"/properties/[propertyId]/maintenance">, "params">) {
  const { propertyId } = await params;
  await getProperty(propertyId);
  const supabase = await createClient();
  const [repairs, { data: rooms }] = await Promise.all([
    getRepairs({ propertyId }),
    supabase.from("rooms").select("id, name").eq("property_id", propertyId),
  ]);
  const roomNames = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const open = repairs.filter(
    (repair) => repair.status === "reported" || repair.status === "in_progress",
  );
  const finished = repairs.filter((repair) => !open.includes(repair));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Maintenance"
        description="Repairs tenants have reported through their portal. Changing the status updates what they see."
      />
      {repairs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No repairs reported for this property.
        </p>
      ) : null}
      {open.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="open-repairs">
          <h3 id="open-repairs" className="font-semibold">
            Open ({open.length})
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map((repair) => (
              <RepairCard
                key={repair.id}
                repair={repair}
                place={repair.room_id ? roomNames.get(repair.room_id) : undefined}
              >
                <RepairStatus requestId={repair.id} status={repair.status} />
              </RepairCard>
            ))}
          </div>
        </section>
      ) : null}
      {finished.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="finished-repairs">
          <h3 id="finished-repairs" className="font-semibold">
            Fixed or closed ({finished.length})
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {finished.map((repair) => (
              <RepairCard
                key={repair.id}
                repair={repair}
                place={repair.room_id ? roomNames.get(repair.room_id) : undefined}
              >
                <RepairStatus requestId={repair.id} status={repair.status} />
              </RepairCard>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
