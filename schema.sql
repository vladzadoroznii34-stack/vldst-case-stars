PRAGMA foreign_keys = ON;

-- =========================
-- USERS
-- =========================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =========================
-- GIFTS
-- =========================

CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🎁',
    price INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =========================
-- CASES
-- =========================

CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '🎁',
    price_coins INTEGER NOT NULL DEFAULT 0,
    stars_price INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'coins',
    gift_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (gift_id) REFERENCES gifts(id)
);

-- =========================
-- CASE ITEMS
-- =========================

CREATE TABLE IF NOT EXISTS case_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    chance REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE
);

-- =========================
-- INVENTORY
-- =========================

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (gift_id) REFERENCES gifts(id)
);

-- =========================
-- CASE OPENS
-- =========================

CREATE TABLE IF NOT EXISTS case_opens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    case_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    price_coins INTEGER NOT NULL DEFAULT 0,
    stars_price INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES cases(id),
    FOREIGN KEY (gift_id) REFERENCES gifts(id)
);

-- =========================
-- TASKS
-- =========================

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'link',
    url TEXT,
    reward INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    max_completions INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =========================
-- TASK COMPLETIONS
-- =========================

CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reward INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE(task_id, user_id)
);

-- =========================
-- REFERRALS
-- =========================

CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    referrer_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (referrer_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================
-- REFERRAL REWARDS
-- =========================

CREATE TABLE IF NOT EXISTS referral_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    referrer_id INTEGER NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =========================
-- TRANSACTIONS
-- =========================

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================
-- MINI GAME COOLDOWNS
-- =========================

CREATE TABLE IF NOT EXISTS game_cooldowns (
    user_id INTEGER PRIMARY KEY,
    last_played_at INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================
-- ADS
-- =========================

CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    url TEXT,
    reward INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =========================
-- ADMIN BANS
-- =========================

CREATE TABLE IF NOT EXISTS admin_bans (
    user_id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================
-- TELEGRAM PAYMENTS
-- =========================

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    telegram_charge_id TEXT,
    provider_charge_id TEXT,

    amount INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'XTR',

    status TEXT NOT NULL DEFAULT 'pending',

    payload TEXT,

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    paid_at INTEGER,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================
-- INDEXES
-- =========================

CREATE INDEX IF NOT EXISTS idx_inventory_user
ON inventory(user_id);

CREATE INDEX IF NOT EXISTS idx_case_items_case
ON case_items(case_id);

CREATE INDEX IF NOT EXISTS idx_case_opens_user
ON case_opens(user_id);

CREATE INDEX IF NOT EXISTS idx_task_completions_user
ON task_completions(user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
ON referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user
ON transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_ads_active
ON ads(is_active);

CREATE INDEX IF NOT EXISTS idx_tasks_active
ON tasks(is_active);

CREATE INDEX IF NOT EXISTS idx_payments_user
ON payments(user_id);

-- =========================
-- DEMO DATA
-- =========================

INSERT OR IGNORE INTO gifts
    (id, name, emoji, price, description)
VALUES
    (1, 'Обычный подарок', '🎁', 50, 'Обычный подарок'),
    (2, 'Редкий подарок', '💎', 150, 'Редкий подарок'),
    (3, 'Эпический подарок', '🔥', 500, 'Эпический подарок'),
    (4, 'Легендарный подарок', '👑', 1500, 'Легендарный подарок');

-- =========================
-- DEMO CASES
-- =========================

INSERT OR IGNORE INTO cases
    (
        id,
        name,
        description,
        emoji,
        price_coins,
        stars_price,
        type,
        is_active
    )
VALUES
    (
        1,
        'Стартовый кейс',
        'Попробуй получить первый подарок',
        '🎁',
        100,
        0,
        'coins',
        1
    ),
    (
        2,
        'Премиум кейс',
        'Больше шанс получить редкий подарок',
        '💎',
        500,
        0,
        'coins',
        1
    );

-- =========================
-- CASE CONTENT
-- =========================

INSERT OR IGNORE INTO case_items
    (case_id, gift_id, chance)
VALUES
    (1, 1, 70),
    (1, 2, 25),
    (1, 3, 4),
    (1, 4, 1),

    (2, 1, 40),
    (2, 2, 40),
    (2, 3, 15),
    (2, 4, 5);
