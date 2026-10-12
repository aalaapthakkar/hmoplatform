"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { type FormState, parseFormData } from "@/lib/forms";
import { HOME_ROUTE, LOG_IN_ROUTE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import {
  emailOnlySchema,
  logInSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Errors Supabase returns for a magic link to an address with no account. */
const UNKNOWN_USER_CODES = new Set(["otp_disabled", "signup_disabled", "user_not_found"]);

/** Turns Supabase auth errors into friendly copy. Never echoes personal data. */
function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match our records.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the link we sent.";
    case "weak_password":
      return "Please choose a stronger password.";
    case "same_password":
      return "Your new password must be different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return GENERIC_ERROR;
  }
}

function callbackUrl(next: string): string {
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
  const url = new URL("/auth/callback", NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(signUpSchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: callbackUrl("/onboarding") },
  });

  if (error) {
    return {
      status: "error",
      message: authErrorMessage(error),
      values: { email: parsed.data.email },
    };
  }

  // Projects with email confirmation turned off sign the user straight in.
  if (data.session) redirect("/onboarding");

  return {
    status: "success",
    message: "Check your email. We've sent you a link to confirm your account.",
  };
}

export async function logIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(logInSchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: authErrorMessage(error),
      values: { email: parsed.data.email },
    };
  }

  redirect(HOME_ROUTE);
}

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(emailOnlySchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(HOME_ROUTE) },
  });

  // Unknown addresses get the same reply, so the form can't reveal who has an account.
  if (error && !UNKNOWN_USER_CODES.has(error.code ?? "")) {
    return {
      status: "error",
      message: authErrorMessage(error),
      values: { email: parsed.data.email },
    };
  }

  return {
    status: "success",
    message: "If there's an account for that email, we've sent it a log-in link.",
  };
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(emailOnlySchema, formData, ["email"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/reset-password"),
  });

  if (error?.code === "over_email_send_rate_limit") {
    return {
      status: "error",
      message: authErrorMessage(error),
      values: { email: parsed.data.email },
    };
  }

  return {
    status: "success",
    message: "If there's an account for that email, we've sent it a link to reset your password.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(resetPasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return {
      status: "error",
      message: "Your reset link has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };

  redirect(HOME_ROUTE);
}

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOG_IN_ROUTE);
}
