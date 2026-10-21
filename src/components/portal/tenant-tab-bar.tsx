"use client";

import { Home, type LucideIcon, Menu, MessageCircle, PoundSterling, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/rent", label: "Rent", icon: PoundSterling },
  { href: "/portal/repairs", label: "Repairs", icon: Wrench },
  { href: "/portal/messages", label: "Messages", icon: MessageCircle },
  { href: "/portal/more", label: "More", icon: Menu },
];

/** Pages reached from More, so More stays highlighted on them. */
const MORE_PAGES = ["/portal/documents", "/portal/welcome"];

function isActive(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  if (href === "/portal/more") {
    return [href, ...MORE_PAGES].some((page) => pathname.startsWith(page));
  }
  return pathname.startsWith(href);
}

/** The tenant portal's main menu: a tab bar at the bottom, where thumbs reach it. */
export function TenantTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Tenant portal"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground",
                  active && "font-medium text-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
