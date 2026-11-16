import {existsSync} from 'node:fs';
import {createApp} from './app.js';
import {getServerConfig} from './config.js';

if (existsSync('.env')) process.loadEnvFile();
try {
  const config = getServerConfig(process.env);
  const {port,host,publicOrigin,hosted} = config;
  const serveWeb = !hosted && import.meta.url.includes('/dist-server/');
  const app = await createApp({
    ...config,serveWeb,logger:true,
    origins:publicOrigin ? [publicOrigin] : [
      `http://127.0.0.1:${port}`,`http://localhost:${port}`,
      ...(!serveWeb ? ['http://127.0.0.1:5173','http://localhost:5173'] : []),
    ],
  });
  try {await app.listen({host,port});}
  catch (error) {await app.close(); throw error;}
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => {void app.close();});
} catch (error) {
  const detail = process.env.DATABASE_URL && error instanceof Error
    ? error.message.replaceAll(process.env.DATABASE_URL,'[database connection]')
    : error instanceof Error ? error.message : 'Unknown service error';
  console.error('Could not start FileRescue Studio:',detail);
  process.exitCode = 1;
}
