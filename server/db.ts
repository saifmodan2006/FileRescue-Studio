import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {SQLInputValue} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/sqlite-proxy';
import type {AsyncBatchRemoteCallback} from 'drizzle-orm/sqlite-proxy';
import {SQLiteSyncDialect} from 'drizzle-orm/sqlite-core';
import type {SQL} from 'drizzle-orm';
import * as schema from './schema.js';

const migrations = [
  `CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
   CREATE TABLE admin_sessions (hash TEXT PRIMARY KEY NOT NULL, admin_id INTEGER NOT NULL REFERENCES admin_users ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
   CREATE INDEX sessions_expires ON admin_sessions (expires);
   CREATE TABLE feedback (id INTEGER PRIMARY KEY, category TEXT NOT NULL, message TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'new', created INTEGER NOT NULL);
   CREATE TABLE consented_usage_events (id INTEGER PRIMARY KEY, format TEXT NOT NULL, outcome TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE INDEX usage_created ON consented_usage_events (created);
   CREATE TABLE application_settings (id INTEGER PRIMARY KEY CHECK(id=1), feedback_enabled INTEGER NOT NULL DEFAULT 1, analytics_enabled INTEGER NOT NULL DEFAULT 0, announcement TEXT NOT NULL DEFAULT '');
   INSERT INTO application_settings (id) VALUES (1);`,
];

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const sqlite = new DatabaseSync(path);
  try {
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const {user_version:version} = sqlite.prepare('PRAGMA user_version').get() as {user_version:number};
      if (version > migrations.length) throw new Error('The database was created by a newer version of FileRescue Studio.');
      migrations.slice(version).forEach((migration,index) => {
        sqlite.exec(migration);
        sqlite.exec(`PRAGMA user_version = ${version + index + 1}`);
      });
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    function query(sql: string, params: SQLInputValue[], method: 'run'|'all'|'values'|'get') {
      const statement = sqlite.prepare(sql);
      if (method === 'run') {
        statement.run(...params);
        return {rows:[]};
      }
      if (method === 'get') {
        const row = statement.get(...params);
        // Drizzle expects an absent row as undefined for a single-row query.
        return {rows: row ? Object.values(row) : undefined!};
      }
      return {rows:statement.all(...params).map(row => Object.values(row))};
    }
    function atomic<T>(work:() => T) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    const batch: AsyncBatchRemoteCallback = async statements => atomic(() =>
      statements.map(item => query(item.sql,item.params,item.method)));
    const dialect = new SQLiteSyncDialect();
    function prepare(statement:SQL) {
      const {sql,params} = dialect.sqlToQuery(statement);
      return {query:sqlite.prepare(sql),params:params.map(value => typeof value === 'boolean' ? Number(value) : value as SQLInputValue)};
    }
    return {
      db:drizzle(async (sql,params,method) => query(sql,params,method),batch,{schema}),
      rows:async <T extends Record<string,unknown>>(statement:SQL) => {
        const {query,params} = prepare(statement);
        return query.all(...params) as T[];
      },
      batch:async (statements:SQL[]) => atomic(() => {
        for (const statement of statements) {
          const {query,params} = prepare(statement);
          query.run(...params);
        }
      }),
      close:() => sqlite.close(),
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
