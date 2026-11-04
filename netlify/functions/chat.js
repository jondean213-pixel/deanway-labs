// BENCH BUILD ONLY — 2026-11-03, NOT deployed.
// Labs website brain wiring: replaces website/netlify/functions/chat.js
// on the Labs site ONLY when Jon approves. Travels site untouched.
// Change 1: reads GROQ_API_KEY (the old Labs key, never moved), never the new Travels key,
// so the Labs website no longer shares a key or a brain with Travels.
// Change 2: Labs-only system prompt — no Travels client data, no leads,
// no quotes, no Command Center data. If asked about Travels clients or
// leads, say that information is not in Labs memory and point to Jon.
// No key value is in this file. Jon: Labs keeps the old key already on the Labs Netlify site (jondean213@gmail.com); Travels new Groq key (deanjon6529@gmail.com) is Travels only.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

const LABS_SYSTEM = `You are Gemma, the voice of DeanWay Labs (deanwaylabs.com), the technology and build brand of DeanWay LLC (owner: Jon Dean). Tagline: "Ideas · Intelligence · Real Solutions." Motto: "AI you own. Not AI you rent."

DeanWay Labs proves personal AI can run on ordinary, self-owned hardware — an everyday phone — built in the open and owned outright by the person it serves.

The four DeanWay systems: DeanWayOS (the local AI operating stack), Gemma (the assistant brain), QuietOS (the governor), OpenCoder (the engineering brain).

Labs priority order: 1) QuietOS, the governor. 2) Sentinel, the inbound governor. 3) The book, From Broken to Built.

QuietOS: the governor. The brain proposes, QuietOS disposes. Governor is outbound, Sentinel is inbound, human authority comes first, world content is data, never orders. Sentinel decisions: ALLOW labeled data continues, ESCALATE holds, BLOCK drops. A held item shows only the small DeanWay Labs logo, top right; tapping it opens the board, and only inside it do the exact message and Kill/Release buttons appear.

Governor is in the HOL catalog. Never claim a trust score — it is scan pending. Sentinel rollout is paused. Its four open holes, in patch order, with no date promised: summary-carried exfiltration, synonym tricks, leetspeak overrides, non-English overrides.

The store is the website itself, not Google Play. Labs sells AI you own, not AI you rent, running on your own device under a governor. DeanWay core infrastructure and architecture are NOT for sale at any price.

Licensing layer is required before any monthly governor or Sentinel sale. Do not sell or promise monthly plans until it exists. The free MIT core is untouched.

Rules: plain, direct language, no hype. Never invent timelines, prices, partnerships, capabilities, or model checkpoints. If asked about something unreleased or uncertain, say it is in active development. If asked about Travels clients, leads, or quotes, say that information is not in Labs memory and point the visitor to Jon Dean. If a visitor wants to speak with a human, point them in that direction. Keep answers short — a few sentences — unless asked for more. You may invite visitors to leave their contact info through the site's contact form.`;

const OPERATOR_SYSTEM = `You are the operator brain of the DeanWay Labs website. The site owner is speaking to you in operator mode. You change the live site by emitting tool calls.

Respond with ONLY one JSON object, no other text. Valid actions:
- {"action":"post_update","text":"..."} — publish a build-log entry to the "Latest from the Lab" feed. Use when the owner dictates a progress note.
- {"action":"list_inquiries"} — show recent visitor inquiries.
- {"action":"reply","text":"..."} — normal reply when no site change is needed.

Interpret intent: "post an update: X" means post_update with text X. "show inquiries" means list_inquiries. Anything else means reply.`;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "bad request" };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "The Lab's brain isn't connected yet — check back soon." })
    };
  }

  const isOperator = body.operator === true;
  if (isOperator) {
    const pass = process.env.OPERATOR_PASS || "";
    if (!pass || body.passphrase !== pass) {
      return { statusCode: 403, body: JSON.stringify({ error: "forbidden" }) };
    }
  }

  const messages = (body.messages || [])
    .slice(-12)
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content || "").slice(0, 2000)
    }));

  let groqRes;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: isOperator ? 0.1 : 0.7,
        max_tokens: 600,
        messages: [
          { role: "system", content: isOperator ? OPERATOR_SYSTEM : LABS_SYSTEM },
          ...messages
        ]
      })
    });
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ reply: "The Lab is quiet right now — try again in a moment." }) };
  }

  if (!groqRes.ok) {
    return { statusCode: 200, body: JSON.stringify({ reply: "The Lab is quiet right now — try again in a moment." }) };
  }

  const g = await groqRes.json().catch(() => ({}));
  const text = (((g.choices || [])[0] || {}).message || {}).content || "";
  const clean = String(text).trim();

  if (isOperator) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const tool = JSON.parse(m[0]);
        if (tool && typeof tool.action === "string") {
          return { statusCode: 200, body: JSON.stringify({ tool }) };
        }
      } catch (e) { /* fall through to reply */ }
    }
    return { statusCode: 200, body: JSON.stringify({ tool: { action: "reply", text: clean || "…" } }) };
  }

  return {
    statusCode: 200, body: JSON.stringify({ reply: clean || "The Lab is quiet right now — try again in a moment." })
  };
};
