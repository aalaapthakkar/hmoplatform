import { FileText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Link
        href="/settings/documents"
        className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" aria-hidden />
              Document templates
            </CardTitle>
            <CardDescription>Wording for tenancy and guarantor agreements.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link
        href="/settings/compliance"
        className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              Compliance types
            </CardTitle>
            <CardDescription>
              The checks, certificates and licences properties need, how long each lasts and when to
              be reminded.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
