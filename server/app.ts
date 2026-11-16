import {resolve} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import Fastify, {LogController} from 'fastify';
import type {FastifyReply, FastifyRequest} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import {z} from 'zod';
import {openStore} from './store.js';
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

type Config = {path:string;databaseUrl?:string;proxySecret?:string;secure?:boolean;origins:string[];serveWeb?:boolean;logger?:boolean;ttl?:number};

export async function createApp(config: Config) {
  const app = Fastify({
    logger:config.logger ?? false,bodyLimit:8192,
    logController:new LogController({disableRequestLogging:true}),
  });
  const store = await openStore({...config,onPoolError:code => app.log.warn({code},'Database connection closed')});
  app.addHook('onClose',async () => store.close());
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
  const proxyKey = config.proxySecret ? Buffer.from(config.proxySecret) : undefined;
  function trustedGateway(request:FastifyRequest) {
    const value = request.headers['x-studio-proxy'];
    if (!proxyKey || typeof value !== 'string') return false;
    const candidate = Buffer.from(value);
    return candidate.length === proxyKey.length && timingSafeEqual(candidate,proxyKey);
  }
  await app.register(rateLimit,{
    global:false, keyGenerator:request => {
      const ip = request.headers['x-studio-client-ip'];
      return trustedGateway(request) && typeof ip === 'string' && isIP(ip) ? ip : request.ip;
    },
  });
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
    const session = await store.session(hashToken(value));
    if (!session || Number(session.expires) <= Date.now()) return undefined;
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
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control','no-store');
    if (proxyKey && !trustedGateway(request)) return reply.code(403).send({error:'Use the studio website to access this API.'});
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) await requireOrigin(request,reply);
  });
  app.setErrorHandler((error:Error & {statusCode?:number},request,reply) => {
    const code = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (code === 500) request.log.error({code,name:error.name},'Request failed');
    void reply.code(code).send({error:code === 429 ? 'Too many requests. Wait a minute and try again.' : code === 500
      ? 'The service could not complete the request.' : 'The request could not be accepted.'});
  });
  app.get('/healthz',async (_request,reply) => reply.header('Cache-Control','no-store').send({status:'ok'}));
  app.get('/api/health',async () => {
    await store.settings();
    return {status:'ok',database:'ready'};
  });
  app.get('/api/config',async () => {
    const {feedbackEnabled,analyticsEnabled,announcement} = await store.settings();
    return {feedbackEnabled,analyticsEnabled,announcement};
  });
  app.post('/api/feedback',max(8),async (request,reply) => {
    const parsed = feedbackInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    if (!(await store.settings()).feedbackEnabled) return reply.code(503).send({error:'Feedback is currently disabled.'});
    await store.addFeedback(parsed.data.category,parsed.data.message,Date.now());
    return reply.code(201).send({ok:true});
  });
  app.post('/api/events',max(30),async (request,reply) => {
    const parsed = eventInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    if (!(await store.settings()).analyticsEnabled) return reply.code(403).send({error:'Usage statistics are disabled.'});
    await store.addEvent(parsed.data,Date.now());
    return reply.code(201).send({ok:true});
  });

  app.post('/api/admin/login',max(6),async (request,reply) => {
    const parsed = loginInput.safeParse(request.body);
    if (!parsed.success) return bad(reply);
    const admin = await store.adminByName(parsed.data.username);
    if (!await checkPassword(parsed.data.password,admin?.password) || !admin) {
      return reply.code(401).send({error:'The username or password is incorrect.'});
    }
    const old = await getSession(request);
    const value = token();
    const csrf = token();
    const ttl = config.ttl ?? 8 * 60 * 60_000;
    const now = Date.now();
    await store.rotateSession(now,old?.hash,{hash:hashToken(value),adminId:admin.id,csrf,expires:now + ttl});
    reply.setCookie(sessionCookie,value,{...cookieOptions,maxAge:Math.ceil(ttl/1000)});
    return {username:admin.username,csrf};
  });

  app.register(async admin => {
    admin.addHook('preHandler',requireSession);
    admin.post('/api/admin/logout',async (request,reply) => {
      await store.revokeSession(hashToken(request.cookies[sessionCookie]!));
      reply.clearCookie(sessionCookie,cookieOptions);
      return {ok:true};
    });
    admin.get('/api/admin/session',async (request,reply) => {
      const session = await getSession(request);
      if (!session) return reply.code(401).send({error:'Sign in to access this page.'});
      const user = await store.adminName(session.adminId);
      return {...user, csrf:session.csrf};
    });
    admin.get('/api/admin/overview',async () => ({
      ...await store.totals(),
      health:'Database ready', formats:['PDF','MP4'],
    }));
    admin.get('/api/admin/feedback',async (request,reply) => {
      const query = z.object({before:z.coerce.number().int().positive().optional()}).safeParse(request.query);
      if (!query.success) return bad(reply);
      return store.feedback(query.data.before);
    });
    admin.patch('/api/admin/feedback/:id',async (request,reply) => {
      const params = z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);
      const body = z.strictObject({state:z.enum(['new','reviewed','resolved'])}).safeParse(request.body);
      if (!params.success || !body.success) return bad(reply);
      const update = await store.updateFeedback(params.data.id,body.data.state);
      return update ?? reply.code(404).send({error:'Feedback item not found.'});
    });
    admin.get('/api/admin/analytics',async () => store.analytics());
    admin.get('/api/admin/settings',async () => store.settings());
    admin.patch('/api/admin/settings',async (request,reply) => {
      const parsed = settingsInput.safeParse(request.body);
      if (!parsed.success) return bad(reply);
      return store.updateSettings(parsed.data);
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
