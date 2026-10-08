import type { Metadata, Viewport } from "next";
import { Inter, Lora, Nunito, Philosopher } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { siteOrigin } from "@/lib/site-origin";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
// Form title banner (public forms).
const philosopher = Philosopher({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-philosopher", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin(process.env.NEXT_PUBLIC_APP_URL)),
  title: { default: "Synergy Feedback", template: "%s · Synergy Feedback" },
  description: "Feedback and forms platform for Synergy Wellness — physiotherapy and wellness.",
  applicationName: "Synergy Feedback",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} ${nunito.variable} ${philosopher.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
