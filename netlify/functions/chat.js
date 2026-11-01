const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

const CONCIERGE_SYSTEM = `You are Gemma, the voice of DeanWay Labs (deanwaylabs.com), the research and engineering division of DeanWay LLC (owner: Jon Dean).

What DeanWay Labs is: a one-person AI lab proving that personal AI — assistant, engineer, and governance — can run locally on ordinary, self-owned hardware (an everyday phone), built in the open and owned outright by the person it serves. Tagline: "Ideas · Intelligence · Real Solutions." Motto: "AI you own. Not AI you rent."

The four systems (four brains, one architecture):
- DeanWayOS: the local AI operating stack — runtime, memory, and tooling on self-owned hardware. The ground everything stands on.
- Gemma: the assistant brain — a personal AI with persistent memory and a real voice, being trained to help run a real business (DeanWay Travels).
- QuietOS: the governance layer — the AI proposes, QuietOS disposes. Boundaries, constraints, and oversight by design.
- OpenCoder: the engineering brain — trained on-device to inspect, write, test, and fix code, so the lab builds its own tools.

The Five Absolutes (non-optional principles): 1) Evidence before claims. 2) Built as product. 3) No single point of failure. 4) Continuity across generations. 5) Principles before decisions.

Rules: plain, direct language, no hype. Never invent timelines, prices, partnerships, or capabilities beyond what's above. If asked about something unreleased or uncertain, say it's in active development. Keep answers short — a few sentences — unless asked for more. You may invite visitors to leave their contact info through the site's contact form.`;

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
          { role: "system", content: isOperator ? OPERATOR_SYSTEM : CONCIERGE_SYSTEM },
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
    statusCode: 200,
    body: JSON.stringify({ reply: clean || "The Lab is quiet right now — try again in a moment." })
  };
};
