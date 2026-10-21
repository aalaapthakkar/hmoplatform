"use client";

import { SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Result = { status: string; message: string };

/** Writes a message. `send` is a server action that checks who may post where. */
export function MessageComposer({
  send,
  label = "Your message",
}: {
  send: (input: { body: string }) => Promise<Result>;
  label?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) {
      toast.error("Write a message first.");
      return;
    }
    startTransition(async () => {
      const result = await send({ body });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label="Send a message">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="flex items-end gap-2">
        <Textarea
          id={id}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a message"
          rows={2}
          maxLength={4000}
          className="min-h-11 bg-background"
        />
        <Button type="submit" size="icon-lg" disabled={pending} aria-label="Send">
          <SendHorizontal aria-hidden />
        </Button>
      </div>
    </form>
  );
}
