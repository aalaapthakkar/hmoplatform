import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { emailField } from "@/components/auth/fields";
import { TextLink } from "@/components/auth/text-link";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email address and we'll send you a link to choose a new password."
      footer={<TextLink href="/log-in">Back to log in</TextLink>}
    >
      <AuthForm
        action={requestPasswordReset}
        fields={[emailField]}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
      />
    </AuthCard>
  );
}
