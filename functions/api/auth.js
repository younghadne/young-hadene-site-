// POST /api/auth — admin password check for Cloudflare Pages.
// Reads the password from the ADMIN_PASSWORD environment variable
// (Pages project Settings → Environment variables). Falls back to the
// default only when the variable is not set, so the dashboard keeps
// working immediately after deploy.
const FALLBACK_PASSWORD = 'HadeneCalixte1998';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let data = {};
    try {
      data = await request.json();
    } catch {
      data = {};
    }
    const expected = (env && env.ADMIN_PASSWORD) || FALLBACK_PASSWORD;
    if (data.password && timingSafeEqual(String(data.password), String(expected))) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Incorrect password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
