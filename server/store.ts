import {sql} from 'drizzle-orm';
import type {SQL} from 'drizzle-orm';
import {openDatabase} from './db.js';
import {openPostgres} from './postgres.js';

type SettingsRow = {id:number; feedbackEnabled:boolean | number; analyticsEnabled:boolean | number; announcement:string};
type SettingsPatch = {feedbackEnabled?:boolean; analyticsEnabled?:boolean; announcement?:string};
type Feedback = {id:number; category:string; message:string; state:string; created:number | string};
type Session = {hash:string;adminId:number;csrf:string;expires:number | string};
type Event = {format:string;outcome:string};
type Target = {path:string;databaseUrl?:string;onPoolError?:(code:string) => void};

const settingsColumns = sql`id, feedback_enabled AS "feedbackEnabled", analytics_enabled AS "analyticsEnabled", announcement`;
function normalizeSettings(row: SettingsRow) {
  return {...row,feedbackEnabled:Boolean(row.feedbackEnabled),analyticsEnabled:Boolean(row.analyticsEnabled)};
}
const normalizeFeedback = (row: Feedback) => ({...row,created:Number(row.created)});

export async function openStore(target: Target) {
  const connection = target.databaseUrl ? await openPostgres(target.databaseUrl,target.onPoolError) : openDatabase(target.path);
  const {rows,batch,close} = connection;
  const first = async <T extends Record<string,unknown>>(query:SQL) => (await rows<T>(query))[0];
  const write = async (query:SQL) => {await rows(query);};
  return {
    close,
    async settings() {
      const row = await first<SettingsRow>(sql`SELECT ${settingsColumns} FROM application_settings WHERE id = 1`);
      if (!row) throw new Error('Application settings are missing.');
      return normalizeSettings(row);
    },
    async updateSettings(values:SettingsPatch) {
      const fields = [];
      if (values.feedbackEnabled !== undefined) fields.push(sql`feedback_enabled = ${values.feedbackEnabled}`);
      if (values.analyticsEnabled !== undefined) fields.push(sql`analytics_enabled = ${values.analyticsEnabled}`);
      if (values.announcement !== undefined) fields.push(sql`announcement = ${values.announcement}`);
      const row = await first<SettingsRow>(sql`UPDATE application_settings SET ${sql.join(fields,sql`, `)}
        WHERE id = 1 RETURNING ${settingsColumns}`);
      if (!row) throw new Error('Application settings are missing.');
      return normalizeSettings(row);
    },
    adminByName:(username:string) => first<{id:number;username:string;password:string}>(
      sql`SELECT id, username, password FROM admin_users WHERE username = ${username}`),
    adminName:(id:number) => first<{username:string}>(sql`SELECT username FROM admin_users WHERE id = ${id}`),
    createAdmin:(username:string,password:string) => write(sql`INSERT INTO admin_users (username,password) VALUES (${username},${password})`),
    session:(hash:string) => first<Session>(
      sql`SELECT hash, admin_id AS "adminId", csrf, expires FROM admin_sessions WHERE hash = ${hash}`),
    rotateSession:(now:number,oldHash:string | undefined,session:Session) => batch([
      sql`DELETE FROM admin_sessions WHERE expires <= ${now}`,
      ...(oldHash ? [sql`DELETE FROM admin_sessions WHERE hash = ${oldHash}`] : []),
      sql`INSERT INTO admin_sessions (hash,admin_id,csrf,expires)
        VALUES (${session.hash},${session.adminId},${session.csrf},${session.expires})`,
    ]),
    revokeSession:(hash:string) => write(sql`DELETE FROM admin_sessions WHERE hash = ${hash}`),
    addFeedback:(category:string,message:string,created:number) => write(
      sql`INSERT INTO feedback (category,message,created) VALUES (${category},${message},${created})`),
    addEvent:({format,outcome}:Event,created:number) => write(
      sql`INSERT INTO consented_usage_events (format,outcome,created) VALUES (${format},${outcome},${created})`),
    async totals() {
      const record = await first<{feedback:number | string; events:number | string}>(sql`SELECT
        (SELECT COUNT(*) FROM feedback) AS feedback, (SELECT COUNT(*) FROM consented_usage_events) AS events`);
      return {feedback:Number(record.feedback),events:Number(record.events)};
    },
    async feedback(before?:number) {
      const limit = before ? sql`WHERE id < ${before}` : sql.empty();
      return (await rows<Feedback>(sql`SELECT id, category, message, state, created FROM feedback ${limit} ORDER BY id DESC LIMIT 50`)).map(normalizeFeedback);
    },
    async updateFeedback(id:number,state:string) {
      const row = await first<Feedback>(sql`UPDATE feedback SET state = ${state} WHERE id = ${id}
        RETURNING id, category, message, state, created`);
      return row && normalizeFeedback(row);
    },
    async analytics() {
      const results = await rows<Event & {count:number | string}>(sql`SELECT format, outcome, COUNT(*) AS count
        FROM consented_usage_events GROUP BY format, outcome ORDER BY format, outcome`);
      return results.map(row => ({...row,count:Number(row.count)}));
    },
  };
}
