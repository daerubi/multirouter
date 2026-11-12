import { NextResponse } from "next/server";
import { bulkImportConnections, exportConnections, listManagedConnections } from "@/lib/farming/accountManager.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || undefined;
    const format = searchParams.get("format") || "json";
    const items = format === "full" || searchParams.get("export") === "1"
      ? await exportConnections({ provider })
      : await listManagedConnections({ provider });
    return NextResponse.json({ ok: true, count: items.length, connections: items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await bulkImportConnections(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
