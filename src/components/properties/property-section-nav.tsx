"use client";

import {
  Activity,
  DoorOpen,
  FileText,
  Handshake,
  type LucideIcon,
  NotebookText,
  PoundSterling,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Section = { slug: string; label: string; icon: LucideIcon; comingSoon?: boolean };

/** The property hub's sections. Rooms is the hub's home page. */
export const PROPERTY_SECTIONS: Section[] = [
  { slug: "", label: "Rooms", icon: DoorOpen },
  { slug: "ownership", label: "Ownership", icon: Handshake },
  { slug: "details", label: "Details", icon: NotebookText },
  { slug: "documents", label: "Documents", icon: FileText },
  { slug: "activity", label: "Activity", icon: Activity },
  { slug: "compliance", label: "Compliance", icon: ShieldCheck, comingSoon: true },
  { slug: "maintenance", label: "Maintenance", icon: Wrench },
  { slug: "rent", label: "Rent", icon: PoundSterling },
];

/**
 * Down the side on wider screens; a row of tabs that scrolls sideways on a
 * phone, so every section is one tap away.
 */
export function PropertySectionNav({ propertyId }: { propertyId: string }) {
  const pathname = usePathname();
  const base = `/properties/${propertyId}`;
  const currentLink = useRef<HTMLAnchorElement>(null);

  // On a phone, bring the current section's tab into view in the scrolling row.
  useEffect(() => {
    currentLink.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav
      aria-label="Property sections"
      className="-mx-4 overflow-x-auto border-b px-4 md:sticky md:top-20 md:mx-0 md:w-48 md:shrink-0 md:self-start md:overflow-visible md:border-b-0 md:px-0"
    >
      <ul className="flex gap-1 pb-2 md:flex-col md:pb-0">
        {PROPERTY_SECTIONS.map((section) => {
          const href = section.slug ? `${base}/${section.slug}` : base;
          // A room's own page belongs to the Rooms section.
          const current =
            pathname === href || (section.slug === "" && pathname.startsWith(`${base}/rooms/`));
          const Icon = section.icon;
          return (
            <li key={section.label} className="shrink-0">
              <Link
                href={href}
                ref={current ? currentLink : undefined}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors hover:bg-muted",
                  current ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {section.label}
                {section.comingSoon ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] md:ml-auto">
                    Soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
