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
      // TEST DATABASE
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
      // GIFTS
      // =========================

      if (url.pathname === "/api/gifts" && request.method === "GET") {
        const result = await env.DB
          .prepare(`
            SELECT id, name, emoji, price, description
            FROM gifts
            ORDER BY price ASC
          `)
          .all();

        return json({
          ok: true,
          gifts: result.results
        }, headers);
      }

      // =========================
      // USER
      // =========================

      if (url.pathname === "/api/user" && request.method === "POST") {
        const body = await request.json();

        const id = Number(body.id);
        const username = body.username || null;
        const firstName = body.first_name || null;

        if (!Number.isSafeInteger(id) || id <= 0) {
          return json({
            ok: false,
            error: "Некорректный Telegram ID"
          }, headers, 400);
        }

        await env.DB
          .prepare(`
            INSERT INTO users
              (id, username, first_name)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              first_name = excluded.first_name
          `)
          .bind(id, username, firstName)
          .run();

        const user = await env.DB
          .prepare(`
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

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const user = await env.DB
          .prepare(`
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

        return json({
          ok: true,
          coins: user.coins || 0
        }, headers);
      }

      // =========================
      // INVENTORY
      // =========================

      if (url.pathname === "/api/inventory" && request.method === "GET") {
        const userId = Number(url.searchParams.get("user_id"));

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              inventory.id,
              gifts.id AS gift_id,
              gifts.name,
              gifts.emoji,
              gifts.price,
              gifts.description,
              inventory.created_at
            FROM inventory
            JOIN gifts ON gifts.id = inventory.gift_id
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
      // REFERRAL
      // =========================

      if (url.pathname === "/api/referral" && request.method === "POST") {
        const body = await request.json();

        const userId = Number(body.user_id);
        const referrerId = Number(body.referrer_id);

        if (
          !Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(referrerId) ||
          userId <= 0 ||
          referrerId <= 0 ||
          userId === referrerId
        ) {
          return json({
            ok: false,
            error: "Некорректные данные"
          }, headers, 400);
        }

        const existing = await env.DB
          .prepare(`
            SELECT id
            FROM referrals
            WHERE user_id = ?
            LIMIT 1
          `)
          .bind(userId)
          .first();

        if (existing) {
          return json({
            ok: false,
            error: "Реферал уже установлен"
          }, headers, 409);
        }

        await env.DB
          .prepare(`
            INSERT INTO referrals
              (user_id, referrer_id)
            VALUES (?, ?)
          `)
          .bind(userId, referrerId)
          .run();

        return json({
          ok: true
        }, headers);
      }

      // =========================
      // TASKS
      // =========================

      if (url.pathname === "/api/tasks" && request.method === "GET") {
        const userId = Number(url.searchParams.get("user_id"));

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              tasks.id,
              tasks.title,
              tasks.description,
              tasks.type,
              tasks.url,
              tasks.reward,
              tasks.max_completions,
              tasks.created_at,
              CASE
                WHEN task_completions.id IS NOT NULL THEN 1
                ELSE 0
              END AS completed
            FROM tasks
            LEFT JOIN task_completions
              ON task_completions.task_id = tasks.id
              AND task_completions.user_id = ?
            WHERE tasks.is_active = 1
              AND (
                tasks.max_completions IS NULL
                OR (
                  SELECT COUNT(*)
                  FROM task_completions tc
                  WHERE tc.task_id = tasks.id
                ) < tasks.max_completions
              )
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

        if (
          !Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(taskId) ||
          userId <= 0 ||
          taskId <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректные данные"
          }, headers, 400);
        }

        const task = await env.DB
          .prepare(`
            SELECT
              id,
              title,
              reward,
              max_completions,
              is_active
            FROM tasks
            WHERE id = ?
          `)
          .bind(taskId)
          .first();

        if (!task) {
          return json({
            ok: false,
            error: "Задание не найдено"
          }, headers, 404);
        }

        if (!task.is_active) {
          return json({
            ok: false,
            error: "Задание отключено"
          }, headers, 400);
        }

        const alreadyCompleted = await env.DB
          .prepare(`
            SELECT id
            FROM task_completions
            WHERE task_id = ?
              AND user_id = ?
            LIMIT 1
          `)
          .bind(taskId, userId)
          .first();

        if (alreadyCompleted) {
          return json({
            ok: false,
            error: "Это задание уже выполнено"
          }, headers, 409);
        }

        if (task.max_completions !== null) {
          const countResult = await env.DB
            .prepare(`
              SELECT COUNT(*) AS count
              FROM task_completions
              WHERE task_id = ?
            `)
            .bind(taskId)
            .first();

          if (Number(countResult.count) >= Number(task.max_completions)) {
            return json({
              ok: false,
              error: "Лимит выполнения задания достигнут"
            }, headers, 400);
          }
        }

        const user = await env.DB
          .prepare(`
            SELECT id
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

        const reward = Math.max(0, Number(task.reward) || 0);

        // Записываем выполнение
        await env.DB
          .prepare(`
            INSERT INTO task_completions
              (task_id, user_id, reward)
            VALUES (?, ?, ?)
          `)
          .bind(taskId, userId, reward)
          .run();

        // Начисляем Coins
        await env.DB
          .prepare(`
            UPDATE users
            SET coins = COALESCE(coins, 0) + ?
            WHERE id = ?
          `)
          .bind(reward, userId)
          .run();

        const updatedUser = await env.DB
          .prepare(`
            SELECT id, coins
            FROM users
            WHERE id = ?
          `)
          .bind(userId)
          .first();

        return json({
          ok: true,
          message: "Задание выполнено",
          reward,
          coins: updatedUser.coins
        }, headers);
      }

      // =========================
      // STATIC FILES
      // =========================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        error: "Внутренняя ошибка сервера",
        message: error?.message || String(error)
      }, headers, 500);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
    }
