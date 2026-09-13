import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId) return NextResponse.json({ error: "An agent ID is required." }, { status: 400 });
  if (!apiKey) {
    return NextResponse.json(
      { code: "PUBLIC_AGENT_ONLY", error: "Private-agent sessions are not configured. Set ELEVENLABS_API_KEY or make the agent public." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!response.ok) {
      // Do not log the API key, signed URL, or raw upstream response.
      console.error("ElevenLabs credential request failed", { status: response.status });
      const error = response.status === 401 || response.status === 403
        ? "ElevenLabs rejected the server credentials. Check ELEVENLABS_API_KEY and its agent permissions in this deployment."
        : response.status === 404
          ? "ElevenLabs could not find this agent. Check the deployed agent ID and API-key workspace."
          : response.status === 429
            ? "ElevenLabs is limiting session requests. Please try again shortly."
            : "ElevenLabs could not authorize a voice session. Please try again shortly.";
      return NextResponse.json({ error }, { status: 502 });
    }
    const data = (await response.json()) as { signed_url?: string };
    if (!data.signed_url) throw new Error("Credential missing");
    return NextResponse.json({ signedUrl: data.signed_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not start a secure voice session." }, { status: 502 });
  }
}
