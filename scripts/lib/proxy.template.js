// clodsite:proxy
// Rendered by scripts/lib/render-functions.mjs from build-plan.yaml `proxies`.
// Deployed as functions/<mount>/[[path]].js — an authenticated pass-through
// to a fixed upstream (proxy-functions design §1). The upstream URL, fixed
// headers, and route lists are baked in at render time; credentials live in
// Pages secrets and are attached server-side only.
export async function onRequest(context) {
  const CONFIG = {{CONFIG}};

  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // params.path arrives as decoded segments; re-encode each so a decoded
  // "?" or "#" inside a segment cannot start the query or fragment early.
  const segments = Array.isArray(params.path)
    ? params.path
    : typeof params.path === 'string' && params.path !== ''
      ? params.path.split('/')
      : [];
  const subpath = segments.map(encodeURIComponent).join('/');
  const search = new URL(request.url).search;

  let target;
  try {
    target = new URL(CONFIG.upstream + '/' + subpath + search);
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  // Dot-segment traversal guard: after URL resolution the target must still
  // sit under the configured upstream prefix.
  if (target.href !== CONFIG.upstream && !target.href.startsWith(CONFIG.upstream + '/')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Forwarded headers are built fresh — client cookies and any
  // client-supplied Authorization or configured header never reach upstream.
  const headers = {};
  for (const name of ['content-type', 'accept']) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  for (const [name, value] of Object.entries(CONFIG.headers)) {
    headers[name.toLowerCase()] = value;
  }

  const routeKey = method + ' ' + subpath;

  if (CONFIG.authenticated.includes(routeKey)) {
    const secret = CONFIG.secret ? env[CONFIG.secret] : '';
    if (!secret) {
      return Response.json({ error: 'Not configured' }, { status: 500 });
    }
    headers['authorization'] = 'Bearer ' + secret;
  }

  let body = method === 'POST' ? request.body : undefined;

  if (CONFIG.turnstile.routes.includes(routeKey)) {
    // Never fail open: a turnstile-guarded route without its secret is down.
    if (!env.TURNSTILE_SECRET_KEY) {
      return Response.json({ error: 'Not configured' }, { status: 500 });
    }
    const bodyText = await request.text();
    body = bodyText;
    const token = new URLSearchParams(bodyText).get('cf-turnstile-response') || '';
    if (!token) {
      return Response.json({ error: 'verification failed' }, { status: 403 });
    }
    let verification;
    try {
      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: request.headers.get('CF-Connecting-IP') || undefined,
          }),
        },
      );
      verification = await verifyResponse.json();
    } catch {
      return Response.json({ error: 'verification failed' }, { status: 403 });
    }
    // hostnames is a deploy-time marker string until provisioning replaces
    // it with the real hostname list — an unprovisioned function fails
    // closed. (Never write the literal marker here: the post-patch
    // verifier greps for it and would refuse to deploy.)
    const hostnames = Array.isArray(CONFIG.turnstile.hostnames)
      ? CONFIG.turnstile.hostnames
      : [];
    if (
      verification.success !== true ||
      verification.action !== CONFIG.turnstile.action ||
      !hostnames.includes(verification.hostname)
    ) {
      return Response.json({ error: 'verification failed' }, { status: 403 });
    }
  }

  // Stream the upstream response back verbatim — status, headers, body.
  // parchment's Cache-Control: no-store on /cert/<token> must survive.
  return fetch(target.toString(), { method, headers, body });
}
