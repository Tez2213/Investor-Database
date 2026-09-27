import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investor Database",
  description: "Investor research and discovery platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
