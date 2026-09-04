import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId) return NextResponse.json({ error: "An agent ID is required." }, { status: 400 });
  if (!apiKey) {
    return NextResponse.json(
      { error: "Private-agent sessions are not configured. Set ELEVENLABS_API_KEY or make the agent public." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!response.ok) throw new Error("Credential request failed");
    const data = (await response.json()) as { signed_url?: string };
    if (!data.signed_url) throw new Error("Credential missing");
    return NextResponse.json({ signedUrl: data.signed_url });
  } catch {
    return NextResponse.json({ error: "Could not start a secure voice session." }, { status: 502 });
  }
}
