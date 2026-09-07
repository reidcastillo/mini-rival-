import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  room: text('room'), seen: integer('seen').notNull(),
});
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(), p1: text('p1').notNull(), p2: text('p2'),
  status: text('status').notNull(), puzzle: integer('puzzle').notNull(),
  created: integer('created').notNull(), start: integer('start'), ended: integer('ended'),
  winner: text('winner'), a1: text('a1').notNull().default('[]'), a2: text('a2').notNull().default('[]'),
  rev1: integer('rev1').notNull().default(0), rev2: integer('rev2').notNull().default(0),
}, t => [index('idx_rooms_queue').on(t.status, t.created), index('idx_rooms_p1').on(t.p1), index('idx_rooms_p2').on(t.p2), index('idx_rooms_winner').on(t.winner)]);
