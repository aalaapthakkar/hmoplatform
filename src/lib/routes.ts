/** Pages for signed-out users. Signed-in users are sent to the dashboard. */
export const AUTH_ROUTES = ["/log-in", "/sign-up", "/magic-link", "/forgot-password"] as const;

/**
 * Routes anyone can reach, signed in or not: email links, the applicant
 * portal, tenant portal invites and e-sign webhooks.
 */
export const OPEN_ROUTE_PREFIXES = ["/auth/", "/apply/", "/portal/join/", "/api/esign/"] as const;

export const HOME_ROUTE = "/dashboard";
export const LOG_IN_ROUTE = "/log-in";
/** Where tenants land: they never see the staff app. */
export const PORTAL_ROUTE = "/portal";

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
}

export function isOpenRoute(pathname: string): boolean {
  return OPEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
