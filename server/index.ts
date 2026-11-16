import {existsSync} from 'node:fs';
import {z} from 'zod';
import {createApp} from './app.js';

if (existsSync('.env')) process.loadEnvFile();
const host = process.env.HOST ?? '127.0.0.1';
const portValue = z.coerce.number().int().positive().max(65535).safeParse(process.env.PORT ?? 4310);
if (!portValue.success) {
  console.error('Set PORT to a whole number from 1 to 65535.');
  process.exit(1);
}
const port = portValue.data;
const secure = process.env.SECURE_COOKIES === 'true';
const serveWeb = import.meta.url.includes('/dist-server/');
try {
  const app = await createApp({
    path:process.env.DATABASE_PATH ?? './data/studio.sqlite',secure,serveWeb,logger:true,
    origins:process.env.PUBLIC_ORIGIN ? [process.env.PUBLIC_ORIGIN] : [
      `http://127.0.0.1:${port}`,`http://localhost:${port}`,
      ...(!serveWeb ? ['http://127.0.0.1:5173','http://localhost:5173'] : []),
    ],
  });
  await app.listen({host,port});
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => {void app.close();});
} catch (error) {
  console.error('Could not start FileRescue Studio:',error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
