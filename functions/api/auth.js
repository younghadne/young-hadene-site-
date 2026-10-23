// POST /api/auth — admin password check for Cloudflare Pages.
// Reads the password ONLY from the ADMIN_PASSWORD environment variable
// (Pages project Settings → Environment variables). Fails closed when the
// variable is not set — secrets must never be hardcoded in the repo.

import { checkAdminPassword } from '../_safe-equal.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let data = {};
    try {
      data = await request.json();
    } catch {
      data = {};
    }
    const auth = await checkAdminPassword(env, data.password);
    if (auth.status === 500) {
      return new Response(JSON.stringify({ ok: false, error: auth.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (auth.ok) {
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
