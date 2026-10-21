/** Pages for signed-out users. Signed-in users are sent to the dashboard. */
export const AUTH_ROUTES = ["/log-in", "/sign-up", "/magic-link", "/forgot-password"] as const;

/** Routes anyone can reach, signed in or not: email links, the applicant portal and e-sign webhooks. */
export const OPEN_ROUTE_PREFIXES = ["/auth/", "/apply/", "/api/esign/"] as const;

export const HOME_ROUTE = "/dashboard";
export const LOG_IN_ROUTE = "/log-in";

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
}

export function isOpenRoute(pathname: string): boolean {
  return OPEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
