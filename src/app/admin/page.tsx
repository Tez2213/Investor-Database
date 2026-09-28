import { AdminPage } from "../../components/admin/AdminPage";
import { requirePageSession } from "../../lib/auth/requirePage";

export default async function Admin() {
  await requirePageSession("/admin", { admin: true });
  return <AdminPage />;
}
