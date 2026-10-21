import type { Metadata, Viewport } from "next";
import { type ReactNode, Suspense } from "react";
import { ServiceWorker } from "@/components/portal/service-worker";
import { TenantTabBar } from "@/components/portal/tenant-tab-bar";
import { requireTenant } from "@/lib/portal/queries";

export const metadata: Metadata = {
  title: { default: "Your home", template: "%s · Your home" },
  appleWebApp: { capable: true, title: "My home", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function TenantPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-xl items-center px-4">
          <Suspense fallback={<span className="h-4 w-32 animate-pulse rounded bg-muted" />}>
            <Organisation />
          </Suspense>
        </div>
      </header>
      {/* Room at the bottom for the tab bar. */}
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4 pb-28">
        {children}
      </main>
      <TenantTabBar />
      <ServiceWorker />
    </div>
  );
}

async function Organisation() {
  const { home } = await requireTenant();
  return <span className="truncate font-semibold">{home?.organisation ?? "Your home"}</span>;
}
