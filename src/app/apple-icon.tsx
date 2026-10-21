import { appIcon } from "@/lib/portal/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The icon an iPhone uses when the portal is added to the home screen. */
export default function AppleIcon() {
  return appIcon(180, { maskable: true });
}
