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

      if (
        url.pathname === "/api/user" &&
        request.method === "POST"
      ) {
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

      if (
        url.pathname === "/api/coins" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

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
          coins: Number(user.coins || 0)
        }, headers);
      }

      // =========================
      // GIFTS
      // =========================

      if (
        url.pathname === "/api/gifts" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              emoji,
              price,
              description
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
      // INVENTORY
      // =========================

      if (
        url.pathname === "/api/inventory" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

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
      // TASKS
      // =========================

      if (
        url.pathname === "/api/tasks" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

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
                WHEN task_completions.id IS NOT NULL
                THEN 1
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

        const task = await env.DB
          .prepare(`
            SELECT
              id,
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

        const completed = await env.DB
          .prepare(`
            SELECT id
            FROM task_completions
            WHERE task_id = ?
            AND user_id = ?
            LIMIT 1
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
          Number(task.reward) || 0
        );

        await env.DB
          .prepare(`
            INSERT INTO task_completions
              (task_id, user_id, reward)
            VALUES (?, ?, ?)
          `)
          .bind(taskId, userId, reward)
          .run();

        await env.DB
          .prepare(`
            UPDATE users
            SET coins = COALESCE(coins, 0) + ?
            WHERE id = ?
          `)
          .bind(reward, userId)
          .run();

        const user = await env.DB
          .prepare(`
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
      // CASES
      // =========================

      if (
        url.pathname === "/api/cases" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              emoji,
              description,
              price_coins,
              price_stars,
              premium
            FROM cases
            WHERE is_active = 1
            ORDER BY premium ASC, price_coins ASC
          `)
          .all();

        return json({
          ok: true,
          cases: result.results
        }, headers);
      }

      // =========================
      // CASE REWARDS
      // =========================

      if (
        url.pathname === "/api/cases/rewards" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              case_id,
              name,
              emoji,
              rarity,
              value_coins
            FROM case_rewards
            WHERE case_id = ?
            AND is_active = 1
            ORDER BY value_coins ASC
          `)
          .bind(caseId)
          .all();

        return json({
          ok: true,
          rewards: result.results
        }, headers);
      }

      // =========================
      // OPEN CASE
      // =========================

      if (
        url.pathname === "/api/cases/open" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const caseId = Number(body.case_id);
        const rewardId = Number(body.reward_id);

        if (
          !Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(caseId) ||
          !Number.isSafeInteger(rewardId)
        ) {
          return json({
            ok: false,
            error: "Некорректные данные"
          }, headers, 400);
        }

        const caseData = await env.DB
          .prepare(`
            SELECT *
            FROM cases
            WHERE id = ?
            AND is_active = 1
          `)
          .bind(caseId)
          .first();

        if (!caseData) {
          return json({
            ok: false,
            error: "Кейс не найден"
          }, headers, 404);
        }

        const reward = await env.DB
          .prepare(`
            SELECT *
            FROM case_rewards
            WHERE id = ?
            AND case_id = ?
            AND is_active = 1
          `)
          .bind(rewardId, caseId)
          .first();

        if (!reward) {
          return json({
            ok: false,
            error: "Награда не принадлежит этому кейсу"
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

        // Premium Stars пока только подготовлен.
        // Реальную оплату подключаем через Telegram Bot Payments.
        if (Number(caseData.premium) === 1) {
          return json({
            ok: false,
            error: "Premium Case требует оплату Telegram Stars"
          }, headers, 402);
        }

        const price = Number(
          caseData.price_coins || 0
        );

        const coins = Number(
          user.coins || 0
        );

        if (coins < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins"
          }, headers, 400);
        }

        // Списываем Coins
        await env.DB
          .prepare(`
            UPDATE users
            SET coins = coins - ?
            WHERE id = ?
            AND coins >= ?
          `)
          .bind(price, userId, price)
          .run();

        // Создаём подарок в inventory.
        // Используем существующую таблицу gifts.
        let gift = await env.DB
          .prepare(`
            SELECT id
            FROM gifts
            WHERE name = ?
            LIMIT 1
          `)
          .bind(reward.name)
          .first();

        if (!gift) {
          await env.DB
            .prepare(`
              INSERT INTO gifts
                (name, emoji, price, description)
              VALUES (?, ?, ?, ?)
            `)
            .bind(
              reward.name,
              reward.emoji,
              reward.value_coins,
              "Награда из кейса"
            )
            .run();

          gift = await env.DB
            .prepare(`
              SELECT id
              FROM gifts
              WHERE name = ?
              LIMIT 1
            `)
            .bind(reward.name)
            .first();
        }

        await env.DB
          .prepare(`
            INSERT INTO inventory
              (user_id, gift_id)
            VALUES (?, ?)
          `)
          .bind(userId, gift.id)
          .run();

        await env.DB
          .prepare(`
            INSERT INTO case_opens
              (user_id, case_id, reward_id)
            VALUES (?, ?, ?)
          `)
          .bind(userId, caseId, rewardId)
          .run();

        const updatedUser = await env.DB
          .prepare(`
            SELECT coins
            FROM users
            WHERE id = ?
          `)
          .bind(userId)
          .first();

        return json({
          ok: true,
          reward: {
            id: reward.id,
            name: reward.name,
            emoji: reward.emoji,
            rarity: reward.rarity,
            value_coins: reward.value_coins
          },
          coins: Number(updatedUser.coins || 0)
        }, headers);
      }

      // =========================
      // RATING
      // =========================

      if (
        url.pathname === "/api/rating" &&
        request.method === "GET"
      ) {
        const type =
          url.searchParams.get("type") || "coins";

        let sql = "";

        if (type === "coins") {
          sql = `
            SELECT
              id,
              username,
              first_name,
              coins AS value
            FROM users
            ORDER BY coins DESC
            LIMIT 50
          `;
        }

        else if (type === "gifts") {
          sql = `
            SELECT
              users.id,
              users.username,
              users.first_name,
              COUNT(inventory.id) AS value
            FROM users
            LEFT JOIN inventory
              ON inventory.user_id = users.id
            GROUP BY users.id
            ORDER BY value DESC
            LIMIT 50
          `;
        }

        else if (type === "tasks") {
          sql = `
            SELECT
              users.id,
              users.username,
              users.first_name,
              COUNT(task_completions.id) AS value
            FROM users
            LEFT JOIN task_completions
              ON task_completions.user_id = users.id
            GROUP BY users.id
            ORDER BY value DESC
            LIMIT 50
          `;
        }

        else if (type === "referrals") {
          sql = `
            SELECT
              users.id,
              users.username,
              users.first_name,
              COUNT(referrals.id) AS value
            FROM users
            LEFT JOIN referrals
              ON referrals.referrer_id = users.id
            GROUP BY users.id
            ORDER BY value DESC
            LIMIT 50
          `;
        }

        else {
          return json({
            ok: false,
            error: "Неизвестный рейтинг"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(sql)
          .all();

        return json({
          ok: true,
          type,
          rating: result.results
        }, headers);
      }

      // =========================
      // REFERRAL
      // =========================

      if (
        url.pathname === "/api/referral" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const referrerId = Number(body.referrer_id);

        if (
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
      // STATIC
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
