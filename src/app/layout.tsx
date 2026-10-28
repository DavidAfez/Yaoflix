import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Narrow, Instrument_Sans } from "next/font/google";
import { getUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Presence } from "@/components/presence";
import { ErrorReporter } from "@/components/error-reporter";
import { MarksProvider } from "@/components/marks";
import { deepState, getMarks } from "@/lib/marks";
import { I18nProvider } from "@/components/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// Archivo for titles, Instrument Sans for text, Archivo Narrow for labels and figures
const display = Archivo({ subsets: ["latin"], variable: "--font-title", axes: ["wdth"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });
const label = Archivo_Narrow({ subsets: ["latin"], variable: "--font-label" });

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
