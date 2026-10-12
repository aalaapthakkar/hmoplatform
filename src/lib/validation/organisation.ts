import { z } from "zod";

export const organisationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your organisation's name")
    .max(120, "Use 120 characters or fewer"),
});
