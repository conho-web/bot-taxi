import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * @param {string} databasePath
 */
export function openDb(databasePath) {
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS drivers (
      user_id INTEGER PRIMARY KEY NOT NULL,
      callsign TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      passenger_peer_id INTEGER NOT NULL,
      passenger_user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      driver_user_id INTEGER,
      drivers_chat_message_id INTEGER,
      passenger_offer_message_id INTEGER,
      order_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_passenger ON orders (passenger_user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

    CREATE TABLE IF NOT EXISTS driver_sessions (
      user_id INTEGER PRIMARY KEY NOT NULL,
      mode TEXT NOT NULL DEFAULT 'idle',
      context_order_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS order_drafts (
      user_id INTEGER PRIMARY KEY NOT NULL,
      step TEXT NOT NULL,
      from_address TEXT,
      from_building TEXT,
      to_address TEXT,
      to_building TEXT,
      comment TEXT,
      peer_id INTEGER
    );
  `);
  try {
    db.exec('ALTER TABLE orders ADD COLUMN passenger_offer_message_id INTEGER');
  } catch {
    // колонка уже есть
  }
  return db;
}
