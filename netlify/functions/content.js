import { getStore } from "@netlify/blobs";

const SEED = [
  {
    date: new Date().toISOString(),
    text: "DeanWay Labs goes live — an AI-operated website. The Lab Concierge is online, and the build log you're reading is published by the AI that runs this site."
  }
];

export default async (req) => {
  const store = getStore("lab-content");

  if (req.method === "GET") {
    let updates = await store.get("updates", { type: "json" });
    if (!updates) {
      updates = SEED;
      await store.setJSON("updates", updates);
    }
    return Response.json({ updates });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response("bad request", { status: 400 });
    }
    const pass = process.env.OPERATOR_PASS || "";
    if (!pass || body.passphrase !== pass) {
      return new Response("forbidden", { status: 403 });
    }
    const text = String(body.text || "").slice(0, 500).trim();
    if (!text) return new Response("empty", { status: 400 });
    let updates = (await store.get("updates", { type: "json" })) || [];
    updates.unshift({ date: new Date().toISOString(), text });
    updates = updates.slice(0, 50);
    await store.setJSON("updates", updates);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
