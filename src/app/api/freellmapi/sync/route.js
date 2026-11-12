import { NextResponse } from "next/server";
import {
  getFreeLlmApiSyncState,
  syncFreeLlmApiCatalog,
  setFreeLlmApiBaseUrl,
  getFreeLlmApiBaseUrl,
} from "@/lib/freellmapi/catalogSync.js";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    if (settings?.freellmapiBaseUrl) {
      setFreeLlmApiBaseUrl(settings.freellmapiBaseUrl);
    }
    const state = getFreeLlmApiSyncState();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.baseUrl) {
      setFreeLlmApiBaseUrl(body.baseUrl);
      try {
        await updateSettings({ freellmapiBaseUrl: body.baseUrl });
      } catch {}
    } else {
      const settings = await getSettings();
      if (settings?.freellmapiBaseUrl) setFreeLlmApiBaseUrl(settings.freellmapiBaseUrl);
    }
    const result = await syncFreeLlmApiCatalog(body?.baseUrl ? { baseUrl: body.baseUrl } : {});
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
