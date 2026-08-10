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

      // =====================================================
      // DATABASE TEST
      // =====================================================

      if (
        url.pathname === "/api/test" &&
        request.method === "GET"
      ) {
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


      // =====================================================
      // USER
      // =====================================================

      if (
        url.pathname === "/api/user" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const id = Number(body.id);

        if (
          !Number.isSafeInteger(id) ||
          id <= 0
        ) {
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


      // =====================================================
      // COINS
      // =====================================================

      if (
        url.pathname === "/api/coins" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (
          !Number.isSafeInteger(userId) ||
          userId <= 0
        ) {
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


      // =====================================================
      // GIFTS
      // =====================================================

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


      // =====================================================
      // CASES
      // =====================================================

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


      // =====================================================
      // CASE ITEMS
      // =====================================================

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
          return json({
            ok: false,
            error: "Некорректный case_id"
          }, headers, 400);
        }

        const gameCase = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              type,
              price_coins,
              stars_price
            FROM cases
            WHERE id = ?
              AND is_active = 1
          `)
          .bind(caseId)
          .first();

        if (!gameCase) {
          return json({
            ok: false,
            error: "Кейс не найден"
          }, headers, 404);
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

            ORDER BY case_items.chance DESC
          `)
          .bind(caseId)
          .all();

        const items = result.results || [];

        const totalChance = items.reduce(
          (sum, item) =>
            sum + Number(item.chance || 0),
          0
        );

        return json({
          ok: true,
          case: gameCase,
          items,
          total_chance: totalChance
        }, headers);
      }


      // =====================================================
      // OPEN COINS CASE
      // =====================================================

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
            SELECT
              id,
              coins
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
              description,
              emoji,
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
          return json({
            ok: false,
            error: "Кейс недоступен"
          }, headers, 404);
        }

        // Star Case здесь не открываем.
        // Для него нужна настоящая Telegram Stars оплата.
        if (gameCase.type !== "coins") {
          return json({
            ok: false,
            error: "Этот кейс открывается за Telegram Stars",
            payment_required: true,
            stars_price: Number(
              gameCase.stars_price || 0
            )
          }, headers, 400);
        }

        const price = Number(
          gameCase.price_coins || 0
        );

        if (
          !Number.isSafeInteger(price) ||
          price <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректная цена кейса"
          }, headers, 400);
        }

        const userCoins = Number(
          user.coins || 0
        );

        if (userCoins < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins",
            required: price,
            coins: userCoins
          }, headers, 400);
        }

        // Получаем награды
        const result = await env.DB
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
              AND case_items.chance > 0
          `)
          .bind(caseId)
          .all();

        const items = result.results || [];

        if (!items.length) {
          return json({
            ok: false,
            error: "В кейсе нет наград"
          }, headers, 400);
        }

        const totalChance = items.reduce(
          (sum, item) =>
            sum + Number(item.chance || 0),
          0
        );

        if (
          !Number.isFinite(totalChance) ||
          totalChance <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректные шансы кейса"
          }, headers, 400);
        }

        // =================================================
        // RANDOM REWARD
        // =================================================

        const random =
          Math.random() * totalChance;

        let current = 0;
        let selected = null;

        for (const item of items) {
          current += Number(
            item.chance || 0
          );

          if (random < current) {
            selected = item;
            break;
          }
        }

        if (!selected) {
          selected =
            items[items.length - 1];
        }

        // =================================================
        // СПИСАНИЕ COINS
        // =================================================

        const updateResult = await env.DB
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

        if (
          !updateResult ||
          updateResult.meta.changes !== 1
        ) {
          return json({
            ok: false,
            error: "Не удалось списать Coins. Попробуйте ещё раз."
          }, headers, 409);
        }

        // =================================================
        // INVENTORY
        // =================================================

        await env.DB
          .prepare(`
            INSERT INTO inventory
              (
                user_id,
                gift_id
              )
            VALUES (?, ?)
          `)
          .bind(
            userId,
            selected.gift_id
          )
          .run();

        // =================================================
        // HISTORY
        // =================================================

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

        // =================================================
        // UPDATED BALANCE
        // =================================================

        const updatedUser = await env.DB
          .prepare(`
            SELECT
              coins
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
            price: Number(
              selected.price || 0
            ),
            chance: Number(
              selected.chance || 0
            )
          },

          coins: Number(
            updatedUser?.coins || 0
          )
        }, headers);
      }


      // =====================================================
      // STAR CASE PAYMENT INFO
      // =====================================================

      if (
        url.pathname === "/api/cases/star" &&
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

        const gameCase = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              type,
              stars_price,
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
          return json({
            ok: false,
            error: "Кейс не найден"
          }, headers, 404);
        }

        if (gameCase.type !== "stars") {
          return json({
            ok: false,
            error: "Это не Stars-кейс"
          }, headers, 400);
        }

        const starsPrice = Number(
          gameCase.stars_price || 0
        );

        if (
          !Number.isSafeInteger(starsPrice) ||
          starsPrice <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректная цена Stars"
          }, headers, 400);
        }

        /*
          ВАЖНО:

          Здесь намеренно НЕ выдаём подарок.

          Настоящий Telegram Stars платеж должен быть
          создан через Bot API и подтверждён после
          успешной оплаты.

          Поэтому сейчас клиент получает информацию,
          что требуется оплата.
        */

        return json({
          ok: true,
          payment_required: true,
          case_id: gameCase.id,
          case_name: gameCase.name,
          stars: starsPrice,
          message:
            "Для открытия этого кейса требуется оплата Telegram Stars."
        }, headers);
      }


      // =====================================================
      // INVENTORY
      // =====================================================

      if (
        url.pathname === "/api/inventory" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (
          !Number.isSafeInteger(userId) ||
          userId <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              inventory.id,
              inventory.user_id,
              inventory.gift_id,
              inventory.created_at,

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


      // =====================================================
      // REFERRAL
      // =====================================================

      if (
        url.pathname === "/api/referral" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const userId = Number(
          body.user_id
        );

        const referrerId = Number(
          body.referrer_id
        );

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

        if (!user) {
          return json({
            ok: false,
            error: "Пользователь не найден"
          }, headers, 404);
        }

        const referrer = await env.DB
          .prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
          .bind(referrerId)
          .first();

        if (!referrer) {
          return json({
            ok: false,
            error: "Пригласивший пользователь не найден"
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
            error: "Реферальная связь уже существует"
          }, headers, 409);
        }

        await env.DB
          .prepare(`
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

        return json({
          ok: true,
          message: "Реферал успешно добавлен"
        }, headers);
      }


      // =====================================================
      // REFERRAL STATS
      // =====================================================

      if (
        url.pathname === "/api/referrals" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (
          !Number.isSafeInteger(userId) ||
          userId <= 0
        ) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const result = await env.DB
          .prepare(`
            SELECT
              COUNT(*) AS
