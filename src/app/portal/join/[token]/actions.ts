"use server";

import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { type FormState, parseFormData } from "@/lib/forms";
import { looksLikePortalToken } from "@/lib/onboarding/portal-token";
import { PORTAL_ROUTE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { logInSchema, signUpSchema } from "@/lib/validation/auth";

const INVALID: FormState = {
  status: "error",
  message: "This invite isn't valid any more. Ask your letting team for a new one.",
};

/** Links the signed-in account to the invited tenant, then opens the portal. */
async function claim(token: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_tenant_invite", { p_token: token });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) return { status: "error", message: "Something went wrong. Please try again." };
  redirect(PORTAL_ROUTE);
}

/** New to the portal: make an account with a password, then join. */
export async function joinWithNewAccount(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!looksLikePortalToken(token)) return INVALID;
  const parsed = parseFormData(signUpSchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const back = new URL("/auth/callback", getPublicEnv().NEXT_PUBLIC_SITE_URL);
  back.searchParams.set("next", `/portal/join/${token}`);
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: back.toString() },
  });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "user_already_exists"
          ? "There's already an account for that email. Choose “I already have a login” below."
          : error.code === "weak_password"
            ? "Please choose a stronger password."
            : "Something went wrong. Please try again.",
      values: { email: parsed.data.email },
    };
  }
  // With email confirmation on, they confirm first and come back to this link.
  if (!data.session) {
    return {
      status: "success",
      message:
        "Check your email. We've sent you a link to confirm your address. It brings you back here to finish joining.",
    };
  }
  return claim(token);
}

/** Already has a login (for example from an earlier tenancy): log in, then join. */
export async function joinWithLogIn(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!looksLikePortalToken(token)) return INVALID;
  const parsed = parseFormData(logInSchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message:
        error.code === "invalid_credentials"
          ? "That email and password don't match our records."
          : error.code === "email_not_confirmed"
            ? "Please confirm your email address first. Check your inbox for the link we sent."
            : "Something went wrong. Please try again.",
      values: { email: parsed.data.email },
    };
  }
  return claim(token);
}

/** Already signed in: just join. */
export async function acceptInvite(token: string): Promise<FormState> {
  if (!looksLikePortalToken(token)) return INVALID;
  return claim(token);
}
