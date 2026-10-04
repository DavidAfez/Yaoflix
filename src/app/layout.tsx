import type { Metadata, Viewport } from "next";
import { Unbounded, Geist, Geist_Mono } from "next/font/google";
import { getUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Presence } from "@/components/presence";
import { ErrorReporter } from "@/components/error-reporter";
import "./globals.css";

const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", weight: ["400", "600", "800"] });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "GabaoFlix", template: "%s · GabaoFlix" },
  description: "Tu demandes. On met en ligne. Tu regardes.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="fr" className={`${unbounded.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        {user && <Nav role={user.role} handle={user.handle} />}
        <div className={user ? "pb-24 md:pb-0 md:pt-16" : ""}>{children}</div>
        {user && <Presence />}
        <ErrorReporter />
      </body>
    </html>
  );
}
