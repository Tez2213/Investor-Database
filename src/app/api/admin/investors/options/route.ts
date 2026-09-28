import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/auth/adminSession";
import { sharedFilterOptions } from "../../../../../lib/filterOptions";

/** Countries and industries for the assignment filters in the admin portal. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json(await sharedFilterOptions());
  } catch (error) {
    console.error("Admin filter options API error:", error);
    return NextResponse.json({ error: "Failed to load filter options" }, { status: 500 });
  }
}
