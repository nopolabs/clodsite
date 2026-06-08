export async function onRequestPost(context) {
  const { RESEND_API_KEY } = context.env;
  if (!RESEND_API_KEY) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  const CONFIG = {{CONFIG}};

  let data;
  try {
    data = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON' }, { status: 400 });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return Response.json(
      { ok: false, error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  for (const field of CONFIG.fields) {
    const val = String(data[field.name] ?? '').trim();
    if (field.required && !val) {
      return Response.json({ ok: false, error: 'Missing required field' }, { status: 400 });
    }
    if (val.length > (field.maxLength || 10000)) {
      return Response.json({ ok: false, error: 'Field too long' }, { status: 400 });
    }
  }

  const body = CONFIG.fields
    .map((field) => `${field.name}: ${String(data[field.name] ?? '')}`)
    .join('\n\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      to: [CONFIG.to],
      from: CONFIG.from,
      subject: CONFIG.subject,
      text: body,
    }),
  });

  return res.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: 'Email delivery failed' }, { status: 502 });
}
