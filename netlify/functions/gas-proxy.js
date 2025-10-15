// Netlify Function: CORS proxy -> Google Apps Script Web App (/exec)
// Set env var GAS_EXEC_URL in Netlify dashboard to your /exec URL.

const ALLOW_ORIGIN = "*"; // or your domain e.g. "https://yoursite.com"

export default async (req, context) => {
  const target = process.env.GAS_EXEC_URL;
  if (!target) {
    return new Response(JSON.stringify({ ok:false, error:"Missing GAS_EXEC_URL env var" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }

  // Handle preflight quickly
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Build target URL (preserve query, e.g. ?fn=echo)
  const inUrl = new URL(req.url);
  const outUrl = new URL(target);
  if (inUrl.search) outUrl.search = inUrl.search;

  // Forward only content-type header; browsers add others we don’t need
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  // Forward body as a stream except for GET/HEAD
  const init = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "follow",
  };

  try {
    const upstream = await fetch(outUrl.toString(), init);

    // Stream back response + CORS
    const resp = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });

    // Add CORS headers (and expose all so you can read JSON)
    addCors(resp.headers);
    return resp;
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error:String(err) }), {
      status: 502,
      headers: corsHeaders(),
    });
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
  Object.keys(ch).forEach(k => h.set(k, ch[k]));
}
