import { appIcon } from "@/lib/portal/app-icon";

const ICONS = {
  "192.png": () => appIcon(192),
  "512.png": () => appIcon(512),
  "maskable-512.png": () => appIcon(512, { maskable: true }),
} as const;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

/** The app icons the manifest lists, made once at build time. */
export async function GET(_request: Request, { params }: RouteContext<"/icons/[file]">) {
  const { file } = await params;
  if (!Object.hasOwn(ICONS, file)) return new Response("Not found", { status: 404 });
  return ICONS[file as keyof typeof ICONS]();
}
