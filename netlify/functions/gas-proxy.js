// Netlify Function: CORS proxy -> Google Apps Script /exec
const ALLOW_ORIGIN = "*"; // or set to your site origin

export default async (req, context) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Health check
  const inUrl = new URL(req.url);
  if (inUrl.searchParams.get("ping")) {
    return json({ ok: true, proxy: "ready" });
  }

  const target = process.env.GAS_EXEC_URL;
  if (!target) return json({ ok: false, error: "Missing GAS_EXEC_URL env var" }, 500);

  // Build upstream URL (preserve query)
  const outUrl = new URL(target);
  if (inUrl.search) outUrl.search = inUrl.search;

  // ----- READ BODY INTO STRING (no streaming/duplex) -----
  let bodyText = undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    try {
      bodyText = await req.text(); // string, not stream
    } catch {
      bodyText = undefined;
    }
  }

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : bodyText,
    redirect: "follow",
    // DO NOT set duplex/keepalive here; we are sending a plain string body
  };

  try {
    const upstream = await fetch(outUrl.toString(), init);

    // Buffer upstream and NORMALIZE headers (avoid gzip decode issues)
    const buf = await upstream.arrayBuffer();
    const safe = new Headers();
    safe.set(
      "content-type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
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
