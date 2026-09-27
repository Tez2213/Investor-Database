import { Suspense } from "react";
import { InvestorDashboard } from "../components/investors/InvestorDashboard";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <InvestorDashboard />
    </Suspense>
  );
}
