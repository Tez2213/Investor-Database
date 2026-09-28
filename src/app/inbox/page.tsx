import { InboxPage } from "../../components/inbox/InboxPage";
import { requirePageSession } from "../../lib/auth/requirePage";

export default async function Inbox() {
  await requirePageSession("/inbox");
  return <InboxPage />;
}
