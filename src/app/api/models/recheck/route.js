import { NextResponse } from "next/server";
import { recheckProviderModels } from "@/lib/models/modelRechecker.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await recheckProviderModels(body || {});
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
