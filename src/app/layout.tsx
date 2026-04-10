import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gtAmericaExpanded = localFont({
  src: "../../public/fonts/GT-America-Expanded-Bold.otf",
  variable: "--font-gt-america",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Origin Studios",
  description: "Bespoke intelligence systems for music organizations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={gtAmericaExpanded.variable}>
      <body>{children}</body>
    </html>
  );
}
