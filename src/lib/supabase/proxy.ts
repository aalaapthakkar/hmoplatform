import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { HOME_ROUTE, LOG_IN_ROUTE, isAuthRoute, isOpenRoute } from "@/lib/routes";

/**
 * Refreshes the Supabase session cookie on every request and applies the
 * coarse route guard. Pages still check the user themselves; this only
 * decides where signed-in and signed-out visitors may go.
 */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims: it can cause
  // hard-to-debug random log-outs.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  } catch {
    // Supabase unreachable: treat the visitor as signed out.
  }

  const { pathname } = request.nextUrl;

  if (isOpenRoute(pathname)) return response;

  if (signedIn && isAuthRoute(pathname)) {
    return redirectWithCookies(request, response, HOME_ROUTE);
  }

  if (!signedIn && !isAuthRoute(pathname)) {
    return redirectWithCookies(request, response, LOG_IN_ROUTE);
  }

  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
