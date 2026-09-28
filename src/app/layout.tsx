import type { Metadata } from "next";
import { SessionProvider } from "../components/SessionProvider";
import { getServerSession, toSessionUser } from "../lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investor Database",
  description: "Investor research and outreach portal for FabricVTON, BeatBand and Naaradh",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();

  return (
    <html lang="en">
      <body>
        <SessionProvider user={session ? toSessionUser(session) : null}>{children}</SessionProvider>
      </body>
    </html>
  );
}
