import { formatUkDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  /** Who sent it, as the viewer should see it: "You", "Northside Lettings", "Priya Shah". */
  who: string;
  /** Sent by the viewer's side, so it sits on the right. */
  mine: boolean;
};

/** A conversation, oldest first, like a messaging app. */
export function MessageThread({ messages, empty }: { messages: ThreadMessage[]; empty: string }) {
  if (messages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="Messages">
      {messages.map((message) => (
        <li
          key={message.id}
          className={cn("flex flex-col gap-1", message.mine ? "items-end" : "items-start")}
          data-testid="message"
        >
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-line",
              message.mine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm border bg-background",
            )}
          >
            {message.body}
          </div>
          <span className="px-1 text-xs text-muted-foreground">
            {message.who} · {formatUkDateTime(message.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}
