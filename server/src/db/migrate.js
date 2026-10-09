// src/db/migrate.js
// Cria todas as tabelas do banco
const { getDb, saveDb } = require('./database');

async function migrate() {
  const db = await getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nome TEXT NOT NULL,
      idade INTEGER,
      genero TEXT,
      interessado_em TEXT,
      cidade TEXT,
      bio TEXT,
      avatar_emoji TEXT DEFAULT '😊',
      avatar_url TEXT,
            online_status INTEGER DEFAULT 0,
            verificado INTEGER DEFAULT 0,
            is_premium INTEGER DEFAULT 0,
      premium_expires_at TEXT,
      discovery_enabled INTEGER DEFAULT 1,
      invisible_mode INTEGER DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_interests (
      user_id TEXT NOT NULL,
      interest TEXT NOT NULL,
      PRIMARY KEY (user_id, interest),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      ordem INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_filters (
      user_id TEXT PRIMARY KEY,
      min_age INTEGER DEFAULT 18,
      max_age INTEGER DEFAULT 55,
      max_distance INTEGER DEFAULT 50,
      gender_filter TEXT DEFAULT 'todos',
      verified_only INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_location (
      user_id TEXT PRIMARY KEY,
      lat REAL,
      lng REAL,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS swipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swiper_id TEXT NOT NULL,
      swiped_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('like', 'nope', 'super')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (swiper_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (swiped_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(swiper_id, swiped_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      active INTEGER DEFAULT 1,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user1_id, user2_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text' CHECK(type IN ('text', 'sticker')),
      enviado_em TEXT NOT NULL DEFAULT (datetime('now')),
      lida INTEGER DEFAULT 0,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id TEXT NOT NULL,
      reported_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved')),
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('match', 'like', 'message', 'super')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      from_user_id TEXT,
      read INTEGER DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS premium_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      price_brl REAL NOT NULL,
      features TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_premium_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      plan_id INTEGER NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES premium_plans(id)
    )
  `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pickup_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cat TEXT NOT NULL,
        text TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS stickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emoji TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS favorite_lines (
        user_id TEXT NOT NULL,
        line_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, line_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (line_id) REFERENCES pickup_lines(id) ON DELETE CASCADE
      )
    `);

    saveDb();
  console.log('✅ Database migrated successfully');
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = migrate;