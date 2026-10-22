import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { LogRent } from "@/components/rent/log-rent";
import { UserMenu } from "./user-menu";

/** Org name and user menu. Reads the session, so render it inside <Suspense>. */
export async function TopBarDetails() {
  const [user, membership] = await Promise.all([getCurrentUser(), requireMembership()]);

  return (
    <>
      <p className="min-w-0 flex-1 truncate font-semibold">{membership.orgName}</p>
      <LogRent />
      <UserMenu email={user.email} />
    </>
  );
}

export function TopBarDetailsFallback() {
  return (
    <>
      <div className="h-4 w-40 flex-1 animate-pulse rounded bg-muted md:flex-none" />
      <div className="size-8 animate-pulse rounded-full bg-muted" />
    </>
  );
}
