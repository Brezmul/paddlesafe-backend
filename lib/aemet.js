const AREA_POR_CODIGO = {
  "ES-AN": ["61", "Andalucía"],
  "ES-AR": ["62", "Aragón"],
  "ES-AS": ["63", "Asturias"],
  "ES-IB": ["64", "Illes Balears"],
  "ES-CN": ["65", "Canarias"],
  "ES-CB": ["66", "Cantabria"],
  "ES-CL": ["67", "Castilla y León"],
  "ES-CM": ["68", "Castilla-La Mancha"],
  "ES-CT": ["69", "Cataluña"],
  "ES-EX": ["70", "Extremadura"],
  "ES-GA": ["71", "Galicia"],
  "ES-MD": ["72", "Comunidad de Madrid"],
  "ES-MC": ["73", "Región de Murcia"],
  "ES-NC": ["74", "Navarra"],
  "ES-PV": ["75", "País Vasco"],
  "ES-RI": ["76", "La Rioja"],
  "ES-VC": ["77", "Comunitat Valenciana"],
  "ES-CE": ["78", "Ceuta"],
  "ES-ML": ["79", "Melilla"]
};

const AREA_POR_NOMBRE = new Map([
  ["andalucia", ["61", "Andalucía"]],
  ["aragon", ["62", "Aragón"]],
  ["asturias", ["63", "Asturias"]],
  ["principado de asturias", ["63", "Asturias"]],
  ["illes balears", ["64", "Illes Balears"]],
  ["islas baleares", ["64", "Illes Balears"]],
  ["balearic islands", ["64", "Illes Balears"]],
  ["canarias", ["65", "Canarias"]],
  ["canary islands", ["65", "Canarias"]],
  ["cantabria", ["66", "Cantabria"]],
  ["castilla y leon", ["67", "Castilla y León"]],
  ["castile and leon", ["67", "Castilla y León"]],
  ["castilla la mancha", ["68", "Castilla-La Mancha"]],
  ["castile la mancha", ["68", "Castilla-La Mancha"]],
  ["cataluna", ["69", "Cataluña"]],
  ["catalunya", ["69", "Cataluña"]],
  ["catalonia", ["69", "Cataluña"]],
  ["extremadura", ["70", "Extremadura"]],
  ["galicia", ["71", "Galicia"]],
  ["comunidad de madrid", ["72", "Comunidad de Madrid"]],
  ["madrid", ["72", "Comunidad de Madrid"]],
  ["region de murcia", ["73", "Región de Murcia"]],
  ["murcia", ["73", "Región de Murcia"]],
  ["comunidad foral de navarra", ["74", "Navarra"]],
  ["navarra", ["74", "Navarra"]],
  ["pais vasco", ["75", "País Vasco"]],
  ["euskadi", ["75", "País Vasco"]],
  ["basque country", ["75", "País Vasco"]],
  ["la rioja", ["76", "La Rioja"]],
  ["comunitat valenciana", ["77", "Comunitat Valenciana"]],
  ["comunidad valenciana", ["77", "Comunitat Valenciana"]],
  ["valencian community", ["77", "Comunitat Valenciana"]],
  ["ceuta", ["78", "Ceuta"]],
  ["melilla", ["79", "Melilla"]]
]);

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1200;
const MAX_FEED_AGE_MS = 36 * 60 * 60 * 1000;

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function resolverAreaAemet(stateCode, stateName) {
  const codigo = String(stateCode || "").trim().toUpperCase();
  if (Object.hasOwn(AREA_POR_CODIGO, codigo)) {
    const [area, nombre] = AREA_POR_CODIGO[codigo];
    return { codigo: area, nombre };
  }

  const nombre = normalizarTexto(stateName);
  const area = AREA_POR_NOMBRE.get(nombre);
  return area ? { codigo: area[0], nombre: area[1] } : null;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function xmlTagValues(xml, tag) {
  const expression = new RegExp(
    `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}\\s*>`,
    "gi"
  );
  return [...xml.matchAll(expression)].map(match => decodeXml(match[1]));
}

function xmlBlocks(xml, tag) {
  const expression = new RegExp(
    `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}\\s*>`,
    "gi"
  );
  return [...xml.matchAll(expression)].map(match => match[1]);
}

function nivelAemet(severity) {
  const valor = normalizarTexto(severity);
  if (/\b(extreme|roj[oa]|red)\b/.test(valor)) return "ROJA";
  if (/\b(severe|naranja|orange)\b/.test(valor)) return "NARANJA";
  if (/\b(moderate|minor|amarill[oa]|yellow)\b/.test(valor)) return "AMARILLA";
  return "NARANJA";
}

function dentroVentana(alerta, ventana) {
  if (!ventana) return true;
  const inicio = Date.parse(alerta.onset || alerta.effective || "");
  const fin = Date.parse(alerta.expires || "");
  if (!Number.isFinite(inicio) && !Number.isFinite(fin)) return true;
  return (!Number.isFinite(inicio) || inicio <= ventana.fin)
    && (!Number.isFinite(fin) || fin >= ventana.inicio);
}

function convertirRegistroCAP({ evento, severidad, descripcion, onset, effective, expires, area }, ventana, region) {
  const texto = evento || descripcion || "Aviso meteorológico";
  const areaEtiqueta = area || region.nombre;
  const descripcionRegional = `${texto} — ${areaEtiqueta} (ámbito regional)`;
  const alerta = {
    tipo: descripcionRegional,
    event: texto,
    descripcion: descripcionRegional,
    severity: severidad || "Unknown",
    nivel: nivelAemet(severidad),
    origen: "AEMET",
    area: areaEtiqueta,
    areaScope: "regional",
    onset: onset || null,
    effective: effective || null,
    expires: expires || null
  };
  return dentroVentana(alerta, ventana) ? alerta : null;
}

function parsearXmlCap(xml, ventana, region) {
  const alertas = [];
  const bloques = xmlBlocks(xml, "alert");
  if (!bloques.length) return null;

  const infos = bloques.flatMap(bloque => xmlBlocks(bloque, "info"));
  if (!infos.length) return null;

  infos.forEach(info => {
    const areas = xmlBlocks(info, "area");
    const area = areas.map(item => xmlTagValues(item, "areaDesc")[0]).find(Boolean);
    const alerta = convertirRegistroCAP({
      evento: xmlTagValues(info, "event")[0],
      severidad: xmlTagValues(info, "severity")[0],
      descripcion: xmlTagValues(info, "description")[0],
      onset: xmlTagValues(info, "onset")[0],
      effective: xmlTagValues(info, "effective")[0],
      expires: xmlTagValues(info, "expires")[0],
      area
    }, ventana, region);
    if (alerta) alertas.push(alerta);
  });

  return alertas;
}

function parsearJsonCap(payload, ventana, region) {
  const coleccion = Array.isArray(payload) ? payload
    : payload && typeof payload === "object"
      ? payload.alerts ?? payload.alertas ?? payload.avisos ?? payload.features
      : null;
  if (!Array.isArray(coleccion)) return null;

  const alertas = [];
  coleccion.forEach(item => {
    if (!item || typeof item !== "object") return;
    const datos = item.properties && typeof item.properties === "object" ? item.properties : item;
    const alerta = convertirRegistroCAP({
      evento: datos.event ?? datos.eventName ?? datos.event_name ?? datos.tipo ?? datos.title,
      severidad: datos.severity ?? datos.severidad ?? datos.level ?? datos.nivel,
      descripcion: datos.description ?? datos.descripcion ?? datos.headline,
      onset: datos.onset ?? datos.start ?? datos.effective,
      effective: datos.effective,
      expires: datos.expires ?? datos.expiration,
      area: datos.areaDesc ?? datos.area ?? datos.region
    }, ventana, region);
    if (alerta) alertas.push(alerta);
  });

  return alertas;
}

export function parsearPayloadAemet(body, contentType, ventana, region) {
  if (typeof body !== "string") return null;
  const texto = body.trim();
  if (!texto) return null;

  if (/json/i.test(contentType) || /^[{\[]/.test(texto)) {
    try {
      return parsearJsonCap(JSON.parse(texto), ventana, region);
    } catch {
      return null;
    }
  }
  return parsearXmlCap(texto, ventana, region);
}

function parsearFechaAemet(hora, fecha, offset) {
  const [dia, mes, anio] = fecha.split("-").map(Number);
  const [horas, minutos] = hora.split(":").map(Number);
  const zona = /^([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset);
  if (!zona || dia < 1 || mes < 1 || mes > 12 || horas > 23 || minutos > 59) return null;

  const desplazamientoMinutos = (Number(zona[2]) * 60 + Number(zona[3] || 0))
    * (zona[1] === "+" ? 1 : -1);
  const timestamp = Date.UTC(anio, mes - 1, dia, horas, minutos)
    - desplazamientoMinutos * 60 * 1000;
  const comprobacion = new Date(timestamp + desplazamientoMinutos * 60 * 1000);
  if (comprobacion.getUTCFullYear() !== anio
    || comprobacion.getUTCMonth() !== mes - 1
    || comprobacion.getUTCDate() !== dia) return null;
  return timestamp;
}

function leerVigenciaRssAemet(descripcion) {
  const coincidencia = /(\d{1,2}:\d{2})\s+(\d{1,2}-\d{1,2}-\d{4})\s+(?:[A-Z]{2,5}\s+)?\(UTC([+-]\d{1,2}(?::\d{2})?)\)\s+a\s+(\d{1,2}:\d{2})\s+(\d{1,2}-\d{1,2}-\d{4})\s+(?:[A-Z]{2,5}\s+)?\(UTC([+-]\d{1,2}(?::\d{2})?)\)/i
    .exec(descripcion);
  if (!coincidencia) return { onset: null, expires: null };
  return {
    onset: parsearFechaAemet(coincidencia[1], coincidencia[2], coincidencia[3]),
    expires: parsearFechaAemet(coincidencia[4], coincidencia[5], coincidencia[6])
  };
}

function parsearRssAemet(xml, ventana, region) {
  if (typeof xml !== "string" || !/<rss\b/i.test(xml)) return null;
  const canal = xmlBlocks(xml, "channel")[0];
  if (!canal) return null;
  const tituloCanal = xmlTagValues(canal, "title")[0] || "";
  if (!/aemet/i.test(tituloCanal) || !/avisos/i.test(tituloCanal)) return null;

  const actualizadoTexto = xmlTagValues(canal, "lastBuildDate")[0]
    || xmlTagValues(canal, "pubDate")[0];
  const actualizado = Date.parse(actualizadoTexto || "");
  if (!Number.isFinite(actualizado)
    || Date.now() - actualizado > MAX_FEED_AGE_MS
    || actualizado - Date.now() > 60 * 60 * 1000) {
    throw new Error("El feed público de avisos AEMET está desactualizado o no indica su fecha.");
  }

  const alertas = [];
  xmlBlocks(canal, "item").forEach(item => {
    const titulo = xmlTagValues(item, "title")[0] || "";
    const descripcion = xmlTagValues(item, "description")[0] || "";
    if (!titulo || /^estado completo de avisos\b/i.test(titulo)) return;

    const vigencia = leerVigenciaRssAemet(descripcion);
    const registro = {
      tipo: `${titulo} — ${descripcion} (${region.nombre}, ámbito regional)`,
      event: titulo,
      descripcion: `${titulo} — ${descripcion} (${region.nombre}, ámbito regional)`,
      severity: (titulo.match(/nivel\s+(amarillo|naranja|rojo|yellow|orange|red)/i) || [])[1] || "Unknown",
      nivel: nivelAemet(titulo),
      origen: "AEMET",
      area: region.nombre,
      areaScope: "regional",
      onset: vigencia.onset === null ? null : new Date(vigencia.onset).toISOString(),
      effective: null,
      expires: vigencia.expires === null ? null : new Date(vigencia.expires).toISOString(),
      sourceUrl: xmlTagValues(item, "link")[0] || null
    };
    if (dentroVentana(registro, ventana)) alertas.push(registro);
  });

  return { alertas, actualizado: new Date(actualizado).toISOString() };
}

export async function obtenerAvisosAemet({ area }) {
  if (!area?.codigo) {
    console.warn("[AEMET] No se pudo determinar la comunidad autónoma; avisos no disponibles.");
    return { disponible: false, alertas: [], error: "Área regional no verificable" };
  }

  const cacheKey = area.codigo;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.value;

  try {
    if (!/^\d{2}$/.test(String(area.codigo))) throw new Error("El código regional AEMET no es válido.");
    const rssUrl = `https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC${area.codigo}_RSS.xml`;
    const response = await fetch(rssUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": "PaddleSafe public weather alerts"
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`El feed público de avisos AEMET respondió HTTP ${response.status}.`);

    const parsed = parsearRssAemet(await response.text(), null, area);
    if (!parsed) throw new Error("El feed público de avisos AEMET no tiene el formato RSS esperado.");

    const value = {
      disponible: true,
      alertas: parsed.alertas,
      area: area.nombre,
      areaScope: "regional",
      actualizado: parsed.actualizado,
      sourceUrl: rssUrl
    };
    cache.set(cacheKey, { timestamp: Date.now(), value });
    return value;
  } catch (error) {
    console.warn("[AEMET] No se pudieron recuperar avisos oficiales.", error);
    return {
      disponible: false,
      alertas: [],
      area: area.nombre,
      error: error instanceof Error ? error.message : "Error desconocido"
    };
  }
}

export function filtrarAvisosAemet(alertas, ventana) {
  return Array.isArray(alertas)
    ? alertas.filter(alerta => dentroVentana(alerta, ventana))
    : [];
}
