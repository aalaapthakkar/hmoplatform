import type { ReactNode } from "react";
import type { Block } from "@/lib/documents/merge";

/** A portal page's heading, with an optional line under it. */
export function PortalHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </header>
  );
}

/** Shown when the tenant's account isn't linked to a tenancy that can be shown. */
export function NoTenancyYet() {
  return (
    <div className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
      There&apos;s nothing to show here yet. If you think that&apos;s wrong, contact your letting
      team.
    </div>
  );
}

/** Text written with the simple formatting used in templates: headings, bullets, paragraphs. */
export function FormattedText({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {blocks.map((block, index) =>
        block.type === "heading" ? (
          block.level === 1 ? (
            <h2 key={index} className="pt-2 text-lg font-semibold">
              {block.text}
            </h2>
          ) : (
            <h3 key={index} className="pt-1 font-semibold">
              {block.text}
            </h3>
          )
        ) : block.type === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  );
}
