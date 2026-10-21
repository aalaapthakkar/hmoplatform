import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next.js internals, static files and the files that
    // make the tenant portal installable (browsers fetch them on their own).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|apple-icon|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
