import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "Enter a valid email address")
  .pipe(z.email("Enter a valid email address"));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, "Use 72 characters or fewer");

export const signUpSchema = z.object({ email, password: newPassword });

export const logInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const emailOnlySchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The passwords don't match",
    path: ["confirmPassword"],
  });
