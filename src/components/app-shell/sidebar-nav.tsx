"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

type SidebarNavProps = {
  /** Called after a link is chosen, e.g. to close the mobile menu. */
  onNavigate?: () => void;
};

/** Highlights the current page. Reads the URL, so render it inside <Suspense>. */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

/** The same links with nothing highlighted, while the URL isn't known yet. */
export function SidebarNavFallback() {
  return <NavLinks pathname={null} />;
}

function NavLinks({ pathname, onNavigate }: SidebarNavProps & { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const itemClass = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm";

        if (item.comingSoon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className={cn(itemClass, "cursor-not-allowed text-muted-foreground/70")}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.7rem]">Soon</span>
            </span>
          );
        }

        const active =
          pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              itemClass,
              "font-medium transition-colors hover:bg-muted",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
