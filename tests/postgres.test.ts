import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app';
import {hashPassword} from '../server/auth';
import {openStore} from '../server/store';
import {expect,it,vi} from 'vitest';
import {onRequest} from '../functions/api/[[route]]';

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const origin = 'https://studio.example';
const proxySecret = '1'.repeat(64);

it.skipIf(!databaseUrl)('migrates PostgreSQL and persists sessions, feedback, settings and analytics across API restarts',async () => {
  const url = new URL(databaseUrl!);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !url.pathname.startsWith('/studio_test_')) {
    throw new Error('Use a disposable local PostgreSQL database with a name starting with studio_test_.');
  }
  const config = {path:':memory:',databaseUrl,origins:[origin],proxySecret,secure:true};
  const credentials = {username:'reviewer-'+randomBytes(8).toString('hex'),password:randomBytes(20).toString('hex')};
  const store = await openStore(config);
  try {await store.createAdmin(credentials.username,await hashPassword(credentials.password));}
  finally {await store.close();}
  let app = await createApp(config);
  // Exercise the actual Pages handler against Fastify and PostgreSQL.
  vi.stubGlobal('fetch',async (target:string,init:RequestInit) => {
    const {pathname,search} = new URL(target);
    const headers = Object.fromEntries(new Headers(init.headers));
    const payload = init.body == null ? undefined : Buffer.from(init.body as Uint8Array);
    const res = await app.inject({
      url:pathname+search,method:init.method as 'GET'|'POST'|'PATCH',headers,payload,
    });
    const outgoing = new Headers();
    for (const [key,value] of Object.entries(res.headers)) {
      if (value !== undefined) outgoing.set(key,String(value));
    }
    return new Response(res.body,{status:res.statusCode,headers:outgoing});
  });
  const request = (path:string,method='GET',body?:unknown,headers?:Record<string,string>) => onRequest({
    env:{STUDIO_API_ORIGIN:'https://studio-backend.example',STUDIO_PROXY_SECRET:proxySecret},
    request:new Request(origin+'/api/'+path,{method,headers:{
      'Origin':origin,'CF-Connecting-IP':'198.51.100.10',
      ...(body !== undefined && {'Content-Type':'application/json'}), ...headers,
    },body:body === undefined ? undefined : JSON.stringify(body)}),
  });
  try {
    expect((await request('health')).status).toBe(200);
    expect((await request('admin/overview')).status).toBe(401);
    const login = await request('admin/login','POST',credentials);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toMatch(/Domain=/i);
    const session = {Cookie:cookie.split(';')[0],'X-CSRF-Token':(await login.json()).csrf as string};
    expect((await request('admin/settings','PATCH',{analyticsEnabled:true}, {Cookie:session.Cookie})).status).toBe(403);
    const message = 'Deployment smoke test '+credentials.username;
    const patched = await request('admin/settings','PATCH',{analyticsEnabled:true,announcement:message,feedbackEnabled:true},session);
    expect(patched.status).toBe(200);
    expect((await request('feedback','POST',{category:'idea',message})).status).toBe(201);
    expect((await request('events','POST',{consent:true,format:'PDF',outcome:'verified'})).status).toBe(201);

    await app.close();
    app = await createApp(config);
    expect(await (await request('config')).json()).toMatchObject({announcement:message,analyticsEnabled:true});
    expect(await (await request('admin/session','GET',undefined,session)).json()).toMatchObject({username:credentials.username});
    const list = await (await request('admin/feedback','GET',undefined,session)).json() as {message:string;id:number;created:number}[];
    const item = list.find(row => row.message === message)!;
    expect(item.created).toBeTypeOf('number');
    const updated = await request('admin/feedback/'+item.id,'PATCH',{state:'reviewed'},session);
    expect(await updated.json()).toMatchObject({state:'reviewed'});
    expect(await (await request('admin/analytics','GET',undefined,session)).json()).toEqual(expect.arrayContaining([
      expect.objectContaining({format:'PDF',outcome:'verified',count:expect.any(Number)}),
    ]));
    expect((await request('admin/logout','POST',undefined,session)).status).toBe(200);
    expect((await request('admin/session','GET',undefined,session)).status).toBe(401);
  } finally {
    vi.unstubAllGlobals();
    await app.close();
  }
},20_000);
