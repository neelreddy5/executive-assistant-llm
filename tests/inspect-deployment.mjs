const origin = "https://executive-assistant-gold-tau.vercel.app";
const html = await (await fetch(origin)).text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
for (const path of scripts) {
  const text = await (await fetch(new URL(path, origin))).text();
  const markers = ["Mute assistant", "show_calendar_events", "Joining you", "onConversationCreated", "No active conversation"].filter((marker) => text.includes(marker));
  console.log(path, JSON.stringify(markers));
}
