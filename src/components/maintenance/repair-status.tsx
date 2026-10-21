"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { toast } from "sonner";
import { updateRepairStatus } from "@/app/(app)/properties/[propertyId]/maintenance/actions";
import { selectClass } from "@/components/forms/fields";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/supabase/database.types";
import { MAINTENANCE_STATUS_LABELS } from "@/lib/validation/maintenance";

type Status = Database["public"]["Enums"]["maintenance_status"];

/** Staff change a repair's status straight from the list. The tenant sees it in their portal. */
export function RepairStatus({ requestId, status }: { requestId: string; status: Status }) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <Label htmlFor={id} className="shrink-0 text-sm">
        Status
      </Label>
      <select
        id={id}
        value={status}
        disabled={pending}
        className={`${selectClass} max-w-48`}
        onChange={(event) => {
          const next = event.target.value as Status;
          startTransition(async () => {
            const result = await updateRepairStatus({ requestId, status: next });
            if (result.status === "error") toast.error(result.message);
            else toast.success(result.message);
            router.refresh();
          });
        }}
      >
        {Object.entries(MAINTENANCE_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
