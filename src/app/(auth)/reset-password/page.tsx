import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { confirmPasswordField, newPasswordField } from "@/components/auth/fields";
import { updatePassword } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" description="You'll use this to log in from now on.">
      <AuthForm
        action={updatePassword}
        fields={[
          { ...newPasswordField, label: "New password" },
          { ...confirmPasswordField, label: "Confirm new password" },
        ]}
        submitLabel="Save new password"
        pendingLabel="Saving…"
      />
    </AuthCard>
  );
}
