export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, authorization',
        },
      });
    }

    // Only proxy POST /chat/completions
    if (request.method !== 'POST' || url.pathname !== '/chat/completions') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const body = await request.text();
      const auth = request.headers.get('Authorization');

      const resp = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : {}),
        },
        body,
      });

      const h = new Headers(resp.headers);
      h.set('Access-Control-Allow-Origin', '*');

      return new Response(resp.body, { status: resp.status, headers: h });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
