import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KepRoop — Secure Photo Albums",
  description: "Manage and share your photo albums securely. The simplest way to organize your memories and keep them safe.",
  openGraph: {
    title: "KepRoop — Secure Photo Albums",
    description: "Manage and share your photo albums securely. The simplest way to organize your memories and keep them safe.",
    images: [{
      url: "/KepRoop_metadata_logo.png",
      width: 1200,
      height: 630,
      alt: "KepRoop Logo"
    }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KepRoop — Secure Photo Albums",
    description: "Manage and share your photo albums securely. The simplest way to organize your memories and keep them safe.",
    images: ["/KepRoop_metadata_logo.png"],
  },
};

import { AuthProvider } from "@/components/providers/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
