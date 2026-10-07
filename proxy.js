export async function onRequestPost(context) {
  const { request } = context;

  try {
    const body = await request.text();
    let data;
    try { data = JSON.parse(body); } catch { data = {}; }

    // Route to Cloudflare API for deployments
    if (data._target === 'cf') {
      const cfToken = data._cfToken;
      const cfPath = data._cfPath || '';
      const cfMethod = (data._cfMethod || 'POST').toUpperCase();
      const cfBody = data._cfBody;

      const opts = {
        method: cfMethod,
        headers: {
          'Authorization': 'Bearer ' + cfToken,
          'Content-Type': 'application/json',
        },
      };
      if (cfBody && cfMethod !== 'GET' && cfMethod !== 'HEAD') {
        opts.body = typeof cfBody === 'string' ? cfBody : JSON.stringify(cfBody);
      }

      const resp = await fetch('https://api.cloudflare.com/client/v4/' + cfPath, opts);

      const respData = await resp.json();
      return new Response(JSON.stringify(respData), {
        status: resp.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Route to OpenCode Zen / AI API
    const auth = request.headers.get('Authorization') || (data._auth ? 'Bearer ' + data._auth : '');
    const apiBody = data._payload || body;

    const resp = await fetch('https://opencode.ai/zen/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: typeof apiBody === 'string' ? apiBody : JSON.stringify(apiBody),
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
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
