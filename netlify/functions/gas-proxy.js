// netlify/functions/gas-proxy.js
const ALLOW_ORIGIN = "*"; // or "https://campheindel.netlify.app"

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  const inUrl = new URL(req.url);
  if (inUrl.searchParams.get("ping")) return json({ ok: true, proxy: "ready" });

  const target = process.env.GAS_EXEC_URL;
  if (!target) return json({ ok: false, error: "Missing GAS_EXEC_URL env var" }, 500);

  // Build upstream URL and preserve query
  const outUrl = new URL(target);
  if (inUrl.search) outUrl.search = inUrl.search;

  // Minimal headers through
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "follow",
  };

  try {
    const upstream = await fetch(outUrl.toString(), init);

    // Read raw bytes so we control encoding headers
    const buf = await upstream.arrayBuffer();

    // Copy only safe headers; drop encodings that confuse the browser
    const safe = new Headers();
    // Prefer upstream content-type or default to JSON
    safe.set("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    // CORS
    addCors(safe);

    return new Response(buf, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: safe,
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 502);
  }
};

function corsHeaders() {
  return {
    "access-control-allow-origin": ALLOW_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
  };
}
function addCors(h) {
  const ch = corsHeaders();
  Object.keys(ch).forEach((k) => h.set(k, ch[k]));
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}
