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
            WHERE type='table'
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
      // CASE CONTENT
      // =========================

      if (
        url.pathname === "/api/cases/items" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        if (!Number.isSafeInteger(caseId)) {
          return json({
            ok: false,
            error: "Некорректный case_id"
          }, headers, 400);
        }

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
      // OPEN CASE FOR COINS
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

        if (!gameCase || !gameCase.is_active) {
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

        if (Number(user.coins || 0) < price) {
          return json({
            ok: false,
            error: "Недостаточно Coins",
            required: price,
            coins: Number(user.coins || 0)
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
            error: "В кейсе нет наград"
          }, headers, 400);
        }

        const totalChance = items.results.reduce(
          (sum, item) =>
            sum + Number(item.chance || 0),
          0
        );

        if (totalChance <= 0) {
          return json({
            ok: false,
            error: "Некорректные шансы кейса"
          }, headers, 400);
        }

        // Случайный выбор на сервере
        const random =
          Math.random() * totalChance;

        let current = 0;
        let selected = null;

        for (const item of items.results) {
          current += Number(item.chance || 0);

          if (random < current) {
            selected = item;
            break;
          }
        }

        if (!selected) {
          selected = items.results[
            items.results.length - 1
          ];
        }

        // Списываем Coins
        await env.DB
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

        // Добавляем подарок
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

        // История открытия
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
            price: selected.price,
            chance: selected.chance
          },
          coins: Number(
            updatedUser?.coins || 0
