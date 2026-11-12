import { NextResponse } from "next/server";
import { generateAutoCombos } from "@/lib/combos/autoCombo.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateAutoCombos(body || {});
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
