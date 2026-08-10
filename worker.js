export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      // =========================
      // TEST
      // =========================

      if (url.pathname === "/api/test") {
        const result = await env.DB
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
          )
          .all();

        return json({
          ok: true,
          database: "connected",
          tables: result.results
        }, headers);
      }

      // =========================
      // USER
      // =========================

      if (url.pathname === "/api/user" && request.method === "POST") {
        const body = await request.json();

        const id = Number(body.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
          return json({
            ok: false,
            error: "Некорректный Telegram ID"
          }, headers, 400);
        }

        await env.DB.prepare(`
          INSERT INTO users
            (id, username, first_name)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name
        `)
        .bind(
          id,
          body.username || null,
          body.first_name || null
        )
        .run();

        const user = await env.DB.prepare(`
          SELECT
            id,
            username,
            first_name,
            balance,
            coins,
            created_at
          FROM users
          WHERE id = ?
        `)
        .bind(id)
        .first();

        return json({
          ok: true,
          user
        }, headers);
      }

      // =========================
      // COINS
      // =========================

      if (url.pathname === "/api/coins" && request.method === "GET") {
        const userId = Number(url.searchParams.get("user_id"));

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
        .bind(userId)
        .first();

        if (!user) {
          return json({
            ok: false,
            error: "Пользователь не найден"
          }, headers, 404);
        }

        return json({
          ok: true,
          coins: Number(user.coins || 0)
        }, headers);
      }

      // =========================
      // GIFTS
      // =========================

      if (url.pathname === "/api/gifts" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            id,
            name,
            emoji,
            price,
            description
          FROM gifts
          ORDER BY price ASC
        `).all();

        return json({
          ok: true,
          gifts: result.results
        }, headers);
      }

      // =========================
      // INVENTORY
      // =========================

      if (url.pathname === "/api/inventory" && request.method === "GET") {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        const result = await env.DB.prepare(`
          SELECT
            inventory.id,
            inventory.created_at,
            gifts.id AS gift_id,
            gifts.name,
            gifts.emoji,
            gifts.price,
            gifts.description
          FROM inventory
          JOIN gifts
            ON gifts.id = inventory.gift_id
          WHERE inventory.user_id = ?
          ORDER BY inventory.created_at DESC
        `)
        .bind(userId)
        .all();

        return json({
          ok: true,
          inventory: result.results
        }, headers);
      }

      // =========================
      // CASES
      // =========================

      if (url.pathname === "/api/cases" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            id,
            name
          FROM cases
          ORDER BY id ASC
        `).all();

        return json({
          ok: true,
          cases: result.results
        }, headers);
      }

      // =========================
      // CASE CONTENT
      // =========================

      if (
        url.pathname === "/api/case" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        const items = await env.DB.prepare(`
          SELECT
            case_items.id,
            case_items.case_id,
            case_items.gift_id,
            case_items.chance,
            gifts.name,
            gifts.emoji,
            gifts.price,
            gifts.description
          FROM case_items
          JOIN gifts
            ON gifts.id = case_items.gift_id
          WHERE case_items.case_id = ?
          ORDER BY gifts.price DESC
        `)
        .bind(caseId)
        .all();

        return json({
          ok: true,
          items: items.results
        }, headers);
      }

      // =========================
      // OPEN COIN CASE
      // =========================

      if (
        url.pathname === "/api/cases/open" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const caseId = Number(body.case_id);

        const user = await env.DB.prepare(`
          SELECT id, coins
          FROM users
          WHERE id = ?
        `)
        .bind(userId)
        .first();

        if (!user) {
          return json({
            ok: false,
            error: "Пользователь не найден"
          }, headers, 404);
        }

        /*
          Цена кейса берётся из таблицы cases.
          Если в твоей таблице cases пока нет price,
          добавь колонку:
          ALTER TABLE cases ADD COLUMN price INTEGER DEFAULT 100;
        */

        const selectedCase = await env.DB.prepare(`
          SELECT id, name, price
          FROM cases
          WHERE id = ?
        `)
        .bind(caseId)
        .first();

        if (!selectedCase) {
          return json({
            ok: false,
            error: "Кейс не найден"
          }, headers, 404);
        }

        const price = Number(selectedCase.price || 100);

        if (Number(user.coins || 0) < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins"
          }, headers, 400);
        }

        const items = await env.DB.prepare(`
          SELECT
            case_items.gift_id,
            case_items.chance,
            gifts.name,
            gifts.emoji,
            gifts.price,
            gifts.description
          FROM case_items
          JOIN gifts
            ON gifts.id = case_items.gift_id
          WHERE case_items.case_id = ?
        `)
        .bind(caseId)
        .all();

        if (!items.results.length) {
          return json({
            ok: false,
            error: "В кейсе нет предметов"
          }, headers, 400);
        }

        const winner = chooseItem(items.results);

        await env.DB.prepare(`
          UPDATE users
          SET coins = coins - ?
          WHERE id = ?
        `)
        .bind(price, userId)
        .run();

        await env.DB.prepare(`
          INSERT INTO inventory
            (user_id, gift_id)
          VALUES (?, ?)
        `)
        .bind(userId, winner.gift_id)
        .run();

        await env.DB.prepare(`
          INSERT INTO case_opens
            (user_id, case_id)
          VALUES (?, ?)
        `)
        .bind(userId, caseId)
        .run();

        const updated = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
        .bind(userId)
        .first();

        return json({
          ok: true,
          reward: winner,
          coins: Number(updated.coins || 0)
        }, headers);
      }

      // =========================
      // TASKS
      // =========================

      if (url.pathname === "/api/tasks" && request.method === "GET") {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        const result = await env.DB.prepare(`
          SELECT
            tasks.id,
            tasks.title,
            tasks.description,
            tasks.type,
            tasks.url,
            tasks.reward,
            tasks.max_completions,
            CASE
              WHEN task_completions.id IS NOT NULL
              THEN 1
              ELSE 0
            END AS completed
          FROM tasks
          LEFT JOIN task_completions
            ON task_completions.task_id = tasks.id
            AND task_completions.user_id = ?
          WHERE tasks.is_active = 1
          ORDER BY tasks.id DESC
        `)
        .bind(userId)
        .all();

        return json({
          ok: true,
          tasks: result.results
        }, headers);
      }

      // =========================
      // COMPLETE TASK
      // =========================

      if (
        url.pathname === "/api/tasks/complete" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const taskId = Number(body.task_id);

        const task = await env.DB.prepare(`
          SELECT
            id,
            title,
            reward,
            is_active
          FROM tasks
          WHERE id = ?
        `)
        .bind(taskId)
        .first();

        if (!task || !task.is_active) {
          return json({
            ok: false,
            error: "Задание недоступно"
          }, headers, 400);
        }

        const completed = await env.DB.prepare(`
          SELECT id
          FROM task_completions
          WHERE task_id = ?
            AND user_id = ?
        `)
        .bind(taskId, userId)
        .first();

        if (completed) {
          return json({
            ok: false,
            error: "Задание уже выполнено"
          }, headers, 409);
        }

        const reward = Math.max(
          0,
          Number(task.reward || 0)
        );

        await env.DB.prepare(`
          INSERT INTO task_completions
            (task_id, user_id, reward)
          VALUES (?, ?, ?)
        `)
        .bind(userId, taskId, reward)
        .run();

        await env.DB.prepare(`
          UPDATE users
          SET coins = COALESCE(coins, 0) + ?
          WHERE id = ?
        `)
        .bind(reward, userId)
        .run();

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
        .bind(userId)
        .first();

        return json({
          ok: true,
          reward,
          coins: Number(user.coins || 0)
        }, headers);
      }

      // =========================
      // REFERRALS
      // =========================

      if (
        url.pathname === "/api/referrals" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );
