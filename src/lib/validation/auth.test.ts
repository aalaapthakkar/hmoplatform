import { describe, expect, it } from "vitest";
import { logInSchema, resetPasswordSchema, signUpSchema } from "./auth";

describe("auth validation", () => {
  it("trims email addresses", () => {
    const result = logInSchema.parse({ email: "  sam@example.co.uk ", password: "x" });
    expect(result.email).toBe("sam@example.co.uk");
  });

  it("rejects short passwords on sign-up", () => {
    const result = signUpSchema.safeParse({ email: "sam@example.co.uk", password: "short" });
    expect(result.success).toBe(false);
  });

  it("requires matching passwords when resetting", () => {
    const result = resetPasswordSchema.safeParse({
      password: "a-long-password",
      confirmPassword: "a-different-one",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});
