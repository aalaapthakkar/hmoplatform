import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { emailField } from "@/components/auth/fields";
import { TextLink } from "@/components/auth/text-link";
import { sendMagicLink } from "../actions";

export const metadata: Metadata = { title: "Log in with an email link" };

export default function MagicLinkPage() {
  return (
    <AuthCard
      title="Log in with an email link"
      description="We'll email you a link that logs you straight in. No password needed."
      footer={<TextLink href="/log-in">Log in with your password instead</TextLink>}
    >
      <AuthForm
        action={sendMagicLink}
        fields={[emailField]}
        submitLabel="Email me a link"
        pendingLabel="Sending…"
      />
    </AuthCard>
  );
}
