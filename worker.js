export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // Проверка API
    if (url.pathname === "/api/test") {
      const result = await env.DB
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all();

      return new Response(
        JSON.stringify({
          ok: true,
          database: "connected",
          tables: result.results
        }),
        { headers }
      );
    }

    // Каталог подарков
    if (url.pathname === "/api/gifts" && request.method === "GET") {
      const result = await env.DB
        .prepare(`
          SELECT id, name, emoji, price, description
          FROM gifts
          ORDER BY price ASC
        `)
        .all();

      return new Response(
        JSON.stringify({
          ok: true,
          gifts: result.results
        }),
        { headers }
      );
    }

    // Получение/создание пользователя
    if (url.pathname === "/api/user" && request.method === "POST") {
      const body = await request.json();

      const id = Number(body.id);
      const username = body.username || null;
      const firstName = body.first_name || null;

      if (!Number.isSafeInteger(id) || id <= 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Некорректный Telegram ID"
          }),
          { status: 400, headers }
        );
      }

      await env.DB
        .prepare(`
          INSERT INTO users (id, username, first_name)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name
        `)
        .bind(id, username, firstName)
        .run();

      const user = await env.DB
        .prepare(`
          SELECT id, username, first_name, balance, created_at
          FROM users
          WHERE id = ?
        `)
        .bind(id)
        .first();

      return new Response(
        JSON.stringify({
          ok: true,
          user
        }),
        { headers }
      );
    }

    // Инвентарь пользователя
    if (url.pathname === "/api/inventory" && request.method === "GET") {
      const userId = Number(url.searchParams.get("user_id"));

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Некорректный user_id"
          }),
          { status: 400, headers }
        );
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

      return new Response(
        JSON.stringify({
          ok: true,
          inventory: result.results
        }),
        { headers }
      );
    }

    // Реферальная привязка
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
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Некорректные данные"
          }),
          { status: 400, headers }
        );
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
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Реферал уже установлен"
          }),
          { status: 409, headers }
        );
      }

      await env.DB
        .prepare(`
          INSERT INTO referrals (user_id, referrer_id)
          VALUES (?, ?)
        `)
        .bind(userId, referrerId)
        .run();

      return new Response(
        JSON.stringify({
          ok: true
        }),
        { headers }
      );
    }

    // Статические файлы Mini App
    return new Response("VLDST CASE x STARS API работает", {
  headers: {
    "Content-Type": "text/plain; charset=UTF-8"
  }
});
