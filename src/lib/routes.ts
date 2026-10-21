/** Pages for signed-out users. Signed-in users are sent to the dashboard. */
export const AUTH_ROUTES = ["/log-in", "/sign-up", "/magic-link", "/forgot-password"] as const;

/** Routes anyone can reach, signed in or not: email link handlers and the applicant portal. */
export const OPEN_ROUTE_PREFIXES = ["/auth/", "/apply/"] as const;

export const HOME_ROUTE = "/dashboard";
export const LOG_IN_ROUTE = "/log-in";

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
}

export function isOpenRoute(pathname: string): boolean {
  return OPEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
