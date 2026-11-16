import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createApp} from '../server/app';
import {openDatabase} from '../server/db';
import {admins} from '../server/schema';
import {hashPassword} from '../server/auth';

let app: FastifyInstance;
let folder: string;
let path: string;
const origin = 'http://localhost:5173';
const credentials = {username:'reviewer',password:'test-only-account-72'};
const patchSettings = (headers: Record<string,string>, payload:unknown) =>
  app.inject({method:'PATCH',url:'/api/admin/settings',headers,payload:payload as object});
const login = () => app.inject({method:'POST',url:'/api/admin/login',headers:{origin},payload:credentials});
function session(response: Awaited<ReturnType<typeof login>>) {
  const header = response.headers['set-cookie'] as string;
  expect(header).toMatch(/HttpOnly/i);
  expect(header).toMatch(/SameSite=Strict/i);
  return {cookie:header.split(';')[0], 'x-csrf-token':response.json().csrf as string,origin};
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(),'filerescue-api-'));
  path = join(folder,'test.sqlite');
  const fixture = openDatabase(path);
  await fixture.db.insert(admins).values({username:credentials.username,password:await hashPassword(credentials.password)}).run();
  fixture.close();
  app = await createApp({path,origins:[origin]});
});
afterEach(async () => {
  await app?.close();
  rmSync(folder,{recursive:true,force:true});
});

describe('optional service',() => {
  it('runs migrations idempotently and persists feedback across connections',async () => {
    const health = await app.inject('/api/health');
    expect(health.json()).toEqual({status:'ok',database:'ready'});
    const payload = {category:'idea',message:'Please show another help example.'};
    const created = await app.inject({method:'POST',url:'/api/feedback',headers:{origin},payload});
    expect(created.statusCode).toBe(201);
    const second = await createApp({path,origins:[origin]});
    try {
      const response = await second.inject({method:'POST',url:'/api/admin/login',headers:{origin},payload:credentials});
      const headers = session(response);
      const res = await second.inject({url:'/api/admin/feedback',headers});
      expect(res.json()).toMatchObject([{...payload,state:'new'}]);
      const {id} = res.json()[0];
      const changed = await second.inject({method:'PATCH',url:'/api/admin/feedback/'+id,headers,payload:{state:'resolved'}});
      expect(changed.json()).toMatchObject({id,state:'resolved'});
      const missing = await second.inject({method:'PATCH',url:'/api/admin/feedback/999',headers,payload:{state:'resolved'}});
      expect(missing.statusCode).toBe(404);
    } finally {await second.close();}
  });

  it('validates feedback, origin and body size without reflecting the payload',async () => {
    const method = 'POST';
    const url = '/api/feedback';
    const invalid = await app.inject({method,url,headers:{origin},payload:{category:'idea',message:'small'}});
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain('small');
    const cross = await app.inject({method,url,headers:{origin:'https://other.example'},payload:{category:'idea',message:'Message meets minimum length'}});
    expect(cross.statusCode).toBe(403);
    const large = await app.inject({method,url,headers:{origin},payload:{category:'bug',message:'x'.repeat(9000)}});
    expect(large.statusCode).toBe(413);
  });

  it('requires opt-in as well as an enabled setting for usage events',async () => {
    const url = '/api/events';
    const payload = {consent:true,format:'PDF',outcome:'partial'};
    expect((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode).toBe(403);
    const headers = session(await login());
    expect((await patchSettings(headers,{analyticsEnabled:true,announcement:'Testing settings'})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url,headers:{origin},payload:{...payload,consent:false}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url,headers:{origin},payload:{...payload,filename:'private.pdf'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode).toBe(201);
    expect((await app.inject({url:'/api/admin/analytics',headers})).json()).toEqual([{format:'PDF',outcome:'partial',count:1}]);
    expect((await app.inject('/api/config')).json()).toMatchObject({announcement:'Testing settings'});
  });
});

describe('admin security',() => {
  it('rejects unauthenticated access, verifies CSRF and revokes a logged-out session',async () => {
    for (const path of ['overview','session','feedback','analytics','settings']) {
      expect((await app.inject('/api/admin/'+path)).statusCode).toBe(401);
    }
    const response = await login();
    expect(response.statusCode).toBe(200);
    const headers = session(response);
    expect((await app.inject({url:'/api/admin/session',headers})).json().username).toBe('reviewer');
    const noToken = await patchSettings({origin,cookie:headers.cookie},{announcement:'Should fail'});
    expect(noToken.statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/admin/logout',headers})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/admin/session',headers})).statusCode).toBe(401);
  });

  it('enforces expiration on the server and can issue Secure cookies',async () => {
    const temporary = await createApp({path,origins:[origin],ttl:150,secure:true});
    try {
      const response = await temporary.inject({method:'POST',url:'/api/admin/login',headers:{origin},payload:credentials});
      expect(response.headers['set-cookie']).toMatch(/; Secure/i);
      const headers = session(response);
      expect((await temporary.inject({url:'/api/admin/session',headers})).statusCode).toBe(200);
      await new Promise(resolve => setTimeout(resolve,190));
      expect((await temporary.inject({url:'/api/admin/session',headers})).statusCode).toBe(401);
    } finally {await temporary.close();}
  });

  it('rate limits repeated login attempts',async () => {
    for (let count = 0; count < 7; count++) {
      const response = await app.inject({method:'POST',url:'/api/admin/login',headers:{origin},payload:{...credentials,password:'incorrect'}});
      expect(response.statusCode).toBe(count === 6 ? 429 : 401);
    }
  });
});
