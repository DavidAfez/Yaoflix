import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Presence } from "@/components/presence";
import { ErrorReporter } from "@/components/error-reporter";
import { MarksProvider } from "@/components/marks";
import { deepState, getMarks } from "@/lib/marks";
import { I18nProvider } from "@/components/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// Archivo for titles, Instrument Sans for text, Archivo Narrow for labels and figures.
// Served from the repo (OFL, see fonts/OFL.txt): no Google Fonts download at build or start,
// so the site looks the same offline or behind a company proxy.
const display = localFont({
  src: "./fonts/archivo.woff2",
  variable: "--font-title",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
const body = localFont({ src: "./fonts/instrument.woff2", variable: "--font-body", weight: "400 700", display: "swap", declarations: [{ prop: "font-stretch", value: "75% 100%" }] });
const label = localFont({ src: "./fonts/narrow.woff2", variable: "--font-label", weight: "400 700", display: "swap" });

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
  const [user, locale] = await Promise.all([getUser(), getLocale()]);
  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${label.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>
        {user?.approved ? (
          <MarksProvider initial={await getMarks(user.id)} deep={await deepState(user.id)}>
            <Nav role={user.role} handle={user.handle} />
            <div className="pb-20 pt-11 md:pb-0 md:pt-12">{children}</div>
          </MarksProvider>
        ) : (
          children
        )}
        {user?.approved && <Presence />}
        <ErrorReporter />
        </I18nProvider>
      </body>
    </html>
  );
}
