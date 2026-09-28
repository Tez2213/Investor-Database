import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "../../../components/admin/AdminLoginForm";
import { getServerAdminSession } from "../../../lib/auth/adminSession";

export const metadata: Metadata = { title: "Admin sign-in · Investor Database" };

export default async function AdminLogin() {
  if (await getServerAdminSession()) redirect("/admin");
  return <AdminLoginForm />;
}
