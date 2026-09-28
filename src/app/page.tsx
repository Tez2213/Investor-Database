import { Suspense } from "react";
import { InvestorDashboard } from "../components/investors/InvestorDashboard";
import { requirePageSession } from "../lib/auth/requirePage";

export default async function Home() {
  await requirePageSession("/");
  return (
    <Suspense fallback={null}>
      <InvestorDashboard />
    </Suspense>
  );
}
