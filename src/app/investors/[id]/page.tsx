import { notFound } from "next/navigation";
import { InvestorProfilePage } from "../../../components/profile/InvestorProfilePage";
import { requirePageSession } from "../../../lib/auth/requirePage";
import { parseId } from "../../../lib/parseId";

export default async function InvestorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  await requirePageSession(`/investors/${id}`);
  if (parseId(id) === null) notFound();
  const { compose } = await searchParams;

  // Keyed by id so moving to the next/previous investor starts with fresh state.
  return <InvestorProfilePage key={id} id={id} initialCompose={compose === "1"} />;
}
