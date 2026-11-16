import {resolve} from 'node:path';
import Fastify, {LogController} from 'fastify';
import type {FastifyReply, FastifyRequest} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import {count, desc, eq, lte} from 'drizzle-orm';
import {z} from 'zod';
import {openDatabase} from './db.js';
import {admins, events, feedback, sessions, settings} from './schema.js';
import {checkPassword, hashToken, token} from './auth.js';

const sessionCookie = 'studio_session';
const loginInput = z.strictObject({username:z.string().trim().min(1).max(64),password:z.string().min(1).max(256)});
const feedbackInput = z.strictObject({category:z.enum(['bug','idea','other']),message:z.string().trim().min(10).max(2000)});
const eventInput = z.strictObject({
  consent:z.literal(true),format:z.enum(['PDF','MP4','Unknown']),
  outcome:z.enum(['verified','partial','failed','unsupported','cancelled']),
});
const settingsInput = z.strictObject({
  feedbackEnabled:z.boolean().optional(), analyticsEnabled:z.boolean().optional(), announcement:z.string().trim().max(300).optional(),
}).refine(input => Object.keys(input).length > 0);

type Config = {path:string; secure?:boolean; origins:string[]; serveWeb?:boolean; logger?:boolean; ttl?:number};

export async function createApp(config: Config) {
  const {db,close} = openDatabase(config.path);
  const app = Fastify({
    logger:config.logger ?? false,bodyLimit:8192,
    logController:new LogController({disableRequestLogging:true}),
  });
  app.addHook('onClose',async () => close());
  await app.register(helmet,{
    crossOriginEmbedderPolicy:false,
    contentSecurityPolicy:{useDefaults:false,directives:{
      defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"], fontSrc:["'self'"],
      imgSrc:["'self'",'blob:','data:'], mediaSrc:["'self'",'blob:'], workerSrc:["'self'",'blob:'],
      connectSrc:["'self'"], objectSrc:["'none'"], baseUri:["'none'"], frameAncestors:["'none'"], formAction:["'self'"],
    }},
    strictTransportSecurity:config.secure ? undefined : false,
  });
  await app.register(cookie);
  await app.register(rateLimit,{global:false});
  const readSettings = async () => (await db.select().from(settings).where(eq(settings.id,1)).get())!;
  const max = (n:number) => ({config:{rateLimit:{max:n,timeWindow:'1 minute'}}});
  const bad = (reply:FastifyReply) => reply.code(400).send({error:'Please check the supplied fields and try again.'});
  const cookieOptions = {httpOnly:true, secure:config.secure ?? false, path:'/api', sameSite:'strict' as const};
  const requireOrigin = async (request:FastifyRequest, reply:FastifyReply) => {
    if (!request.headers.origin || !config.origins.includes(request.headers.origin)) {
      return reply.code(403).send({error:'Request origin is not allowed.'});
    }
  };
  const getSession = async (request:FastifyRequest) => {
    const value = request.cookies[sessionCookie];
    if (!value || !/^[\w-]{43}$/.test(value)) return undefined;
    const session = await db.select().from(sessions).where(eq(sessions.hash,hashToken(value))).get();
    if (!session || session.expires <= Date.now()) return undefined;
    return session;
  };
  const requireSession = async (request:FastifyRequest,reply:FastifyReply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({error:'Sign in to access this page.'});
    if (request.method !== 'GET' && request.headers['x-csrf-token'] !== session.csrf) {
      return reply.code(403).send({error:'The security token expired. Refresh the admin page.'});
    }
  };

  app.addHook('onRequest',async (request,reply) => {
    if (request.url.startsWith('/api/')) reply.header('Cache-Control','no-store');
    if (request.url.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(request.method)) await requireOrigin(request,reply);
  });
  app.setErrorHandler((error:Error & {statusCode?:number},request,reply) => {
    const code = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (code === 500) request.log.error({code,name:error.name},'Request failed');
    void reply.code(code).send({error:code === 429 ? 'Too many requests. Wait a minute and try again.' : code === 500
      ? 'The service could not complete the request.' : 'The request could not be accepted.'});
  });
  app.get('/api/health',async () => {
    await readSettings();
    return {status:'ok',database:'ready'};
  });
  app.get('/api/config',async () => {
    const {feedbackEnabled,analyticsEnabled,announcement} = await readSettings();
    return {feedbackEnabled,analyticsEnabled,announcement};
  });
  app.post('/api/feedback',max(8),async (request,reply) => {
    const parsed = feedbackInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    if (!(await readSettings()).feedbackEnabled) return reply.code(503).send({error:'Feedback is currently disabled.'});
    await db.insert(feedback).values({...parsed.data,created:Date.now()}).run();
    return reply.code(201).send({ok:true});
  });
  app.post('/api/events',max(30),async (request,reply) => {
    const parsed = eventInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    if (!(await readSettings()).analyticsEnabled) return reply.code(403).send({error:'Usage statistics are disabled.'});
    const {format,outcome} = parsed.data;
    await db.insert(events).values({format,outcome,created:Date.now()}).run();
    return reply.code(201).send({ok:true});
  });

  app.post('/api/admin/login',max(6),async (request,reply) => {
    const parsed = loginInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    const admin = await db.select().from(admins).where(eq(admins.username,parsed.data.username)).get();
    if (!await checkPassword(parsed.data.password,admin?.password) || !admin) {
      return reply.code(401).send({error:'The username or password is incorrect.'});
    }
    const old = await getSession(request);
    const value = token();
    const csrf = token();
    const ttl = config.ttl ?? 8 * 60 * 60_000;
    const now = Date.now();
    await db.batch([
      db.delete(sessions).where(lte(sessions.expires,now)),
      ...(old ? [db.delete(sessions).where(eq(sessions.hash,old.hash))] : []),
      db.insert(sessions).values({hash:hashToken(value),adminId:admin.id,csrf,expires:now + ttl}),
    ]);
    reply.setCookie(sessionCookie,value,{...cookieOptions,maxAge:Math.ceil(ttl/1000)});
    return {username:admin.username,csrf};
  });

  app.register(async admin => {
    admin.addHook('preHandler',requireSession);
    admin.post('/api/admin/logout',async (request,reply) => {
      await db.delete(sessions).where(eq(sessions.hash,hashToken(request.cookies[sessionCookie]!))).run();
      reply.clearCookie(sessionCookie,cookieOptions);
      return {ok:true};
    });
    admin.get('/api/admin/session',async (request,reply) => {
      const session = await getSession(request);
      if (!session) return reply.code(401).send({error:'Sign in to access this page.'});
      const user = await db.select({username:admins.username}).from(admins).where(eq(admins.id,session.adminId)).get();
      return {...user, csrf:session.csrf};
    });
    admin.get('/api/admin/overview',async () => ({
      feedback:(await db.select({value:count()}).from(feedback).get())!.value,
      events:(await db.select({value:count()}).from(events).get())!.value,
      health:'Database ready', formats:['PDF','MP4'],
    }));
    admin.get('/api/admin/feedback',async (request,reply) => {
      const query = z.object({before:z.coerce.number().int().positive().optional()}).safeParse(request.query);
      if (!query.success) return bad(reply);
      const before = query.data.before;
      const base = db.select().from(feedback);
      return (before ? base.where(lte(feedback.id,before - 1)) : base).orderBy(desc(feedback.id)).limit(50).all();
    });
    admin.patch('/api/admin/feedback/:id',async (request,reply) => {
      const params = z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);
      const body = z.strictObject({state:z.enum(['new','reviewed','resolved'])}).safeParse(request.body);
      if (!params.success || !body.success) return bad(reply);
      const update = await db.update(feedback).set(body.data).where(eq(feedback.id,params.data.id)).returning().get();
      return update ?? reply.code(404).send({error:'Feedback item not found.'});
    });
    admin.get('/api/admin/analytics',async () => db.select({format:events.format,outcome:events.outcome,count:count()})
      .from(events).groupBy(events.format,events.outcome).all());
    admin.get('/api/admin/settings',async () => readSettings());
    admin.patch('/api/admin/settings',async (request,reply) => {
      const parsed = settingsInput.safeParse(request.body);
      if (!parsed.success) return bad(reply);
      return db.update(settings).set(parsed.data).where(eq(settings.id,1)).returning().get();
    });
  });

  if (config.serveWeb) {
    await app.register(staticFiles,{root:resolve('dist'),wildcard:false,index:false});
    app.setNotFoundHandler((request,reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.split('?')[0].includes('.')) {
        return reply.header('Cache-Control','no-cache').sendFile('index.html');
      }
      return reply.code(404).send({error:'Page or resource not found.'});
    });
  }
  return app;
}
