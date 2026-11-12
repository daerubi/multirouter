import { NextResponse } from "next/server";
import { previewRecovery, executeRecovery, listRecoveryProviders } from "@/lib/recovery/registry.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { provider } = await params;
    const { searchParams } = new URL(request.url);
    if (provider === "list") {
      return NextResponse.json({ ok: true, providers: listRecoveryProviders() });
    }
    const connectionId = searchParams.get("connectionId") || undefined;
    const result = await previewRecovery(provider, connectionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { provider } = await params;
    const body = await request.json().catch(() => ({}));
    const connectionId = body.connectionId || body.connection_id;
    const result = await executeRecovery(provider, connectionId, body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
