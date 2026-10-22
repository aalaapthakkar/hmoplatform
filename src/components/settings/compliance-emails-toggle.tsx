"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { toast } from "sonner";
import { setComplianceEmails } from "@/app/(app)/settings/notifications/actions";

/** Your own on/off switch for the daily compliance reminder email. */
export function ComplianceEmailsToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
    >
      <input
        id={id}
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            const result = await setComplianceEmails(next);
            if (result.status === "error") toast.error(result.message);
            else toast.success(result.message);
            router.refresh();
          });
        }}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">Email me compliance reminders</span>
        <span className="text-muted-foreground">
          One email a morning, only when something enters its alert window or goes overdue. Each
          item is only mentioned once for each date.
        </span>
      </span>
    </label>
  );
}
