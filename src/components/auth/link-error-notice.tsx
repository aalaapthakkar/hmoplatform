"use client";

import { useSearchParams } from "next/navigation";

/** Explains a failed email link after /auth/callback or /auth/confirm redirects here. */
export function LinkErrorNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("error") !== "link") return null;

  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      That link has expired or has already been used. Please request a new one.
    </p>
  );
}
