// Netlify Function: CORS proxy -> Google Apps Script Web App (/exec)
// Needs env var GAS_EXEC_URL set to your Apps Script /exec URL.

const ALLOW_ORIGIN = "*"; // or "https://campheindel.netlify.app"

export default async (req, context) => {
  // Preflight fast-path
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Healthcheck: /.netlify/functions/gas-proxy?ping=1
  const inUrl = new URL(req.url);
  if (inUrl.searchParams.get("ping")) {
    return json({ ok: true, proxy: "ready" }, 200);
  }

  const target = process.env.GAS_EXEC_URL;
  if (!target) {
    return json({ ok: false, error: "Missing GAS_EXEC_URL env var" }, 500);
  }

  // Build upstream URL and preserve query string
  const outUrl = new URL(target);
  if (inUrl.search) outUrl.search = inUrl.search;

  // Only forward minimal headers needed
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

    // Stream upstream body through; add CORS
    const resp = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
    addCors(resp.headers);
    return resp;
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
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}
