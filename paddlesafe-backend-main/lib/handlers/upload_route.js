const MAX_ROUTE_POINTS = 20000;
const MAX_ROUTE_JSON_BYTES = 1_000_000;
const MAX_ROUTE_DISTANCE_KM = 2000;
const MAX_ROUTE_DURATION_MINUTES = 10080;
const SUPABASE_TIMEOUT_MS = 3500;

function validateRoute(body, supabaseOrigin) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El cuerpo debe ser un objeto JSON." };
  }

  const { distancia_km, tiempo_minutos, ruta_json, imagen_url, ubicacion } = body;
  if (!Number.isFinite(distancia_km) || distancia_km < 0 || distancia_km > MAX_ROUTE_DISTANCE_KM) {
    return { error: "distancia_km debe ser un número entre 0 y 2000." };
  }
  if (!Number.isInteger(tiempo_minutos) || tiempo_minutos < 0 || tiempo_minutos > MAX_ROUTE_DURATION_MINUTES) {
    return { error: "tiempo_minutos debe ser un entero entre 0 y 10080." };
  }
  if (!Array.isArray(ruta_json) || ruta_json.length < 2 || ruta_json.length > MAX_ROUTE_POINTS) {
    return { error: `ruta_json debe contener entre 2 y ${MAX_ROUTE_POINTS} puntos.` };
  }

  const hasInvalidPoint = ruta_json.some((point) =>
    !Array.isArray(point) ||
    point.length !== 2 ||
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    point[0] < -90 ||
    point[0] > 90 ||
    point[1] < -180 ||
    point[1] > 180
  );
  if (hasInvalidPoint) {
    return { error: "Cada punto debe ser un par [latitud, longitud] dentro de rango." };
  }

  if (typeof ubicacion !== "string" || !ubicacion.trim() || ubicacion.length > 160) {
    return { error: "ubicacion debe ser un texto de entre 1 y 160 caracteres." };
  }

  let validatedImageUrl = null;
  if (imagen_url !== undefined && imagen_url !== null) {
    if (typeof imagen_url !== "string" || imagen_url.length > 2048) {
      return { error: "imagen_url debe ser una URL pública de Storage o null." };
    }
    try {
      const imageUrl = new URL(imagen_url);
      if (
        imageUrl.protocol !== "https:" ||
        imageUrl.origin !== supabaseOrigin ||
        !imageUrl.pathname.startsWith("/storage/v1/object/public/paddlesafe/")
      ) {
        return { error: "imagen_url debe apuntar al bucket público paddlesafe del proyecto." };
      }
      validatedImageUrl = imageUrl.href;
    } catch {
      return { error: "imagen_url no es una URL válida." };
    }
  }

  const serializedRoute = JSON.stringify(ruta_json);
  if (new TextEncoder().encode(serializedRoute).byteLength > MAX_ROUTE_JSON_BYTES) {
    return { error: "La ruta supera el tamaño máximo permitido." };
  }

  return {
    route: {
      distancia_km,
      tiempo_minutos,
      ruta_json,
      imagen_url: validatedImageUrl,
      ubicacion: ubicacion.trim()
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authorization = req.headers.authorization;
  const tokenMatch = typeof authorization === "string"
    ? /^Bearer\s+(\S+)$/i.exec(authorization)
    : null;
  if (!tokenMatch) {
    return res.status(401).json({ ok: false, error: "Se requiere autenticación." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    return res.status(503).json({
      ok: false,
      error: "El endpoint de rutas no está configurado en el backend."
    });
  }

  let supabaseOrigin;
  try {
    const projectUrl = new URL(supabaseUrl);
    if (projectUrl.protocol !== "https:" || projectUrl.pathname !== "/") {
      throw new Error("Invalid Supabase project URL");
    }
    supabaseOrigin = projectUrl.origin;
  } catch {
    return res.status(503).json({ ok: false, error: "La configuración de Supabase no es válida." });
  }

  const validated = validateRoute(req.body, supabaseOrigin);
  if (validated.error) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  const headers = {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${tokenMatch[1]}`
  };

  try {
    const authResponse = await fetch(`${supabaseOrigin}/auth/v1/user`, {
      headers,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    });
    if (!authResponse.ok) {
      const status = authResponse.status === 401 || authResponse.status === 403 ? 401 : 502;
      return res.status(status).json({
        ok: false,
        error: status === 401 ? "La sesión no es válida." : "No se pudo verificar la sesión."
      });
    }

    const user = await authResponse.json();
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: "La sesión no contiene un usuario válido." });
    }

    const insertResponse = await fetch(`${supabaseOrigin}/rest/v1/rutas`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify([{
        ...validated.route,
        user_id: user.id
      }]),
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    });

    if (!insertResponse.ok) {
      console.error("[upload_route] Supabase insert failed with status", insertResponse.status);
      if (insertResponse.status === 401 || insertResponse.status === 403) {
        return res.status(403).json({ ok: false, error: "No tienes permiso para guardar esta ruta." });
      }
      return res.status(502).json({ ok: false, error: "Supabase no pudo guardar la ruta." });
    }

    const rows = await insertResponse.json();
    if (!Array.isArray(rows) || !rows[0]) {
      console.error("[upload_route] Supabase insert returned no route row");
      return res.status(502).json({ ok: false, error: "Supabase no confirmó la ruta guardada." });
    }

    return res.status(201).json({ ok: true, route: rows[0] });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[upload_route] Supabase request failed:", error?.message || "unknown error");
    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? "Supabase tardó demasiado en responder." : "No se pudo guardar la ruta."
    });
  }
}
