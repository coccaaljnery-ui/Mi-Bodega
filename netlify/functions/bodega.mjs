import crypto from "node:crypto";

const COOKIE_NAME = "mi_bodega_session";
const SESSION_SECONDS = 12 * 60 * 60;

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
};

const parseCookies = (header = "") => Object.fromEntries(
  String(header)
    .split(";")
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => {
      const i = v.indexOf("=");
      return i < 0 ? [v, ""] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
    })
);

const signSession = (exp, secret) => {
  const payload = `v1.${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

const verifySession = (value, secret) => {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
  const expected = signSession(exp, secret);
  return safeEqual(value, expected);
};

const sessionCookie = (value, maxAge = SESSION_SECONDS) =>
  `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

const parseBody = (event) => {
  try { return JSON.parse(event.body || "{}"); } catch { return {}; }
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "cache-control": "no-store" }, body: "" };
  }

  const scriptUrl = String(process.env.BODEGA_APPS_SCRIPT_URL || "").trim();
  const token = String(process.env.BODEGA_API_TOKEN || "").trim();
  const accessPin = String(process.env.BODEGA_ACCESS_PIN || "").trim();
  const backendConfigured = !!(scriptUrl && token);
  const securityConfigured = accessPin.length >= 6;
  const q = event.queryStringParameters || {};
  const body = event.httpMethod === "POST" ? parseBody(event) : {};
  const action = String(q.action || body.action || "").trim();

  // Diagnóstico público sin revelar secretos.
  if (event.httpMethod === "GET" && action === "netlify_health") {
    return json(200, {
      ok: backendConfigured && securityConfigured,
      proxy: true,
      configured: backendConfigured,
      securityConfigured,
      version: "V80 FINAL SEGURA",
    });
  }

  // Estado de sesión público para poder mostrar el formulario de acceso.
  if (event.httpMethod === "GET" && action === "auth_status") {
    const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie || "");
    const authenticated = backendConfigured && securityConfigured && verifySession(cookies[COOKIE_NAME], token);
    return json(200, { ok: true, authenticated, configured: backendConfigured, securityConfigured, version: "V80 FINAL SEGURA" });
  }

  // Inicio de sesión. El PIN solo vive en las variables de entorno de Netlify.
  if (event.httpMethod === "POST" && action === "login") {
    if (!backendConfigured) return json(503, { ok: false, error: "Faltan BODEGA_APPS_SCRIPT_URL o BODEGA_API_TOKEN en Netlify." });
    if (!securityConfigured) return json(503, { ok: false, error: "Configura BODEGA_ACCESS_PIN en Netlify con al menos 6 caracteres. V80 no abrirá la API con un PIN débil o vacío." });
    const pin = String(body.pin || "");
    if (!safeEqual(pin, accessPin)) return json(401, { ok: false, error: "PIN incorrecto." });
    const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    return json(200, { ok: true, authenticated: true, expiresAt: new Date(exp * 1000).toISOString() }, {
      "set-cookie": sessionCookie(signSession(exp, token)),
    });
  }

  if (event.httpMethod === "POST" && action === "logout") {
    return json(200, { ok: true, authenticated: false }, {
      "set-cookie": sessionCookie("", 0),
    });
  }

  if (!backendConfigured) {
    return json(503, { ok: false, error: "Faltan BODEGA_APPS_SCRIPT_URL o BODEGA_API_TOKEN en las variables de entorno de Netlify." });
  }
  if (!securityConfigured) {
    return json(503, { ok: false, securityRequired: true, error: "V80 FINAL SEGURA requiere BODEGA_ACCESS_PIN de al menos 6 caracteres en Netlify." });
  }

  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie || "");
  if (!verifySession(cookies[COOKIE_NAME], token)) {
    return json(401, { ok: false, authRequired: true, error: "Sesión vencida o no iniciada. Ingresa el PIN de Mi Bodega." });
  }

  try {
    if (event.httpMethod === "GET") {
      const u = new URL(scriptUrl);
      Object.entries(q).forEach(([k, v]) => {
        if (v != null && k !== "token" && k !== "callback") u.searchParams.set(k, String(v));
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
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
        body: text,
      };
    }

    if (event.httpMethod === "POST") {
      const forwarded = { ...body, token };
      delete forwarded.pin;
      const response = await fetch(scriptUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify(forwarded),
        signal: AbortSignal.timeout(25000),
      });
      const text = await response.text();
      return {
        statusCode: response.ok ? 200 : 502,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
        body: text,
      };
    }

    return json(405, { ok: false, error: "Método no permitido." });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};
