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
          .prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
          `)
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

        await env.DB
          .prepare(`
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

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
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
              description,
              emoji,
              price_coins,
              stars_price,
              type,
              is_active
            FROM cases
            WHERE is_active = 1
            ORDER BY id ASC
          `)
          .all();

        return json({
          ok: true,
          cases: result.results
        }, headers);
      }

      // =========================
      // CASE ITEMS
      // =========================

      if (
        url.pathname === "/api/cases/items" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        if (!Number.isSafeInteger(caseId) || caseId <= 0) {
          return json({
            ok: false,
            error: "Некорректный case_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              case_items.id,
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
            ORDER BY gifts.price ASC
          `)
          .bind(caseId)
          .all();

        return json({
          ok: true,
          items: result.results
        }, headers);
      }

      // =========================
      // OPEN COINS CASE
      // =========================

      if (
        url.pathname === "/api/cases/open" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const caseId = Number(body.case_id);

        if (
          !Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(caseId) ||
          userId <= 0 ||
          caseId <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректные данные"
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

        const gameCase = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              price_coins,
              stars_price,
              type,
              is_active
            FROM cases
            WHERE id = ?
          `)
          .bind(caseId)
          .first();

        if (!gameCase || Number(gameCase.is_active) !== 1) {
          return json({
            ok: false,
            error: "Кейс недоступен"
          }, headers, 404);
        }

        if (gameCase.type !== "coins") {
          return json({
            ok: false,
            error: "Этот кейс нельзя открыть за Coins"
          }, headers, 400);
        }

        const price = Number(gameCase.price_coins || 0);

        if (price <= 0) {
          return json({
            ok: false,
            error: "У кейса не указана цена"
          }, headers, 400);
        }

        const userCoins = Number(user.coins || 0);

        if (userCoins < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins",
            required: price,
            coins: userCoins
          }, headers, 400);
        }

        const items = await env.DB
          .prepare(`
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
            error: "В кейсе нет подарков"
          }, headers, 400);
        }

        const validItems = items.results.filter(
          item => Number(item.chance) > 0
        );

        if (!validItems.length) {
          return json({
            ok: false,
            error: "В кейсе нет корректных шансов"
          }, headers, 400);
        }

        const totalChance = validItems.reduce(
          (sum, item) =>
            sum + Number(item.chance),
          0
        );

        if (totalChance <= 0) {
          return json({
            ok: false,
            error: "Некорректная сумма шансов"
          }, headers, 400);
        }

        const random =
          Math.random() * totalChance;

        let current = 0;
        let selected = null;

        for (const item of validItems) {
          current += Number(item.chance);

          if (random < current) {
            selected = item;
            break;
          }
        }

        if (!selected) {
          selected =
            validItems[validItems.length - 1];
        }

        // Списание Coins.
        const update = await env.DB
          .prepare(`
            UPDATE users
            SET coins = coins - ?
            WHERE id = ?
              AND coins >= ?
          `)
          .bind(
            price,
            userId,
            price
          )
          .run();

        if (!update.success) {
          return json({
            ok: false,
            error: "Не удалось списать Coins"
          }, headers, 400);
        }

        // Добавляем подарок в инвентарь.
        await env.DB
          .prepare(`
            INSERT INTO inventory
              (user_id, gift_id)
            VALUES (?, ?)
          `)
          .bind(
            userId,
            selected.gift_id
          )
          .run();

        // Записываем открытие.
        await env.DB
          .prepare(`
            INSERT INTO case_opens
              (
                user_id,
                case_id,
                gift_id,
                price_coins,
                stars_price
              )
            VALUES (?, ?, ?, ?, 0)
          `)
          .bind(
            userId,
            caseId,
            selected.gift_id,
            price
          )
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
          case: {
            id: gameCase.id,
            name: gameCase.name
          },
          reward: {
            gift_id: selected.gift_id,
            name: selected.name,
            emoji: selected.emoji,
            price: Number(selected.price || 0),
            chance: Number(selected.chance || 0)
          },
          coins: Number(
            updatedUser?.coins || 0
          )
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
              inventory.gift_id,
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
      // REFERRALS
      // =========================

      if (
        url.pathname === "/api/referral" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(body.user_id);
        const referrerId = Number(body.referrer_id);

        if (
          !Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(referrerId) ||
          userId <= 0 ||
          referrerId <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректные данные"
          }, headers, 400);
        }

        if (userId === referrerId) {
          return json({
            ok: false,
            error: "Нельзя пригласить самого себя"
          }, headers, 400);
        }

        const user = await env.DB
          .prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
          .bind(userId)
          .first();

        const referrer = await env.DB
          .prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
          .bind(referrerId)
          .first();

        if (!user || !referrer) {
          return json({
            ok: false,
            error: "Пользователь не найден"
          }, headers, 404);
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
            error: "Реферальная ссылка уже была использована"
          }, headers, 409);
        }

        await env.DB
          .prepare(`
            INSERT INTO referrals
              (user_id, referrer_id)
            VALUES (?, ?)
          `)
          .bind(
            userId,
            referrerId
          )
          .run();

        return json({
          ok: true,
          message: "Реферал успешно добавлен"
        }, headers);
      }

      // =========================
      // REFERRAL COUNT
      // =========================

      if (
        url.pathname === "/api/referrals" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT COUNT(*) AS count
            FROM referrals
            WHERE referrer_id = ?
          `)
          .bind(userId)
          .first();

        return json({
          ok: true,
          referrals: Number(result?.count || 0)
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

        if (Number(task.is_active) !== 1) {
          return json({
            ok: false,
            error: "Задание отключено"
          }, headers, 400);
        }

        const alreadyCompleted =
          await env.DB
            .prepare(`
              SELECT id
              FROM task_completions
              WHERE task_id = ?
                AND user_id = ?
              LIMIT 1
            `)
            .bind(
              taskId,
              userId
            )
            .first();

        if (alreadyCompleted) {
          return json({
            ok: false,
            error: "Это задание уже выполнено"
          }, headers, 409);
        }

        const reward =
          Math.max(0, Number(task.reward) || 0);

        await env.DB
          .prepare(`
            INSERT INTO task_completions
              (task_id, user_id, reward)
            VALUES (?, ?, ?)
          `)
          .bind(
            taskId,
            userId,
            reward
          )
          .run();

        await env.DB
          .prepare(`
            UPDATE users
            SET coins = COALESCE(coins, 0) + ?
            WHERE id = ?
          `)
          .bind(
            reward,
            userId
          )
          .run();

        const updatedUser =
          await env.DB
            .prepare(`
              SELECT coins
              FROM users
              WHERE id = ?
            `)
            .bind(userId)
            .first();

        return json({
          ok: true,
          message: "Задание выполнено",
          reward,
          coins: Number(
            updatedUser?.coins || 0
          )
        }, headers);
      }

      // =========================
      // RANKING — COINS
      // =========================

      if (
        url.pathname === "/api/rating/coins" &&
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
            ORDER BY coins DESC, id ASC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          rating: result.results.map(
            (user, index) => ({
              place: index + 1,
              id: user.id,
              username: user.username,
              first_name: user.first_name,
              coins: Number(user.coins || 0)
            })
          )
        }, headers);
      }

      // =========================
      // RANKING — REFERRALS
      // =========================

      if (
        url.pathname === "/api/rating/referrals" &&
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
            ORDER BY referrals DESC, users.id ASC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          rating: result.results.map(
            (user, index) => ({
              place: index + 1,
              id: user.id,
              username: user.username,
              first_name: user.first_name,
              referrals: Number(user.referrals || 0)
            })
          )
        }, headers);
      }

      // =========================
      // MY REFERRAL REWARDS
      // =========================

      if (
        url.pathname === "/api/referral/rewards" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (!Number.isSafeInteger(userId) || userId <= 0) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              user_id,
              referrer_id,
              coins,
              created_at
            FROM referral_rewards
            WHERE referrer_id = ?
            ORDER BY id DESC
          `)
          .bind(userId)
          .all();

        const total = result.results.reduce(
          (sum, item) =>
            sum + Number(item.coins || 0),
          0
        );

        return json({
          ok: true,
          total,
          rewards: result.results
        }, headers);
      }

      // =========================
      // SAFE STAR CASE INFO
      // =========================
      // Star Case не открывается случайным образом
      // через этот API.

      if (
        url.pathname === "/api/star-case" &&
        request.method === "GET"
      ) {
        const gameCase = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              description,
              emoji,
              stars_price,
              type,
              is_active
            FROM cases
            WHERE type = 'stars'
              AND is_active = 1
            ORDER BY id ASC
            LIMIT 1
          `)
          .first();

        if (!gameCase) {
          return json({
            ok: false,
            error: "Star Case не найден"
          }, headers, 404);
        }

        const items = await env.DB
          .prepare(`
            SELECT
              case_items.gift_id,
              gifts.name,
              gifts.emoji,
              gifts.price,
              gifts.description
            FROM case_items
            JOIN gifts
              ON gifts.id = case_items.gift_id
            WHERE case_items.case_id = ?
            ORDER BY gifts.price ASC
          `)
          .bind(gameCase.id)
          .all();

        return json({
          ok: true,
          case: gameCase,
          items: items.results
        }, headers);
      }

      // =========================
      // STATIC FILES
      // =========================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error("WORKER ERROR:", error);

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
