import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("lab-inquiries");
  const url = new URL(req.url);

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response("bad request", { status: 400 });
    }
    const email = String(body.email || "").slice(0, 200).trim();
    if (!email || !email.includes("@")) {
      return Response.json({ error: "valid email required" }, { status: 400 });
    }
    let list = (await store.get("list", { type: "json" })) || [];
    list.unshift({
      date: new Date().toISOString(),
      name: String(body.name || "").slice(0, 120).trim(),
      email,
      interest: String(body.interest || "").slice(0, 300).trim()
    });
    list = list.slice(0, 200);
    await store.setJSON("list", list);
    return Response.json({ ok: true });
  }

  if (req.method === "GET") {
    const pass = process.env.OPERATOR_PASS || "";
    const q = url.searchParams.get("passphrase") || "";
    if (!pass || q !== pass) {
      return new Response("forbidden", { status: 403 });
    }
    const list = (await store.get("list", { type: "json" })) || [];
    return Response.json({ inquiries: list });
  }

  return new Response("Method not allowed", { status: 405 });
};
