export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Telegram-Init-Data"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      /*
       * =====================================================
       * TELEGRAM WEBHOOK
       * =====================================================
       */

      if (
        url.pathname === "/telegram/webhook" &&
        request.method === "POST"
      ) {
        return await handleTelegramWebhook(request, env, headers);
      }

      /*
       * =====================================================
       * DATABASE TEST
       * =====================================================
       */

      if (
        url.pathname === "/api/test" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `).all();

        return json(
          {
            ok: true,
            database: "connected",
            tables: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * TELEGRAM USER
       * =====================================================
       */

      if (
        url.pathname === "/api/user" &&
        request.method === "POST"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const tgUser = auth.user;

        await ensureUser(env, tgUser);

        const user = await getUser(env, tgUser.id);

        if (!user) {
          return json(
            {
              ok: false,
              error: "Пользователь не найден"
            },
            headers,
            404
          );
        }

        return json(
          {
            ok: true,
            user
          },
          headers
        );
      }

      /*
       * =====================================================
       * COINS
       * =====================================================
       */

      if (
        url.pathname === "/api/coins" &&
        request.method === "GET"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        await ensureUser(env, auth.user);

        const user = await getUser(env, auth.user.id);

        return json(
          {
            ok: true,
            coins: Number(user?.coins || 0)
          },
          headers
        );
      }

      /*
       * =====================================================
       * GIFTS
       * =====================================================
       */

      if (
        url.pathname === "/api/gifts" &&
        request.method === "GET"
      ) {
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

        return json(
          {
            ok: true,
            gifts: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * CASES
       * =====================================================
       */

      if (
        url.pathname === "/api/cases" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT
            id,
            name,
            description,
            emoji,
            price_coins,
            stars_price,
            type,
            gift_id,
            is_active
          FROM cases
          WHERE is_active = 1
          ORDER BY id ASC
        `).all();

        return json(
          {
            ok: true,
            cases: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * CASE ITEMS
       * =====================================================
       */

      if (
        url.pathname === "/api/cases/items" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        if (
          !Number.isSafeInteger(caseId) ||
          caseId <= 0
        ) {
          return json(
            {
              ok: false,
              error: "Некорректный case_id"
            },
            headers,
            400
          );
        }

        const result = await env.DB.prepare(`
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

        return json(
          {
            ok: true,
            items: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * OPEN CASE
       * =====================================================
       */

      if (
        url.pathname === "/api/cases/open" &&
        request.method === "POST"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        await ensureUser(env, auth.user);

        const body = await safeJson(request);

        const caseId = Number(body?.case_id);

        if (
          !Number.isSafeInteger(caseId) ||
          caseId <= 0
        ) {
          return json(
            {
              ok: false,
              error: "Некорректный case_id"
            },
            headers,
            400
          );
        }

        const user = await env.DB.prepare(`
          SELECT
            id,
            coins
          FROM users
          WHERE id = ?
        `)
          .bind(userId)
          .first();

        if (!user) {
          return json(
            {
              ok: false,
              error: "Пользователь не найден"
            },
            headers,
            404
          );
        }

        const gameCase = await env.DB.prepare(`
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

        if (
          !gameCase ||
          Number(gameCase.is_active) !== 1
        ) {
          return json(
            {
              ok: false,
              error: "Кейс недоступен"
            },
            headers,
            404
          );
        }

        if (gameCase.type !== "coins") {
          return json(
            {
              ok: false,
              error:
                "Этот кейс пока нельзя открыть за Coins"
            },
            headers,
            400
          );
        }

        const price = Number(
          gameCase.price_coins || 0
        );

        const coins = Number(
          user.coins || 0
        );

        if (price <= 0) {
          return json(
            {
              ok: false,
              error: "Неверная цена кейса"
            },
            headers,
            400
          );
        }

        if (coins < price) {
          return json(
            {
              ok: false,
              error: "Недостаточно Coins",
              required: price,
              coins
            },
            headers,
            400
          );
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

        const validItems = items.results.filter(
          item => Number(item.chance) > 0
        );

        if (!validItems.length) {
          return json(
            {
              ok: false,
              error: "В кейсе нет наград"
            },
            headers,
            400
          );
        }

        const totalChance = validItems.reduce(
          (sum, item) =>
            sum + Number(item.chance),
          0
        );

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

        const update = await env.DB.prepare(`
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
          return json(
            {
              ok: false,
              error: "Не удалось списать Coins"
            },
            headers,
            400
          );
        }

        await env.DB.prepare(`
          INSERT INTO inventory
            (user_id, gift_id)
          VALUES (?, ?)
        `)
          .bind(
            userId,
            selected.gift_id
          )
          .run();

        await env.DB.prepare(`
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

        await transaction(
          env,
          userId,
          -price,
          "case_open",
          `Открытие кейса: ${gameCase.name}`
        );

        const updated = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
          .bind(userId)
          .first();

        return json(
          {
            ok: true,
            reward: {
              gift_id:
                Number(selected.gift_id),
              name:
                selected.name,
              emoji:
                selected.emoji,
              price:
                Number(selected.price || 0),
              chance:
                Number(selected.chance || 0)
            },
            coins:
              Number(updated?.coins || 0)
          },
          headers
        );
      }

      /*
       * =====================================================
       * INVENTORY
       * =====================================================
       */

      if (
        url.pathname === "/api/inventory" &&
        request.method === "GET"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        await ensureUser(env, auth.user);

        const result = await env.DB.prepare(`
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

        return json(
          {
            ok: true,
            inventory: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * SELL INVENTORY ITEM
       * =====================================================
       */

      if (
        url.pathname === "/api/inventory/sell" &&
        request.method === "POST"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        const body = await safeJson(request);

        const inventoryId = Number(
          body?.inventory_id
        );

        if (
          !Number.isSafeInteger(inventoryId) ||
          inventoryId <= 0
        ) {
          return json(
            {
              ok: false,
              error: "Некорректный inventory_id"
            },
            headers,
            400
          );
        }

        const item = await env.DB.prepare(`
          SELECT
            inventory.id,
            inventory.user_id,
            gifts.name,
            gifts.price
          FROM inventory
          JOIN gifts
            ON gifts.id = inventory.gift_id
          WHERE inventory.id = ?
          AND inventory.user_id = ?
          LIMIT 1
        `)
          .bind(
            inventoryId,
            userId
          )
          .first();

        if (!item) {
          return json(
            {
              ok: false,
              error: "Предмет не найден"
            },
            headers,
            404
          );
        }

        const sellPrice = Math.max(
          1,
          Math.floor(
            Number(item.price || 0) * 0.5
          )
        );

        const deleted = await env.DB.prepare(`
          DELETE FROM inventory
          WHERE id = ?
          AND user_id = ?
        `)
          .bind(
            inventoryId,
            userId
          )
          .run();

        if (!deleted.success) {
          return json(
            {
              ok: false,
              error: "Не удалось продать предмет"
            },
            headers,
            400
          );
        }

        await env.DB.prepare(`
          UPDATE users
          SET coins =
            COALESCE(coins, 0) + ?
          WHERE id = ?
        `)
          .bind(
            sellPrice,
            userId
          )
          .run();

        await transaction(
          env,
          userId,
          sellPrice,
          "sell_gift",
          `Продажа предмета: ${item.name}`
        );

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
          .bind(userId)
          .first();

        return json(
          {
            ok: true,
            sold: true,
            price: sellPrice,
            coins:
              Number(user?.coins || 0)
          },
          headers
        );
      }

      /*
       * =====================================================
       * TASKS
       * =====================================================
       */

      if (
        url.pathname === "/api/tasks" &&
        request.method === "GET"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        await ensureUser(env, auth.user);

        const result = await env.DB.prepare(`
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

        return json(
          {
            ok: true,
            tasks: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * COMPLETE TASK
       * =====================================================
       */

      if (
        url.pathname === "/api/tasks/complete" &&
        request.method === "POST"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        const body = await safeJson(request);

        const taskId = Number(
          body?.task_id
        );

        if (
          !Number.isSafeInteger(taskId) ||
          taskId <= 0
        ) {
          return json(
            {
              ok: false,
              error: "Некорректный task_id"
            },
            headers,
            400
          );
        }

        const task = await env.DB.prepare(`
          SELECT *
          FROM tasks
          WHERE id = ?
        `)
          .bind(taskId)
          .first();

        if (!task) {
          return json(
            {
              ok: false,
              error: "Задание не найдено"
            },
            headers,
            404
          );
        }

        if (Number(task.is_active) !== 1) {
          return json(
            {
              ok: false,
              error: "Задание отключено"
            },
            headers,
            400
          );
        }

        const existing = await env.DB.prepare(`
          SELECT id
          FROM task_completions
          WHERE task_id = ?
          AND user_id = ?
        `)
          .bind(
            taskId,
            userId
          )
          .first();

        if (existing) {
          return json(
            {
              ok: false,
              error: "Задание уже выполнено"
            },
            headers,
            409
          );
        }

        if (task.max_completions !== null) {
          const count = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM task_completions
            WHERE task_id = ?
          `)
            .bind(taskId)
            .first();

          if (
            Number(count?.count || 0) >=
            Number(task.max_completions)
          ) {
            return json(
              {
                ok: false,
                error:
                  "Лимит выполнений задания достигнут"
              },
              headers,
              400
            );
          }
        }

        const reward = Math.max(
          0,
          Number(task.reward) || 0
        );

        await env.DB.prepare(`
          INSERT INTO task_completions
            (
              task_id,
              user_id,
              reward
            )
          VALUES (?, ?, ?)
        `)
          .bind(
            taskId,
            userId,
            reward
          )
          .run();

        await env.DB.prepare(`
          UPDATE users
          SET coins =
            COALESCE(coins, 0) + ?
          WHERE id = ?
        `)
          .bind(
            reward,
            userId
          )
          .run();

        await transaction(
          env,
          userId,
          reward,
          "task_reward",
          `Награда за задание: ${task.title}`
        );

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
          .bind(userId)
          .first();

        return json(
          {
            ok: true,
            reward,
            coins:
              Number(user?.coins || 0)
          },
          headers
        );
      }

      /*
       * =====================================================
       * REFERRALS
       * =====================================================
       */

      if (
        url.pathname === "/api/referrals" &&
        request.method === "GET"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        await ensureUser(env, auth.user);

        const result = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM referrals
          WHERE referrer_id = ?
        `)
          .bind(userId)
          .first();

        return json(
          {
            ok: true,
            referrals:
              Number(result?.count || 0),

            link:
              `https://t.me/VldstxCase_bot?start=ref_${userId}`
          },
          headers
        );
      }

      /*
       * =====================================================
       * MINI GAME STATUS
       * =====================================================
       */

      if (
        url.pathname === "/api/game/status" &&
        request.method === "GET"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        await ensureUser(env, auth.user);

        const row = await env.DB.prepare(`
          SELECT last_played_at
          FROM game_cooldowns
          WHERE user_id = ?
        `)
          .bind(userId)
          .first();

        const cooldown = 60 * 60 * 1000;

        const last = Number(
          row?.last_played_at || 0
        );

        const now = Date.now();

        const remaining = Math.max(
          0,
          cooldown - (now - last)
        );

        return json(
          {
            ok: true,
            available: remaining === 0,
            remaining_ms: remaining,
            remaining_seconds:
              Math.ceil(remaining / 1000)
          },
          headers
        );
      }

      /*
       * =====================================================
       * MINI GAME PLAY
       * =====================================================
       */

      if (
        url.pathname === "/api/game/play" &&
        request.method === "POST"
      ) {
        const auth = await authenticateTelegram(request, env);

        if (!auth.ok) {
          return json(
            {
              ok: false,
              error: auth.error
            },
            headers,
            401
          );
        }

        const userId = auth.user.id;

        const body = await safeJson(request);

        const guess = Number(
          body?.guess
        );

        if (
          !Number.isSafeInteger(guess) ||
          guess < 1 ||
          guess > 5
        ) {
          return json(
            {
              ok: false,
              error: "Выбери число от 1 до 5"
            },
            headers,
            400
          );
        }

        await ensureUser(env, auth.user);

        const cooldown = 60 * 60 * 1000;

        const row = await env.DB.prepare(`
          SELECT last_played_at
          FROM game_cooldowns
          WHERE user_id = ?
        `)
          .bind(userId)
          .first();

        const last = Number(
          row?.last_played_at || 0
        );

        const now = Date.now();

        if (
          now - last < cooldown
        ) {
          const remaining =
            cooldown - (now - last);

          return json(
            {
              ok: false,
              error: "Игра пока недоступна",
              remaining_ms: remaining,
              remaining_seconds:
                Math.ceil(remaining / 1000)
            },
            headers,
            429
          );
        }

        const secret =
          Math.floor(
            Math.random() * 5
          ) + 1;

        await env.DB.prepare(`
          INSERT INTO game_cooldowns
            (
              user_id,
              last_played_at
            )
          VALUES (?, ?)

          ON CONFLICT(user_id)
          DO UPDATE SET
            last_played_at =
              excluded.last_played_at
        `)
          .bind(
            userId,
            now
          )
          .run();

        const won = guess === secret;

        const reward = won
          ? Math.floor(
              Math.random() * 451
            ) + 50
          : 0;

        if (reward > 0) {
          await env.DB.prepare(`
            UPDATE users
            SET coins =
              COALESCE(coins, 0) + ?
            WHERE id = ?
          `)
            .bind(
              reward,
              userId
            )
            .run();

          await transaction(
            env,
            userId,
            reward,
            "mini_game",
            "Награда за мини-игру"
          );
        }

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `)
          .bind(userId)
          .first();

        return json(
          {
            ok: true,
            won,
            number: secret,
            reward,
            coins:
              Number(user?.coins || 0),
            cooldown_seconds: 3600
          },
          headers
        );
      }

      /*
       * =====================================================
       * RATING COINS
       * =====================================================
       */

      if (
        url.pathname === "/api/rating/coins" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT
            id,
            username,
            first_name,
            coins
          FROM users
          ORDER BY
            coins DESC,
            id ASC
          LIMIT 100
        `).all();

        return json(
          {
            ok: true,
            rating:
              result.results.map(
                (user, index) => ({
                  place: index + 1,
                  id: user.id,
                  username: user.username,
                  first_name: user.first_name,
                  coins:
                    Number(user.coins || 0)
                })
              )
          },
          headers
        );
      }

      /*
       * =====================================================
       * RATING REFERRALS
       * =====================================================
       */

      if (
        url.pathname === "/api/rating/referrals" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT
            users.id,
            users.username,
            users.first_name,
            COUNT(referrals.id) AS referrals
          FROM users
          LEFT JOIN referrals
            ON referrals.referrer_id = users.id
          GROUP BY users.id
          ORDER BY
            referrals DESC,
            users.id ASC
          LIMIT 100
        `).all();

        return json(
          {
            ok: true,
            rating:
              result.results.map(
                (user, index) => ({
                  place: index + 1,
                  id: user.id,
                  username: user.username,
                  first_name: user.first_name,
                  referrals:
                    Number(user.referrals || 0)
                })
              )
          },
          headers
        );
      }

      /*
       * =====================================================
       * ADS
       * =====================================================
       */

      if (
        url.pathname === "/api/ads" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT
            id,
            title,
            text,
            url,
            reward
          FROM ads
          WHERE is_active = 1
          ORDER BY id DESC
        `).all();

        return json(
          {
            ok: true,
            ads: result.results
          },
          headers
        );
      }

      /*
       * =====================================================
       * ADMIN
       * =====================================================
       */

      if (
        url.pathname.startsWith("/api/admin/")
      ) {
        if (!isAdmin(request, env)) {
          return json(
            {
              ok: false,
              error: "Доступ запрещён"
            },
            headers,
            403
          );
        }

        /*
         * ADMIN STATS
         */

        if (
          url.pathname === "/api/admin/stats" &&
          request.method === "GET"
        ) {
          const users = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM users
          `).first();

          const coins = await env.DB.prepare(`
            SELECT
              COALESCE(SUM(coins), 0) AS total
            FROM users
          `).first();

          const cases = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM cases
          `).first();

          const gifts = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM gifts
          `).first();

          const tasks = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM tasks
          `).first();

          const ads = await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM ads
            WHERE is_active = 1
          `).first();

          return json(
            {
              ok: true,
              stats: {
                users:
                  Number(users?.count || 0),
                coins:
                  Number(coins?.total || 0),
                cases:
                  Number(cases?.count || 0),
                gifts:
                  Number(gifts?.count || 0),
                tasks:
                  Number(tasks?.count || 0),
                ads:
                  Number(ads?.count || 0)
              }
            },
            headers
          );
        }

        /*
         * ADMIN USERS
         */

        if (
          url.pathname === "/api/admin/users" &&
          request.method === "GET"
        ) {
          const result = await env.DB.prepare(`
            SELECT
              id,
              username,
              first_name,
              balance,
              coins,
              created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 500
          `).all();

          return json(
            {
              ok: true,
              users: result.results
            },
            headers
          );
        }

        /*
         * ADMIN CHANGE COINS
         */

        if (
          url.pathname === "/api/admin/users/coins" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          const userId = Number(
            body?.user_id
          );

          const amount = Number(
            body?.amount
          );

          if (
            !Number.isSafeInteger(userId) ||
            !Number.isSafeInteger(amount)
          ) {
            return json(
              {
                ok: false,
                error: "Некорректные данные"
              },
              headers,
              400
            );
          }

          const exists = await env.DB.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
            .bind(userId)
            .first();

          if (!exists) {
            return json(
              {
                ok: false,
                error: "Пользователь не найден"
              },
              headers,
              404
            );
          }

          await env.DB.prepare(`
            UPDATE users
            SET coins =
              COALESCE(coins, 0) + ?
            WHERE id = ?
          `)
            .bind(
              amount,
              userId
            )
            .run();

          await transaction(
            env,
            userId,
            amount,
            "admin",
            "Изменение Coins администратором"
          );

          const user = await env.DB.prepare(`
            SELECT coins
            FROM users
            WHERE id = ?
          `)
            .bind(userId)
            .first();

          return json(
            {
              ok: true,
              coins:
                Number(user?.coins || 0)
            },
            headers
          );
        }

        /*
         * ADMIN GIFTS GET
         */

        if (
          url.pathname === "/api/admin/gifts" &&
          request.method === "GET"
        ) {
          const result = await env.DB.prepare(`
            SELECT *
            FROM gifts
            ORDER BY id DESC
          `).all();

          return json(
            {
              ok: true,
              gifts: result.results
            },
            headers
          );
        }

        /*
         * ADMIN GIFTS POST
         */

        if (
          url.pathname === "/api/admin/gifts" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          await env.DB.prepare(`
            INSERT INTO gifts
              (
                name,
                emoji,
                price,
                description
              )
            VALUES (?, ?, ?, ?)
          `)
            .bind(
              String(body?.name || "Подарок"),
              String(body?.emoji || "🎁"),
              Math.max(
                0,
                Number(body?.price || 0)
              ),
              String(
                body?.description || ""
              )
            )
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN GIFTS DELETE
         */

        if (
          url.pathname === "/api/admin/gifts" &&
          request.method === "DELETE"
        ) {
          const id = Number(
            url.searchParams.get("id")
          );

          if (
            !Number.isSafeInteger(id) ||
            id <= 0
          ) {
            return json(
              {
                ok: false,
                error: "Некорректный id"
              },
              headers,
              400
            );
          }

          await env.DB.prepare(`
            DELETE FROM gifts
            WHERE id = ?
          `)
            .bind(id)
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN TASKS GET
         */

        if (
          url.pathname === "/api/admin/tasks" &&
          request.method === "GET"
        ) {
          const result = await env.DB.prepare(`
            SELECT *
            FROM tasks
            ORDER BY id DESC
          `).all();

          return json(
            {
              ok: true,
              tasks: result.results
            },
            headers
          );
        }

        /*
         * ADMIN TASKS POST
         */

        if (
          url.pathname === "/api/admin/tasks" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          await env.DB.prepare(`
            INSERT INTO tasks
              (
                title,
                description,
                type,
                url,
                reward,
                is_active,
                max_completions
              )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
            .bind(
              String(
                body?.title || "Задание"
              ),
              String(
                body?.description || ""
              ),
              String(
                body?.type || "link"
              ),
              body?.url || null,
              Math.max(
                0,
                Number(body?.reward || 0)
              ),
              Number(
                body?.is_active ?? 1
              ),
              body?.max_completions == null
                ? null
                : Number(
                    body.max_completions
                  )
            )
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN ADS GET
         */

        if (
          url.pathname === "/api/admin/ads" &&
          request.method === "GET"
        ) {
          const result = await env.DB.prepare(`
            SELECT *
            FROM ads
            ORDER BY id DESC
          `).all();

          return json(
            {
              ok: true,
              ads: result.results
            },
            headers
          );
        }

        /*
         * ADMIN ADS POST
         */

        if (
          url.pathname === "/api/admin/ads" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          await env.DB.prepare(`
            INSERT INTO ads
              (
                title,
                text,
                url,
                reward,
                is_active
              )
            VALUES (?, ?, ?, ?, ?)
          `)
            .bind(
              String(
                body?.title || "Реклама"
              ),
              String(
                body?.text || ""
              ),
              body?.url || null,
              Math.max(
                0,
                Number(body?.reward || 0)
              ),
              Number(
                body?.is_active ?? 1
              )
            )
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN ADS DELETE
         */

        if (
          url.pathname === "/api/admin/ads" &&
          request.method === "DELETE"
        ) {
          const id = Number(
            url.searchParams.get("id")
          );

          if (
            !Number.isSafeInteger(id) ||
            id <= 0
          ) {
            return json(
              {
                ok: false,
                error: "Некорректный id"
              },
              headers,
              400
            );
          }

          await env.DB.prepare(`
            DELETE FROM ads
            WHERE id = ?
          `)
            .bind(id)
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN BAN
         */

        if (
          url.pathname === "/api/admin/ban" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          const userId = Number(
            body?.user_id
          );

          if (
            !Number.isSafeInteger(userId) ||
            userId <= 0
          ) {
            return json(
              {
                ok: false,
                error: "Некорректный user_id"
              },
              headers,
              400
            );
          }

          await env.DB.prepare(`
            INSERT OR REPLACE INTO admin_bans
              (user_id)
            VALUES (?)
          `)
            .bind(userId)
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        /*
         * ADMIN UNBAN
         */

        if (
          url.pathname === "/api/admin/unban" &&
          request.method === "POST"
        ) {
          const body = await safeJson(request);

          const userId = Number(
            body?.user_id
          );

          if (
            !Number.isSafeInteger(userId) ||
            userId <= 0
          ) {
            return json(
              {
                ok: false,
                error: "Некорректный user_id"
              },
              headers,
              400
            );
          }

          await env.DB.prepare(`
            DELETE FROM admin_bans
            WHERE user_id = ?
          `)
            .bind(userId)
            .run();

          return json(
            {
              ok: true
            },
            headers
          );
        }

        return json(
          {
            ok: false,
            error: "Admin endpoint не найден"
          },
          headers,
          404
        );
      }

      /*
       * =====================================================
       * STATIC FILES
       * =====================================================
       */

      if (
        env.ASSETS &&
        typeof env.ASSETS.fetch === "function"
      ) {
        return env.ASSETS.fetch(request);
      }

      return new Response(
        "VLDST CASE x STARS API работает. ASSETS binding пока не подключён.",
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8"
          }
        }
      );

    } catch (error) {
      console.error(
        "WORKER ERROR:",
        error
      );

      return json(
        {
          ok: false,
          error: "Внутренняя ошибка сервера",
          message:
            error?.message ||
            String(error)
        },
        headers,
        500
      );
    }
  }
};


/*
 * =========================================================
 * JSON
 * =========================================================
 */

function json(
  data,
  headers,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}


/*
 * =========================================================
 * SAFE JSON
 * =========================================================
 */

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


/*
 * =========================================================
 * TELEGRAM AUTHENTICATION
 *
 * Проверяем initData, которое Telegram
 * передаёт Mini App.
 * =========================================================
 */

async function authenticateTelegram(
  request,
  env
) {
  const initData =
    request.headers.get(
      "X-Telegram-Init-Data"
    ) ||
    request.headers.get(
      "X-Telegram-InitData"
    );

  if (!initData) {
    return {
      ok: false,
      error:
        "Telegram initData отсутствует"
    };
  }

  if (!env.BOT_TOKEN) {
    return {
      ok: false,
      error:
        "BOT_TOKEN не настроен"
    };
  }

  try {
    const params =
      new URLSearchParams(initData);

    const receivedHash =
      params.get("hash");

    if (!receivedHash) {
      return {
        ok: false,
        error:
          "Telegram hash отсутствует"
      };
    }

    params.delete("hash");

    const dataCheckString =
      [...params.entries()]
        .sort(
          ([a], [b]) =>
            a.localeCompare(b)
        )
        .map(
          ([key, value]) =>
            `${key}=${value}`
        )
        .join("\n");

    const secretKey =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(
          env.BOT_TOKEN
        ),
        {
          name: "HMAC",
          hash: "SHA-256"
        },
        false,
        ["sign"]
      );

    const secret =
      await crypto.subtle.sign(
        "HMAC",
        secretKey,
        new TextEncoder().encode(
          "WebAppData"
        )
      );

    const dataKey =
      await crypto.subtle.importKey(
        "raw",
        secret,
        {
          name: "HMAC",
          hash: "SHA-256"
        },
        false,
        ["sign"]
      );

    const calculated =
      await crypto.subtle.sign(
        "HMAC",
        dataKey,
        new TextEncoder().encode(
          dataCheckString
        )
      );

    const calculatedHex =
      [...new Uint8Array(calculated)]
        .map(
          byte =>
            byte
              .toString(16)
              .padStart(2, "0")
        )
        .join("");

    if (
      calculatedHex !==
      receivedHash
    ) {
      return {
        ok: false,
        error:
          "Неверная Telegram подпись"
      };
    }

    const userString =
      params.get("user");

    if (!userString) {
      return {
        ok: false,
        error:
          "Telegram user отсутствует"
      };
    }

    const user =
      JSON.parse(userString);

    if (
      !user?.id ||
      !Number.isSafeInteger(
        Number(user.id)
      )
    ) {
      return {
        ok: false,
        error:
          "Некорректный Telegram ID"
      };
    }

    /*
     * Проверяем свежесть initData.
     */

    const authDate =
      Number(
        params.get("auth_date") || 0
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

    /*
     * 24 часа.
     */

    if (
      authDate <= 0 ||
      now - authDate > 86400
    ) {
      return {
        ok: false,
        error:
          "Telegram initData устарел"
      };
    }

    return {
      ok: true,
      user: {
        id: Number(user.id),
        username:
          user.username || null,
        first_name:
          user.first_name || null,
        last_name:
          user.last_name || null
      }
    };

  } catch (error) {
    console.error(
      "TELEGRAM AUTH ERROR:",
      error
    );

    return {
      ok: false,
      error:
        "Не удалось проверить Telegram"
    };
  }
}


/*
 * =========================================================
 * ENSURE USER
 * =========================================================
 */

async function ensureUser(
  env,
  tgUser
) {
  await env.DB.prepare(`
    INSERT INTO users
      (
        id,
        username,
        first_name
      )
    VALUES (?, ?, ?)

    ON CONFLICT(id)
    DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `)
    .bind(
      tgUser.id,
      tgUser.username || null,
      tgUser.first_name || null
    )
    .run();
}


/*
 * =========================================================
 * GET USER
 * =========================================================
 */

async function getUser(
  env,
  userId
) {
  return await env.DB.prepare(`
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
    .bind(userId)
    .first();
}


/*
 * =========================================================
 * TRANSACTION
 * =========================================================
 */

async function transaction(
  env,
  userId,
  amount,
  type,
  description
) {
  await env.DB.prepare(`
    INSERT INTO transactions
      (
        user_id,
        type,
        amount,
        description
      )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      userId,
      amount,
      type,
      description
    )
    .run();
}


/*
 * =========================================================
 * ADMIN AUTH
 * =========================================================
 */

function isAdmin(
  request,
  env
) {
  if (!env.ADMIN_KEY) {
    return false;
  }

  const auth =
    request.headers.get(
      "Authorization"
    ) || "";

  return (
    auth ===
    `Bearer ${env.ADMIN_KEY}`
  );
}


/*
 * =========================================================
 * TELEGRAM WEBHOOK
 * =========================================================
 */

async function handleTelegramWebhook(
  request,
  env,
  headers
) {
  try {
    const update =
      await request.json();

    const message =
      update?.message;

    if (!message) {
      return json(
        {
          ok: true
        },
        headers
      );
    }

    const chatId =
      Number(message.chat?.id);

    const fromId =
      Number(message.from?.id);

    if (
      !Number.isSafeInteger(chatId) ||
      !Number.isSafeInteger(fromId)
    ) {
      return json(
        {
          ok: true
        },
        headers
      );
    }

    const text =
      String(
        message.text || ""
      ).trim();

    if (!text.startsWith("/start")) {
      return json(
        {
          ok: true
        },
        headers
      );
    }

    /*
     * Создаём пользователя.
     */

    const telegramUser =
      message.from;

    await ensureUser(
      env,
      {
        id: fromId,
        username:
          telegramUser?.username ||
          null,
        first_name:
          telegramUser?.first_name ||
          null
      }
    );

    /*
     * Реферальный параметр:
     *
     * /start ref_123456
     */

    const parts =
      text.split(/\s+/);

    const startParam =
      parts[1] || "";

    if (
      startParam.startsWith("ref_")
    ) {
      const referrerId =
        Number(
          startParam.substring(4)
        );

      if (
        Number.isSafeInteger(
          referrerId
        ) &&
        referrerId > 0 &&
        referrerId !== fromId
      ) {
        await processReferral(
          env,
          fromId,
          referrerId
        );
      }
    }

    /*
     * Отправляем кнопку Mini App.
     */

    if (
      env.BOT_TOKEN &&
      env.WEBAPP_URL
    ) {
      await telegramRequest(
        env,
        "sendMessage",
        {
          chat_id: chatId,

          text:
            "🎁 Добро пожаловать в VLDST CASE x STARS!",

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text:
                    "🚀 Открыть приложение",

                  web_app: {
                    url:
                      env.WEBAPP_URL
                  }
                }
              ]
            ]
          }
        }
      );
    }

    return json(
      {
        ok: true
      },
      headers
    );

  } catch (error) {
    console.error(
      "WEBHOOK ERROR:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error?.message ||
          String(error)
      },
      headers,
      500
    );
  }
}


/*
 * =========================================================
 * REFERRAL
 * =========================================================
 */

async function processReferral(
  env,
  userId,
  referrerId
) {
  const existing =
    await env.DB.prepare(`
      SELECT id
      FROM referrals
      WHERE user_id = ?
    `)
      .bind(userId)
      .first();

  if (existing) {
    return;
  }

  const referrer =
    await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
    `)
      .bind(referrerId)
      .first();

  if (!referrer) {
    return;
  }

  await env.DB.prepare(`
    INSERT INTO referrals
      (
        user_id,
        referrer_id
      )
    VALUES (?, ?)
  `)
    .bind(
      userId,
      referrerId
    )
    .run();

  const reward = 100;

  await env.DB.prepare(`
    UPDATE users
    SET coins =
      COALESCE(coins, 0) + ?
    WHERE id = ?
  `)
    .bind(
      reward,
      referrerId
    )
    .run();

  await transaction(
    env,
    referrerId,
    reward,
    "referral",
    "Награда за нового реферала"
  );

  await env.DB.prepare(`
    INSERT INTO referral_rewards
      (
        user_id,
        referrer_id,
        coins
      )
    VALUES (?, ?, ?)
  `)
    .bind(
      userId,
      referrerId,
      reward
    )
    .run();
}


/*
 * =========================================================
 * TELEGRAM API
 * =========================================================
 */

async function telegramRequest(
  env,
  method,
  body
) {
  const response =
    await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  return await response.json();
          }
