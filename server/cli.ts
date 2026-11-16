import {existsSync} from 'node:fs';
import {Writable} from 'node:stream';
import {createInterface} from 'node:readline/promises';
import {z} from 'zod';
import {openDatabase} from './db.js';
import {admins} from './schema.js';
import {hashPassword} from './auth.js';

if (existsSync('.env')) process.loadEnvFile();
const command = process.argv[2];
if (command !== 'migrate' && command !== 'admin') throw new Error('Choose migrate or admin.');
if (command === 'admin' && process.env.NODE_ENV === 'production') throw new Error('This account setup command is for local development.');
const {db,close} = openDatabase(process.env.DATABASE_PATH ?? './data/studio.sqlite');
try {
  if (command === 'migrate') console.log('Database migrations are current.');
  else {
    let muted = false;
    const output = new Writable({write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    }});
    const prompt = createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});
    try {
      const username = z.string().trim().min(3).max(64).parse(await prompt.question('Admin username: '));
      process.stdout.write('Admin passphrase (12+ characters, hidden): ');
      muted = true;
      const password = z.string().min(12).max(256).parse(await prompt.question(''));
      await db.insert(admins).values({username,password:await hashPassword(password)}).run();
      console.log('\nLocal administrator created.');
    } finally {prompt.close();}
  }
} catch (error) {
  console.error('\nSetup failed:', error instanceof z.ZodError ? 'Check the username and password lengths.' : 'Check database access and choose an unused username.');
  process.exitCode = 1;
} finally {close();}
