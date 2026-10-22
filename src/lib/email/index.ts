import "server-only";

import { z } from "zod";

/**
 * Sending email. The app only talks to providers through this, so Resend
 * can be swapped for another. EMAIL_PROVIDER=fake never sends anything: the
 * tests use it, and so can anyone trying the app without a sending domain.
 */

export type EmailAttachment = { filename: string; content: Uint8Array; contentType?: string };

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export interface EmailProvider {
  readonly name: string;
  /** Sends one email. Throws EmailFailed with a short, safe reason if it doesn't go. */
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class EmailNotConfigured extends Error {}

/** A short reason an email didn't go, safe to store and show. Never the provider's raw reply. */
export class EmailFailed extends Error {}

const envSchema = z.object({
  EMAIL_PROVIDER: z.enum(["resend", "fake"]).default("resend"),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
});

function settings() {
  const parsed = envSchema.safeParse({
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  });
  if (!parsed.success)
    throw new EmailNotConfigured("The email settings in .env.local aren't valid.");
  return parsed.data;
}

const fakeProvider: EmailProvider = {
  name: "fake",
  async send() {
    return { id: `fake-${crypto.randomUUID()}` };
  },
};

function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            reply_to: message.replyTo,
            attachments: message.attachments?.map((attachment) => ({
              filename: attachment.filename,
              content: Buffer.from(attachment.content).toString("base64"),
              content_type: attachment.contentType,
            })),
          }),
        });
      } catch {
        throw new EmailFailed("Couldn't reach the email service");
      }
      if (!response.ok) {
        throw new EmailFailed(
          response.status === 422
            ? "The email address wasn't accepted"
            : response.status === 429
              ? "Too many emails at once; try again shortly"
              : response.status === 401 || response.status === 403
                ? "Email isn't set up correctly"
                : "The email service had a problem",
        );
      }
      const body = (await response.json().catch(() => ({}))) as { id?: unknown };
      return { id: typeof body.id === "string" ? body.id : "unknown" };
    },
  };
}

/** The configured provider. Throws EmailNotConfigured if Resend is chosen but not set up. */
export function getEmailProvider(): EmailProvider {
  const config = settings();
  if (config.EMAIL_PROVIDER === "fake") return fakeProvider;
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new EmailNotConfigured(
      "Email isn't set up yet: add RESEND_API_KEY and EMAIL_FROM to .env.local.",
    );
  }
  return resendProvider(config.RESEND_API_KEY, config.EMAIL_FROM);
}
