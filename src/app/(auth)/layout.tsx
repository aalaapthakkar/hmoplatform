import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <Link href="/log-in" className="text-lg font-semibold tracking-tight">
        HMO Platform
      </Link>
      {children}
    </main>
  );
}
