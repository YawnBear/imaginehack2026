import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SafeCloud — AI Cloud Governance for Construction",
  description:
    "AI-assisted cloud-governance dashboard: explainable security & cost findings, estimated cost + carbon savings, with human-approved remediation.",
  icons: {
    icon: "/footprint-svgrepo-com.svg",
    shortcut: "/footprint-svgrepo-com.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${roboto.variable} ${robotoMono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Script
          id="safe-cloud-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("safe-cloud.theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch(e){}` }}
        />
        {children}
      </body>
    </html>
  );
}
