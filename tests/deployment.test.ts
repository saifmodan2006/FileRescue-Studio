import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApp} from '../server/app';
import {getServerConfig} from '../server/config';
import {onRequest} from '../functions/api/[[route]]';

const origin = 'https://studio.example';
const backend = 'https://studio-backend.example';
const secret = '0'.repeat(64);
const env = {STUDIO_API_ORIGIN:backend,STUDIO_PROXY_SECRET:secret};
afterEach(() => vi.unstubAllGlobals());

describe('hosted configuration',() => {
  it('fails closed unless storage, HTTPS origin, and gateway credentials are configured',() => {
    expect(() => getServerConfig({RENDER:'true'})).toThrow(/Hosted mode requires/);
    expect(() => getServerConfig({
      STUDIO_HOSTED:'true', DATABASE_URL:'postgres://localhost/test',
      PUBLIC_ORIGIN:'https://studio.example/other',STUDIO_PROXY_SECRET:secret,
    })).toThrow(/exact HTTPS origin/);
    expect(getServerConfig({
      STUDIO_HOSTED:'true',DATABASE_URL:'postgres://localhost/test',
      PUBLIC_ORIGIN:origin,STUDIO_PROXY_SECRET:secret,PORT:'10000',SECURE_COOKIES:'false',
    })).toMatchObject({host:'0.0.0.0',port:10000,secure:true,hosted:true});
  });

  it('keeps the Render probe open and protects API responses behind the gateway',async () => {
    const app = await createApp({path:':memory:',origins:[origin],proxySecret:secret,secure:true});
    try {
      expect((await app.inject('/healthz')).statusCode).toBe(200);
      expect((await app.inject('/api/config')).statusCode).toBe(403);
      const res = await app.inject({url:'/api/config',headers:{'x-studio-proxy':secret}});
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {await app.close();}
  });
});

describe('Pages API function',() => {
  it('rejects cross-origin mutations and refuses to forward oversized bodies',async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch',upstream);
    const send = (headers:HeadersInit,body:string) => onRequest({
      request:new Request(origin+'/api/feedback',{method:'POST',headers,body}),env,
    });
    expect((await send({'Origin':'https://other.example','Content-Type':'application/json'},'{}')).status).toBe(403);
    expect((await send({'Origin':origin,'Content-Type':'application/json'},JSON.stringify('x'.repeat(8200)))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('passes only the studio cookie and configured headers and keeps the upstream cookie host-only',async () => {
    const session = 'z'.repeat(43);
    const cookie = 'studio_session='+session+'; Path=/api; HttpOnly; Secure; SameSite=Strict';
    const upstream = vi.fn(async () => Response.json({ok:true},{headers:{'Set-Cookie':cookie}}));
    vi.stubGlobal('fetch',upstream);
    const response = await onRequest({
      request:new Request(origin+'/api/admin/logout',{
        method:'POST',headers:{'Origin':origin,'Cookie':'tracking=ignored; studio_session='+session,'X-CSRF-Token':'test',
          'CF-Connecting-IP':'198.51.100.10','X-Studio-Client-IP':'198.51.100.20','X-Studio-Proxy':'fake'},
      }),env,
    });
    expect(response.headers.get('set-cookie')).toBe(cookie);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [[target,options]] = upstream.mock.calls as unknown as [[string, RequestInit]];
    expect(target).toBe(backend+'/api/admin/logout');
    expect(Object.fromEntries(new Headers(options.headers))).toMatchObject({
      'x-studio-proxy':secret,'x-studio-client-ip':'198.51.100.10','origin':origin,'cookie':'studio_session='+session,
    });
    expect(options.redirect).toBe('manual');
  });

  it('normalizes Render cold-start or missing configuration into a JSON 503',async () => {
    vi.stubGlobal('fetch',async () => new Response('<html>Starting</html>',{status:200,headers:{'Content-Type':'text/html'}}));
    const request = new Request(origin+'/api/config');
    for (const config of [env,{}]) {
      const response = await onRequest({request,env:config});
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });
});
