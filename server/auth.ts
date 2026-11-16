import {createHash, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
const cost = {N:32_768,r:8,p:3,maxmem:64*1024*1024};
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derivePassword(password,salt);
  return `scrypt-v1:${salt}:${hash.toString('hex')}`;
}

export async function checkPassword(password: string, stored?: string) {
  const parts = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(stored ?? '');
  const actual = await derivePassword(password,parts?.[1] ?? '0'.repeat(32));
  return timingSafeEqual(actual,Buffer.from(parts?.[2] ?? '0'.repeat(128),'hex')) && Boolean(parts);
}

function derivePassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve,reject) => {
    scrypt(password,salt,64,cost,(error,key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
