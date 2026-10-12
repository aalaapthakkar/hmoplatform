import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import type { AuthField } from "./auth-form";

export const emailField: AuthField = {
  name: "email",
  label: "Email address",
  type: "email",
  autoComplete: "email",
};

export const currentPasswordField: AuthField = {
  name: "password",
  label: "Password",
  type: "password",
  autoComplete: "current-password",
};

export const newPasswordField: AuthField = {
  name: "password",
  label: "Password",
  type: "password",
  autoComplete: "new-password",
  hint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
};

export const confirmPasswordField: AuthField = {
  name: "confirmPassword",
  label: "Confirm password",
  type: "password",
  autoComplete: "new-password",
};
