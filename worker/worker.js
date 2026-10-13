// Cloudflare Worker: AI booking assistant backend.
// POST /chat  { messages: [{role, content}, ...], sessionId }  ->  { reply, lead? }
import { systemPrompt } from "./knowledge.js";

const API = "https://api.anthropic.com/v1/messages";
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;

const TOOLS = [{
  name: "save_request",
  description: "Save the guest's booking request and notify the team. Call once when tour, date, guests and contact are known.",
  input_schema: {
    type: "object",
    properties: {
      tour: { type: "string" },
      date: { type: "string", description: "Requested date as the guest wrote it" },
      guests: { type: "string", description: "Number of adults and children" },
      budget: { type: "string" },
      contact: { type: "string", description: "Guest name and phone or email" },
      language: { type: "string", description: "Language the guest writes in" },
      notes: { type: "string", description: "Questions or special requests for the team" },
    },
    required: ["tour", "date", "guests", "contact"],
  },
}];

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

function clean(messages) {
  if (!Array.isArray(messages)) return null;
  const out = messages.slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (out.length && out[0].role !== "user") out.shift();   // must start with a user turn
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

async function callModel(env, messages) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.MODEL || "claude-sonnet-5-5",
      max_tokens: 500,
      system: systemPrompt(),
      tools: TOOLS,
      messages,
    }),
  });
  if (!r.ok) throw new Error("model error " + r.status);
  return r.json();
}

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

async function notify(env, lead, sessionId) {
  const text =
    "New booking request\n" +
    Object.entries(lead).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\nsession: ${sessionId || "-"}`;
  const jobs = [];
  if (env.NOTIFY_WEBHOOK) {            // Slack / Make / Zapier / Google Apps Script, etc.
    jobs.push(fetch(env.NOTIFY_WEBHOOK, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lead, sessionId }),
    }));
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }));
  }
  await Promise.allSettled(jobs);
}

export default {
  async fetch(request, env) {
    const { ok, headers } = cors(env, request.headers.get("Origin") || "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/chat") return json({ error: "not found" }, 404, headers);
    if (!ok) return json({ error: "origin not allowed" }, 403, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, headers); }
    const messages = clean(body.messages);
    if (!messages) return json({ error: "bad messages" }, 400, headers);

    try {
      let data = await callModel(env, messages);
      let lead = null;

      if (data.stop_reason === "tool_use") {
        const call = data.content.find((b) => b.type === "tool_use" && b.name === "save_request");
        if (call) {
          lead = call.input;
          await notify(env, lead, body.sessionId);
          data = await callModel(env, [
            ...messages,
            { role: "assistant", content: data.content },
            { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: "Saved. The team has been notified." }] },
          ]);
        }
      }
      const reply = textOf(data.content) || "Thank you! Our team will contact you shortly.";
      return json({ reply, lead }, 200, headers);
    } catch (e) {
      return json({ error: "assistant unavailable" }, 502, headers);
    }
  },
};
