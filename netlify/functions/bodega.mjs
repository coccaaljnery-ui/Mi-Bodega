const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
      body: "",
    };
  }

  const scriptUrl = String(process.env.BODEGA_APPS_SCRIPT_URL || "").trim();
  const token = String(process.env.BODEGA_API_TOKEN || "").trim();

  if (!scriptUrl || !token) {
    return json(500, {
      ok: false,
      error: "Faltan BODEGA_APPS_SCRIPT_URL o BODEGA_API_TOKEN en las variables de entorno de Netlify.",
    });
  }

  try {
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};

      // Diagnóstico de Netlify sin revelar secretos.
      if (q.action === "netlify_health") {
        return json(200, { ok: true, proxy: true, configured: true });
      }

      const u = new URL(scriptUrl);
      Object.entries(q).forEach(([k, v]) => {
        if (v != null && k !== "token" && k !== "callback") {
          u.searchParams.set(k, String(v));
        }
      });
      u.searchParams.set("token", token);

      const response = await fetch(u.toString(), {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });

      const text = await response.text();
      return {
        statusCode: response.ok ? 200 : 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
        body: text,
      };
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch {}
      body.token = token;

      const response = await fetch(scriptUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });

      const text = await response.text();
      return {
        statusCode: response.ok ? 200 : 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
        body: text,
      };
    }

    return json(405, { ok: false, error: "Método no permitido." });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};
