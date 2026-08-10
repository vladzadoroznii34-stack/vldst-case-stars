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
      // DATABASE TEST
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

        if (!Number.isSafeInteger(id) || id <= 0) {
          return json({
            ok: false,
            error: "Некорректный Telegram ID"
          }, headers, 400);
        }

        const username = body.username || null;
        const firstName = body.first_name || null;

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
              inventory.source,
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

        const task = await env.DB
          .prepare(`
            SELECT
              id,
              reward,
              is_active,
              max_completions
            FROM tasks
            WHERE id = ?
          `)
          .bind(taskId)
          .first();

        if (!task || !task.is_active) {
          return json({
            ok: false,
            error: "Задание недоступно"
          }, headers, 404);
        }

        const completed = await env.DB
          .prepare(`
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

        await env.DB
          .prepare(`
            INSERT INTO transactions
              (user_id, type, amount, description)
            VALUES (?, 'task_reward', ?, 'Награда за задание')
          `)
          .bind(userId, reward)
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
              cost_coins,
              premium
            FROM cases
            WHERE active = 1
            ORDER BY id ASC
          `)
          .all();

        return json({
          ok: true,
          cases: result.results
        }, headers);
      }


      // =========================
      // CASE CONTENT
      // =========================

      if (
        url.pathname === "/api/case-items" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        const result = await env.DB
          .prepare(`
            SELECT
              gifts.id,
              gifts.name,
              gifts.emoji,
              gifts.price,
              gifts.description,
              case_items.chance
            FROM case_items
            JOIN gifts
              ON gifts.id = case_items.gift_id
            WHERE case_items.case_id = ?
            ORDER BY case_items.chance DESC
          `)
          .bind(caseId)
          .all();

        return json({
          ok: true,
          items: result.results
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

        const caseData = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              cost_coins,
              premium,
              active
            FROM cases
            WHERE id = ?
          `)
          .bind(caseId)
          .first();

        if (!caseData || !caseData.active) {
          return json({
            ok: false,
            error: "Кейс недоступен"
          }, headers, 404);
        }

        if (Number(caseData.premium) === 1) {
          return json({
            ok: false,
            error: "Этот набор открывается через Premium-покупку"
          }, headers, 400);
        }

        const user = await env.DB
          .prepare(`
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

        const coins = Number(user.coins || 0);
        const price = Number(caseData.cost_coins || 0);

        if (coins < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins"
          }, headers, 400);
        }

        const items = await env.DB
          .prepare(`
            SELECT
              gift_id,
              chance
            FROM case_items
            WHERE case_id = ?
          `)
          .bind(caseId)
          .all();

        if (!items.results.length) {
          return json({
            ok: false,
            error: "В кейсе нет наград"
          }, headers, 400);
        }

        const total = items.results.reduce(
          (sum, item) =>
            sum + Number(item.chance || 0),
          0
        );

        let random = Math.random() * total;
        let selected = null;

        for (const item of items.results) {
          random -= Number(item.chance || 0);

          if (random <= 0) {
            selected = item;
            break;
          }
        }

        if (!selected) {
          selected = items.results[
            items.results.length - 1
          ];
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET coins = coins - ?
            WHERE id = ?
          `)
          .bind(price, userId)
          .run();

        await env.DB
          .prepare(`
            INSERT INTO inventory
              (user_id, gift_id, source)
            VALUES (?, ?, 'coin_case')
          `)
          .bind(userId, selected.gift_id)
          .run();

        await env.DB
          .prepare(`
            INSERT INTO case_opens
              (user_id, case_id, gift_id)
            VALUES (?, ?, ?)
          `)
          .bind(
            userId,
            caseId,
            selected.gift_id
          )
          .run();

        await env.DB
          .prepare(`
            INSERT INTO transactions
              (user_id, type, amount, description)
            VALUES (?, 'case_open', ?, ?)
          `)
          .bind(
            userId,
            -price,
            `Открытие кейса #${caseId}`
          )
          .run();

        const gift = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              emoji,
              price,
              description
            FROM gifts
            WHERE id = ?
          `)
          .bind(selected.gift_id)
          .first();

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
          gift,
          coins: Number(updatedUser.coins || 0)
        }, headers);
      }


      // =========================
      // REFERRAL INFO
      // =========================

      if (
        url.pathname === "/api/referrals" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        const count = await env.DB
          .prepare(`
            SELECT COUNT(*) AS count
            FROM referrals
            WHERE referrer_id = ?
          `)
          .bind(userId)
          .first();

        const active = await env.DB
          .prepare(`
            SELECT COUNT(*) AS count
            FROM referrals r
            JOIN task_completions tc
              ON tc.user_id = r.user_id
            WHERE r.referrer_id = ?
          `)
          .bind(userId)
          .first();

        return json({
          ok: true,
          referrals: Number(count.count || 0),
          active: Number(active.count || 0),
          link:
            "https://t.me/VldstxCase_bot?start=ref_" +
            userId
        }, headers);
      }


      // =========================
      // REFERRAL RANK
      // =========================

      if (
        url.pathname === "/api/referral-rank" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              users.id,
              users.username,
              users.first_name,
              COUNT(referrals.id) AS referrals
            FROM users
            LEFT JOIN referrals
              ON referrals.referrer_id = users.id
            GROUP BY users.id
            ORDER BY referrals DESC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          ranking: result.results
        }, headers);
      }


      // =========================
      // COINS RANK
      // =========================

      if (
        url.pathname === "/api/coins-rank" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              username,
              first_name,
              coins
            FROM users
            ORDER BY coins DESC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          ranking: result.results
        }, headers);
      }


      // =========================
      // GIFTS RANK
      // =========================

      if (
        url.pathname === "/api/gifts-rank" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              users.id,
              users.username,
              users.first_name,
              COUNT(inventory.id) AS gifts
            FROM users
            LEFT JOIN inventory
              ON inventory.user_id = users.id
            GROUP BY users.id
            ORDER BY gifts DESC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          ranking: result.results
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
      headers: {
        ...headers,
        "Cache-Control": "no-store"
      }
    }
  );
    }
