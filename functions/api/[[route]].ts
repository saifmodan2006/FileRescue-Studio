type Env = {STUDIO_API_ORIGIN?:string; STUDIO_PROXY_SECRET?:string};

function json(status:number,error:string) {
  return Response.json({error},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

async function readBody(body:ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const bytes = new Uint8Array(8192);
  let length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) return bytes.subarray(0,length);
      if (length + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value,length);
      length += value.length;
    }
  } finally {reader.releaseLock();}
}

export async function onRequest({request,env}: {request:Request;env:Env}) {
  const method = request.method;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return json(404,'API route not found.');
  if (!['GET','HEAD','POST','PATCH'].includes(method)) return json(405,'The request method is unavailable.');
  const origin = request.headers.get('Origin');
  if (method !== 'GET' && method !== 'HEAD' && origin !== url.origin) return json(403,'Request origin is not allowed.');

  const backend = URL.parse(env.STUDIO_API_ORIGIN ?? '');
  const secret = env.STUDIO_PROXY_SECRET;
  if (!backend || backend.protocol !== 'https:' || backend.origin !== env.STUDIO_API_ORIGIN || !secret || !/^[a-f0-9]{64}$/.test(secret)) {
    return json(503,'The studio API is unavailable.');
  }
  // Set only headers the application consumes. Provider IP data comes from
  // Cloudflare, and the origin verifies the gateway before trusting it.
  const headers = new Headers({'Accept':'application/json','X-Studio-Proxy':secret});
  for (const name of ['Content-Type','Origin','X-CSRF-Token']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name,value);
  }
  const session = request.headers.get('Cookie')?.split(/;\s*/).find(cookie => /^studio_session=[\w-]{43}$/.test(cookie));
  if (session) headers.set('Cookie',session);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Studio-Client-IP',clientIp);
  if (method === 'POST' || method === 'PATCH') {
    const size = request.headers.get('Content-Length');
    if (size !== null && Number(size) > 8192) return json(413,'The request is too large.');
    if (request.body && !/^application\/json(?:\s*;.*)?$/i.test(headers.get('Content-Type') ?? '')) {
      return json(415,'The request must use JSON.');
    }
  }
  try {
    const body = request.body ? await readBody(request.body) : undefined;
    if (body === null) return json(413,'The request is too large.');
    const response = await fetch(backend.origin + url.pathname + url.search,{
      method, headers, body, redirect:'manual', signal:AbortSignal.timeout(75_000),
    });
    // Render can return a platform HTML page during a cold start.
    if (response.status >= 300 && response.status < 400 || !response.headers.get('Content-Type')?.includes('application/json')) {
      if (response.body) await response.body.cancel();
      if (method === 'HEAD' && response.ok) return new Response(null,{status:response.status,headers:{'Cache-Control':'no-store'}});
      return json(503,'The studio API is starting or unavailable. Please try again shortly.');
    }
    const outgoing = new Headers({
      'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    });
    for (const name of ['Set-Cookie','Retry-After','X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset']) {
      const value = response.headers.get(name);
      if (value !== null) outgoing.set(name,value);
    }
    return new Response(response.body,{status:response.status,headers:outgoing});
  } catch {
    return json(503,'The studio API is starting or unavailable. Please try again shortly.');
  }
}
