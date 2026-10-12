import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { currentPasswordField, emailField } from "@/components/auth/fields";
import { LinkErrorNotice } from "@/components/auth/link-error-notice";
import { TextLink } from "@/components/auth/text-link";
import { logIn } from "../actions";

export const metadata: Metadata = { title: "Log in" };

export default function LogInPage() {
  return (
    <AuthCard
      title="Log in"
      description="Welcome back. Log in to manage your houses."
      footer={
        <>
          <TextLink href="/forgot-password">Forgotten your password?</TextLink>
          <TextLink href="/magic-link">Email me a log-in link instead</TextLink>
          <p>
            New here? <TextLink href="/sign-up">Create an account</TextLink>
          </p>
        </>
      }
    >
      <Suspense>
        <LinkErrorNotice />
      </Suspense>
      <AuthForm
        action={logIn}
        fields={[emailField, currentPasswordField]}
        submitLabel="Log in"
        pendingLabel="Logging in…"
      />
    </AuthCard>
  );
}
