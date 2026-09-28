import { UploadLeadsPage } from "../../components/upload/UploadLeadsPage";
import { requirePageSession } from "../../lib/auth/requirePage";

export default async function Upload() {
  await requirePageSession("/upload");
  return <UploadLeadsPage />;
}
