import { AdminPage } from "../../components/admin/AdminPage";
import { requireAdminPage } from "../../lib/auth/adminSession";

export default async function Admin() {
  const admin = await requireAdminPage();
  return <AdminPage adminName={admin.name || admin.email} />;
}
