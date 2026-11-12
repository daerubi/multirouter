import { NextResponse } from "next/server";
import { getComboById, getComboByName } from "@/lib/db/repos/combosRepo.js";
import { verifyCombo, verifyAllCombos } from "@/lib/combos/autoCombo.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.all) {
      const result = await verifyAllCombos(body);
      return NextResponse.json({ ok: true, ...result });
    }
    let combo = null;
    if (body.id) combo = await getComboById(body.id);
    else if (body.name) combo = await getComboByName(body.name);
    if (!combo) return NextResponse.json({ ok: false, error: "combo not found" }, { status: 404 });
    const result = await verifyCombo(combo, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
