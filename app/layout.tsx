import type { Metadata, Viewport } from "next";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import "./globals.css";
import "./surface.css";
import "./little-board.css";
import { basePath } from "@/lib/navigation";
export const metadata: Metadata = {
  title: "Little Board",
  description:
    "A little less to remember. Create a board or sign in with email.",
  robots: { index: false, follow: false },
  icons: { icon: `${basePath}/icon.svg` },
  appleWebApp: {
    capable: true,
    title: "Little Board",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f6fa",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta
          httpEquiv="Content-Security-Policy"
          content={
            "default-src 'self'; script-src 'self' 'unsafe-inline'" +
            (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
            "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co; base-uri 'self'; form-action 'self'; object-src 'none'"
          }
        />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
