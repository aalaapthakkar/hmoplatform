import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { TopBarDetails, TopBarDetailsFallback } from "@/components/app-shell/top-bar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <Link href="/dashboard" className="flex h-14 items-center border-b px-6 font-semibold">
          HMO Platform
        </Link>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
          <MobileNav />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <Suspense fallback={<TopBarDetailsFallback />}>
              <TopBarDetails />
            </Suspense>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
