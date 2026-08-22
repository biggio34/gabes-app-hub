import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gabe's Apps",
  description: "Private hub for Financial, Softball, and Luna Haus Salon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full dark`}>
      <body className="min-h-full bg-slate-950 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
