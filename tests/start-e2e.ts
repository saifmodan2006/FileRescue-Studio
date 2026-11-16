import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app';
import {openDatabase} from '../server/db';
import {admins} from '../server/schema';
import {hashPassword} from '../server/auth';

const password = process.env.STUDIO_TEST_PASSWORD;
if (!password) throw new Error('Start the fixture server through Playwright.');
const folder = mkdtempSync(join(tmpdir(),'filerescue-browser-'));
const path = join(folder,'browser.sqlite');
try {
  const {db,close} = openDatabase(path);
  try {
    await db.insert(admins).values({username:'browser-reviewer',password:await hashPassword(password)}).run();
  } finally {close();}
  const app = await createApp({path,origins:['http://127.0.0.1:4411'],serveWeb:true});
  await app.listen({host:'127.0.0.1',port:4411});
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => {
    void app.close().finally(() => rmSync(folder,{recursive:true,force:true}));
  });
} catch (error) {
  rmSync(folder,{recursive:true,force:true});
  throw error;
}
