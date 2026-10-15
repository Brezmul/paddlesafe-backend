// ==============================================================================
// PADDLESAFE BACKEND - INGESTOR OFICIAL DE ALERTAS AEMET Y 112 CV (aemet.js)
// Consulta avisos meteorológicos y marítimos oficiales georreferenciados para España
// e integra Avisos Especiales de Protección Civil y Emergencias (112 CV / Generalitat).
// ==============================================================================

const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de caché

// Catálogo de sectores litorales y provincias para España con alias oficiales de avisos costeros
const ZONAS_ESPANA = [
  { nombre: "Alicante", alias: /alicante|alacant|litoral.*alicante|mar.*alicante/i, latMin: 37.8, latMax: 38.9, lonMin: -1.0, lonMax: 0.3 },
  { nombre: "Valencia", alias: /valencia|valència|litoral.*valencia|mar.*valencia/i, latMin: 38.8, latMax: 40.1, lonMin: -1.5, lonMax: 0.1 },
  { nombre: "Castellón", alias: /castellon|castelló|litoral.*castellon|mar.*castellon/i, latMin: 39.8, latMax: 40.8, lonMin: -0.8, lonMax: 0.6 },
  { nombre: "Murcia", alias: /murcia|cartagena|mazarron|mazarrón|aguilas|águilas|guadalentin|mar menor/i, latMin: 37.3, latMax: 38.8, lonMin: -2.3, lonMax: -0.6 },
  { nombre: "Almería", alias: /almeria|almería|poniente.*almeria|levante.*almeriense|tabernas|cabo de gata/i, latMin: 36.6, latMax: 37.7, lonMin: -3.1, lonMax: -1.6 },
  { nombre: "Granada", alias: /granada|granadina|motril|almuñecar|almuñécar|alpujarra/i, latMin: 36.6, latMax: 37.5, lonMin: -4.0, lonMax: -3.0 },
  { nombre: "Málaga", alias: /malaga|málaga|costa del sol|axarquia|axarquía|marbella|nerja/i, latMin: 36.4, latMax: 37.1, lonMin: -5.4, lonMax: -3.7 },
  { nombre: "Cádiz", alias: /cadiz|cádiz|gaditano|estrecho|tarifa|algeciras|guadalquivir/i, latMin: 36.0, latMax: 37.0, lonMin: -6.5, lonMax: -5.1 },
  { nombre: "Huelva", alias: /huelva|litoral.*onubense|ayamonte|mazagon|mazagón/i, latMin: 36.9, latMax: 38.2, lonMin: -7.5, lonMax: -6.3 },
  { nombre: "Baleares", alias: /baleares|balears|mallorca|menorca|ibiza|eivissa|formentera|tramuntana/i, latMin: 38.5, latMax: 40.3, lonMin: 1.1, lonMax: 4.4 },
  { nombre: "Barcelona", alias: /barcelona|litoral.*barcelona|maresme|baix llobregat/i, latMin: 41.1, latMax: 42.0, lonMin: 1.5, lonMax: 2.8 },
  { nombre: "Tarragona", alias: /tarragona|litoral.*tarragona|delta.*ebre|ebro/i, latMin: 40.5, latMax: 41.6, lonMin: 0.1, lonMax: 1.6 },
  { nombre: "Girona", alias: /girona|gerona|costa brava|ampurdan|emporda|empordà/i, latMin: 41.6, latMax: 42.5, lonMin: 2.4, lonMax: 3.3 },
  { nombre: "Cantabria", alias: /cantabria|litoral.*cantabrico|cantábrico|santander/i, latMin: 42.8, latMax: 43.6, lonMin: -4.8, lonMax: -3.1 },
  { nombre: "Asturias", alias: /asturias|asturiano|gijon|gijón|oviedo|aviles|avilés/i, latMin: 42.9, latMax: 43.7, lonMin: -7.2, lonMax: -4.5 },
  { nombre: "Pontevedra", alias: /pontevedra|rias baixas|rías baixas|vigo|miño/i, latMin: 41.8, latMax: 42.8, lonMin: -9.0, lonMax: -7.9 },
  { nombre: "A Coruña", alias: /coruña|coruna|costa da morte|artabra|ártabra/i, latMin: 42.5, latMax: 43.8, lonMin: -9.3, lonMax: -7.8 },
  { nombre: "Lugo", alias: /lugo|a mariña|mariña lucense/i, latMin: 42.3, latMax: 43.8, lonMin: -7.9, lonMax: -6.9 },
  { nombre: "Bizkaia", alias: /bizkaia|vizcaya/i, latMin: 43.0, latMax: 43.5, lonMin: -3.4, lonMax: -2.4 },
  { nombre: "Gipuzkoa", alias: /gipuzkoa|guipuzcoa|guipúzcoa/i, latMin: 42.9, latMax: 43.4, lonMin: -2.6, lonMax: -1.7 },
  { nombre: "Canarias", alias: /canarias|tenerife|gran canaria|lanzarote|fuerteventura|la palma|la gomera|el hierro/i, latMin: 27.5, latMax: 29.5, lonMin: -18.2, lonMax: -13.3 }
];

function obtenerZonaAproximada(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return ZONAS_ESPANA.find(z => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax);
}

function parsearAlertasAtomMeteoalarm(xmlString, zona = null) {
  const alertas = [];
  try {
    const entryMatches = xmlString.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    const zonaRegex = zona?.alias || (zona?.nombre ? new RegExp(zona.nombre, "i") : null);

    for (const entry of entryMatches) {
      const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(entry);
      const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(entry);
      const capAreaMatch = /<cap:areaDesc>([\s\S]*?)<\/cap:areaDesc>/i.exec(entry);
      const capSeverityMatch = /<cap:severity>([\s\S]*?)<\/cap:severity>/i.exec(entry);
      const capEventMatch = /<cap:event>([\s\S]*?)<\/cap:event>/i.exec(entry);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
      const summary = summaryMatch ? summaryMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
      const area = capAreaMatch ? capAreaMatch[1].trim() : "";
      const severity = capSeverityMatch ? capSeverityMatch[1].trim().toUpperCase() : "";
      const event = capEventMatch ? capEventMatch[1].trim() : "";

      // Filtrar por la zona si se identificó provincia o alias
      if (zonaRegex && area && !zonaRegex.test(area) && !zonaRegex.test(title)) {
        continue;
      }

      let nivel = "AMARILLA";
      if (/red|roja|extreme/i.test(severity) || /rojo|roja/i.test(title)) nivel = "ROJA";
      else if (/orange|naranja|severe/i.test(severity) || /naranja/i.test(title)) nivel = "NARANJA";
      else if (/yellow|amarill/i.test(severity) || /amarill/i.test(title)) nivel = "AMARILLA";

      alertas.push({
        origen: "AEMET",
        tipo: event || title || "Aviso costero o meteorológico",
        nivel,
        descripcion: summary || title,
        zona: area || zona?.nombre || "Costa de España"
      });
    }
  } catch (e) {
    console.warn("[AEMET Ingestor] Error parseando XML:", e.message);
  }
  return alertas;
}

/**
 * Consulta Avisos Especiales de Protección Civil y Emergencias 112 Comunitat Valenciana
 */
async function consultarAvisos112CV() {
  try {
    const resp = await fetch("https://www.112cv.gva.es/es/inicio", { signal: AbortSignal.timeout(3500) });
    if (!resp.ok) return [];
    const html = await resp.text();
    const avisos112 = [];

    const linkRegex = /<a[^>]*href="([^"]*EGEN[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1].startsWith("http") ? match[1] : `https://www.112cv.gva.es${match[1]}`;
      const texto = match[2].replace(/<[^>]+>/g, "").replace(/[⚠\s]+/g, " ").trim();
      avisos112.push({
        origen: "112 CV",
        tipo: "Aviso Especial Protección Civil (112 CV)",
        nivel: "NARANJA",
        descripcion: `${texto} - Emergencias Generalitat Valenciana (112 CV). Riesgo de precipitaciones intensas y avenidas súbitas en ramblas y desembocaduras hacia el litoral marítimo.`,
        zona: "Comunitat Valenciana (Litoral)",
        urlDoc: url,
        esEspecial: true
      });
    }
    return avisos112;
  } catch (err) {
    console.warn("[AEMET/112CV] Aviso no crítico consultando 112cv.gva.es:", err.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");

  if (req.method === "OPTIONS") return res.status(200).end();

  const lat = parseFloat(req.query?.lat ?? req.body?.lat ?? req.body?.coordenadas?.lat ?? req.body?.coordinates?.latitude);
  const lon = parseFloat(req.query?.lon ?? req.body?.lon ?? req.body?.coordenadas?.lng ?? req.body?.coordinates?.longitude);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ ok: false, error: "Parámetros lat y lon obligatorios" });
  }

  // Comprobar si está en ámbito geográfico de España
  const enEspana = (lat >= 27.0 && lat <= 44.2 && lon >= -18.5 && lon <= 4.8);
  if (!enEspana) {
    return res.status(200).json({
      ok: true,
      disponible: false,
      enEspana: false,
      alertas: [],
      mensaje: "Ubicación fuera del ámbito de AEMET (España)"
    });
  }

  const zona = obtenerZonaAproximada(lat, lon);
  const esComunitatValenciana = (lat >= 37.8 && lat <= 40.8 && lon >= -1.5 && lon <= 0.6);
  const cacheKey = `aemet-${zona ? zona.nombre : `${lat.toFixed(1)}_${lon.toFixed(1)}`}`;
  const cached = cache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return res.status(200).json({ ok: true, cached: true, ...cached.data });
  }

  const apiKey = process.env.AEMET_API_KEY || "";
  let alertas = [];

  try {
    if (apiKey) {
      // 1. AEMET OpenData oficial con API Key
      const aemetUrl = `https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/esp?api_key=${apiKey}`;
      const respAemet = await fetch(aemetUrl, { signal: AbortSignal.timeout(4000) });
      if (respAemet.ok) {
        const meta = await respAemet.json();
        if (meta.datos) {
          const respDatos = await fetch(meta.datos, { signal: AbortSignal.timeout(4000) });
          if (respDatos.ok) {
            const rawCap = await respDatos.text();
            alertas = parsearAlertasAtomMeteoalarm(rawCap, zona);
          }
        }
      }
    }

    // 2. Feed oficial abierto Meteoalarm para España (respaldo sin API key)
    if (alertas.length === 0) {
      const feedUrl = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain";
      const respFeed = await fetch(feedUrl, { signal: AbortSignal.timeout(4000) });
      if (respFeed.ok) {
        const atomXml = await respFeed.text();
        alertas = parsearAlertasAtomMeteoalarm(atomXml, zona);
      }
    }

    // 3. Ingestión de Avisos Especiales de Protección Civil (112 CV) para el litoral de la Comunitat Valenciana
    if (esComunitatValenciana) {
      const avisos112 = await consultarAvisos112CV();
      if (avisos112.length > 0) {
        alertas = [...avisos112, ...alertas];
      }
    }

    const responseData = {
      ok: true,
      disponible: true,
      enEspana: true,
      zonaDetectada: zona?.nombre || "Litoral de España",
      alertas
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: responseData });
    return res.status(200).json(responseData);
  } catch (err) {
    console.warn("Aviso no crítico AEMET:", err.message);
    return res.status(200).json({
      ok: true,
      disponible: false,
      enEspana: true,
      alertas: [],
      mensaje: "AEMET no disponible temporalmente"
    });
  }
}
