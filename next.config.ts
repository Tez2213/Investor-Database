import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mail libraries use Node networking/streams; load them with plain require
  // instead of bundling them into the server build.
  serverExternalPackages: ["nodemailer", "imapflow", "mailparser"],
};

export default nextConfig;
