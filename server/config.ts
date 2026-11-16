import {z} from 'zod';

export function getServerConfig(env: NodeJS.ProcessEnv) {
  const hosted = env.STUDIO_HOSTED === 'true' || env.RENDER === 'true';
  const port = z.coerce.number().int().min(1).max(65535).parse(env.PORT ?? 4310);
  const secure = hosted || env.SECURE_COOKIES === 'true';
  const path = env.DATABASE_PATH ?? './data/studio.sqlite';
  const databaseUrl = env.DATABASE_URL || undefined;
  const proxySecret = hosted ? env.STUDIO_PROXY_SECRET : undefined;
  const publicOrigin = env.PUBLIC_ORIGIN;
  if (hosted) {
    if (!databaseUrl || !proxySecret || !/^[a-f0-9]{64}$/.test(proxySecret) || !publicOrigin) {
      throw new Error('Hosted mode requires DATABASE_URL, PUBLIC_ORIGIN and a 64-character hex STUDIO_PROXY_SECRET.');
    }
    const origin = new URL(publicOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin.');
  }
  return {hosted, port, host:hosted ? '0.0.0.0' : env.HOST ?? '127.0.0.1', path, databaseUrl, proxySecret, publicOrigin, secure};
}
