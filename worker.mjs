// TenderRisk confirmation endpoint. Secrets are configured in Cloudflare, never here.
const ORIGINS = new Set(['https://tenderrisk.eu', 'https://www.tenderrisk.eu']);
const HOSTNAMES = new Set(['tenderrisk.eu', 'www.tenderrisk.eu']);
const SUBJECT = 'TenderRisk — Early Access registration received | Registrierung erhalten';
const TEXT = `Thank you for registering for TenderRisk Early Access and completing our questionnaire.

We will review your information and contact you about the next steps.
Your information is handled confidentially. We do not sell your information or share it with third parties for marketing purposes.

Vielen Dank für Ihre Registrierung für TenderRisk Early Access und das Ausfüllen unseres Fragebogens.

Wir werden Ihre Angaben prüfen und Sie zu den nächsten Schritten kontaktieren.
Ihre Angaben werden vertraulich behandelt. Wir verkaufen Ihre Daten nicht und geben sie nicht zu Marketingzwecken an Dritte weiter.

TenderRisk
European Construction Intelligence
hello@tenderrisk.eu
https://tenderrisk.eu`;

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;color:#20272d;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Thank you for your registration. Vielen Dank für Ihre Registrierung.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d9dddf;border-radius:16px;">
<tr><td style="padding:32px 32px 24px;border-bottom:1px solid #d9dddf;">
<a href="https://tenderrisk.eu" style="color:#23465b;text-decoration:none;"><img src="https://tenderrisk.eu/tenderrisk-logo.png" alt="TenderRisk" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;"></a>
<p style="margin:16px 0 0;font-size:11px;letter-spacing:1px;color:#69737a;">EUROPEAN CONSTRUCTION INTELLIGENCE</p></td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;">
<div lang="en"><h1 style="margin:0 0 16px;font-size:23px;line-height:1.3;color:#23465b;">Thank you for your interest.</h1>
<p>Thank you for registering for TenderRisk Early Access and completing our questionnaire.</p>
<p>We will review your information and contact you about the next steps.</p>
<p style="color:#69737a;font-size:13px;">Your information is handled confidentially. We do not sell your information or share it with third parties for marketing purposes.</p></div>
<hr style="margin:28px 0;border:0;border-top:1px solid #d9dddf;">
<div lang="de"><h2 style="margin:0 0 16px;font-size:23px;line-height:1.3;color:#23465b;">Vielen Dank für Ihr Interesse.</h2>
<p>Vielen Dank für Ihre Registrierung für TenderRisk Early Access und das Ausfüllen unseres Fragebogens.</p>
<p>Wir werden Ihre Angaben prüfen und Sie zu den nächsten Schritten kontaktieren.</p>
<p style="color:#69737a;font-size:13px;">Ihre Angaben werden vertraulich behandelt. Wir verkaufen Ihre Daten nicht und geben sie nicht zu Marketingzwecken an Dritte weiter.</p></div>
<p style="margin:28px 0 0;"><strong>TenderRisk</strong><br><span style="color:#69737a;font-size:13px;">European Construction Intelligence</span><br>
<a href="mailto:hello@tenderrisk.eu" style="color:#315a73;">hello@tenderrisk.eu</a></p>
</td></tr></table></td></tr></table></body></html>`;

function reply(status, data, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  };
  if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

async function readLimitedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (url.pathname === '/health' && request.method === 'GET') {
      return reply(200, { service: 'TenderRisk confirmation', configured: !!(env.RESEND_API_KEY && env.TURNSTILE_SECRET_KEY) }, origin);
    }
    if (url.pathname !== '/confirm') return reply(404, { error: 'not_found' }, origin);
    if (!ORIGINS.has(origin)) return reply(403, { error: 'origin_not_allowed' }, null);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin', 'Cache-Control': 'no-store'
      }});
    }
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, origin);
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, { error: 'json_required' }, origin);
    }
    if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
      console.error(JSON.stringify({ event: 'confirmation_not_configured' }));
      return reply(503, { error: 'unavailable' }, origin);
    }
    let body;
    try { body = await readLimitedJson(request); }
    catch (error) { return reply(error.message === 'body_too_large' ? 413 : 400, { error: 'invalid_body' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => !['email', 'token'].includes(key)) ||
        typeof body.email !== 'string' || typeof body.token !== 'string') {
      return reply(400, { error: 'invalid_request' }, origin);
    }
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>,;:\\"]+@[^\s@<>,;:\\"]+\.[^\s@<>,;:\\"]{2,}$/.test(email) ||
        body.token.length < 1 || body.token.length > 2048) {
      return reply(400, { error: 'invalid_request' }, origin);
    }
    const requestId = crypto.randomUUID();
    try {
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.token,
          remoteip: request.headers.get('CF-Connecting-IP') || undefined }),
        signal: AbortSignal.timeout(10000)
      });
      if (!verification.ok) throw new Error('verification_unavailable');
      const verified = await verification.json();
      if (!verified.success || !HOSTNAMES.has(verified.hostname) || verified.action !== 'early_access') {
        console.warn(JSON.stringify({ event: 'confirmation_verification_failed', requestId }));
        return reply(403, { error: 'verification_failed', requestId }, origin);
      }
      // Resend keeps idempotency keys for 24 hours. Fixed content and recipient produce
      // the same key and payload, preventing duplicate confirmations during that period.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      const recipientHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json', 'Idempotency-Key': 'early-access-v1/' + recipientHash },
        body: JSON.stringify({ from: 'TenderRisk <hello@tenderrisk.eu>', to: [email],
          reply_to: 'hello@tenderrisk.eu', subject: SUBJECT, html: HTML, text: TEXT }),
        signal: AbortSignal.timeout(15000)
      });
      if (!sent.ok) {
        console.error(JSON.stringify({ event: 'confirmation_send_failed', requestId, providerStatus: sent.status }));
        return reply(502, { error: 'send_failed', requestId }, origin);
      }
      const result = await sent.json();
      if (!result.id) throw new Error('invalid_provider_response');
      console.info(JSON.stringify({ event: 'confirmation_accepted', requestId, emailId: result.id }));
      return reply(200, { accepted: true, requestId }, origin);
    } catch {
      // Never log recipient addresses, questionnaire answers, keys or challenge tokens.
      console.error(JSON.stringify({ event: 'confirmation_unavailable', requestId }));
      return reply(503, { error: 'unavailable', requestId }, origin);
    }
  }
};
