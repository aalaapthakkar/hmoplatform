import { BookOpen, ChevronRight, FileText, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { logOut } from "@/app/(auth)/actions";
import { InstallHint } from "@/components/portal/install-hint";
import { PortalHeading } from "@/components/portal/portal-bits";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return (
    <>
      <PortalHeading title="More" />
      <ul className="flex flex-col divide-y rounded-xl border bg-background">
        <Row href="/portal/documents" icon={<FileText aria-hidden />} label="Documents" />
        <Row href="/portal/welcome" icon={<BookOpen aria-hidden />} label="Welcome pack" />
      </ul>
      <InstallHint />
      <form action={logOut}>
        <Button type="submit" variant="outline" className="w-full">
          <LogOut aria-hidden />
          Log out
        </Button>
      </form>
    </>
  );
}

function Row({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium hover:bg-muted/50 [&_svg]:size-5"
      >
        <span className="text-primary">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
