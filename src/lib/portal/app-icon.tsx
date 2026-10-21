import { ImageResponse } from "next/og";

/**
 * The portal's app icon: a simple house on a dark tile, drawn in code so
 * there are no image files to keep in step. Maskable icons keep the house
 * inside the middle 80%, which phones never crop.
 */
export function appIcon(size: number, { maskable = false } = {}) {
  const house = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#171717",
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={house} height={house} viewBox="0 0 24 24" fill="none">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="#ffffff" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
