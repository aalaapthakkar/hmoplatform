"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { fakeSign } from "@/app/(app)/dev/esign/[requestId]/actions";
import { Button } from "@/components/ui/button";

export function FakeSignButton({
  requestId,
  email,
  name,
}: {
  requestId: string;
  email: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await fakeSign(requestId, email);
          if (result.status === "error") toast.error(result.message);
          else toast.success(result.message);
          router.refresh();
        })
      }
    >
      Sign as {name}
    </Button>
  );
}
