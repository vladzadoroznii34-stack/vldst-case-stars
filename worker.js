export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {

      /* =====================================================
         DATABASE TEST
      ===================================================== */

      if (url.pathname === "/api/test") {
        const result = await env.DB.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `).all();

        return json({
          ok: true,
          database: "connected",
          tables: result.results
        }, headers);
      }


      /* =====================================================
         USER
      ===================================================== */

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

        const banned = await env.DB.prepare(`
          SELECT user_id
          FROM admin_bans
          WHERE user_id = ?
        `).bind(id).first();

        if (banned) {
          return json({
            ok: false,
            error: "Ваш аккаунт заблокирован"
          }, headers, 403);
        }

        await env.DB.prepare(`
          INSERT INTO users
            (id, username, first_name)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name
        `).bind(
          id,
          body.username || null,
          body.first_name || null
        ).run();

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
        `).bind(id).first();

        return json({
          ok: true,
          user
        }, headers);
      }


      /* =====================================================
         COINS
      ===================================================== */

      if (
        url.pathname === "/api/coins" &&
        request.method === "GET"
      ) {
        const userId = Number(
          url.searchParams.get("user_id")
        );

        if (!validId(userId)) {
          return json({
            ok: false,
            error: "Некорректный user_id"
          }, headers, 400);
        }

        const user = await env.DB.prepare(`
          SELECT coins
          FROM users
          WHERE id = ?
        `).bind(userId).first();

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


      /* =====================================================
         GIFTS
      ===================================================== */

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

        return json({
          ok: true,
          gifts: result.results
        }, headers);
      }


      /* =====================================================
         CASES
      ===================================================== */

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

        return json({
          ok: true,
          cases: result.results
        }, headers);
      }


      /* =====================================================
         CASE ITEMS
      ===================================================== */

      if (
        url.pathname === "/api/cases/items" &&
        request.method === "GET"
      ) {
        const caseId = Number(
          url.searchParams.get("case_id")
        );

        if (!validId(caseId)) {
          return json({
            ok: false,
            error: "Некоррект
