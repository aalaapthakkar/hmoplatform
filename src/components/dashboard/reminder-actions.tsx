"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { closeReminder } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";

export function ReminderActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function close(status: "done" | "dismissed") {
    startTransition(async () => {
      const result = await closeReminder({ id, status });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => close("done")}
        aria-label={`Done: ${title}`}
      >
        Done
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => close("dismissed")}
        aria-label={`Dismiss: ${title}`}
      >
        Dismiss
      </Button>
    </div>
  );
}
