export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test") {
      const result = await env.DB
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();

      return Response.json({
        ok: true,
        tables: result.results
      });
    }

    return env.ASSETS.fetch(request);
  }
};
