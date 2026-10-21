import type { LucideIcon } from "lucide-react";

/** A clearly labelled placeholder for a property hub section that isn't built yet. */
export function ComingSoonSection({
  title,
  icon: Icon,
  summary,
  items,
}: {
  title: string;
  icon: LucideIcon;
  summary: string;
  items: string[];
}) {
  return (
    <section aria-labelledby="section-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="section-heading" className="text-xl font-semibold">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Coming soon</span>
      </div>
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <Icon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{summary}</p>
        <p className="text-sm text-muted-foreground">
          When it&apos;s ready, you&apos;ll be able to:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
