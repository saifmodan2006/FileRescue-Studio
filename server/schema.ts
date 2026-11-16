import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const admins = sqliteTable('admin_users', {
  id:integer().primaryKey(), username:text().notNull().unique(), password:text().notNull(),
});
export const sessions = sqliteTable('admin_sessions', {
  hash:text().primaryKey(), adminId:integer('admin_id').notNull().references(() => admins.id, {onDelete:'cascade'}),
  csrf:text().notNull(), expires:integer().notNull(),
});
export const feedback = sqliteTable('feedback', {
  id:integer().primaryKey(), category:text().notNull(), message:text().notNull(),
  state:text().notNull().default('new'), created:integer().notNull(),
});
export const events = sqliteTable('consented_usage_events', {
  id:integer().primaryKey(), format:text().notNull(), outcome:text().notNull(), created:integer().notNull(),
});
export const settings = sqliteTable('application_settings', {
  id:integer().primaryKey(), feedbackEnabled:integer('feedback_enabled',{mode:'boolean'}).notNull().default(true),
  analyticsEnabled:integer('analytics_enabled',{mode:'boolean'}).notNull().default(false),
  announcement:text().notNull().default(''),
});
