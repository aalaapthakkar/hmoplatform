import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { emailField, newPasswordField } from "@/components/auth/fields";
import { TextLink } from "@/components/auth/text-link";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Set up your account, then add your organisation."
      footer={
        <p>
          Already have an account? <TextLink href="/log-in">Log in</TextLink>
        </p>
      }
    >
      <AuthForm
        action={signUp}
        fields={[emailField, newPasswordField]}
        submitLabel="Create account"
        pendingLabel="Creating your account…"
      />
    </AuthCard>
  );
}
