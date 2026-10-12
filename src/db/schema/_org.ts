import { uuid } from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

/** org_id for business tables. RLS policies scope every row by it. */
export const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "restrict" });
