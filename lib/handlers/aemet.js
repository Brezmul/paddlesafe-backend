// ==============================================================================
// PADDLESAFE BACKEND - SISTEMA NACIONAL DE EMERGENCIAS 112 & AEMET (aemet.js)
// Ingestor oficial de avisos meteorológicos, marítimos y de protección civil
// para todas las Comunidades Autónomas de España y nivel estatal.
// ==============================================================================

import zlib from "zlib";

const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de caché

// Catálogo Nacional de Autoridades de Protección Civil y Emergencias 112 por Comunidad Autónoma
export const AUTORIDADES_112 = {
  ANDALUCIA: {
    id: "ANDALUCIA",
    nombre: "112 Andalucía",
    organismo: "Servicio de Emergencias 112 Andalucía / Protección Civil (Junta de Andalucía)",
    plan: "Plan Territorial de Emergencias de Andalucía (PTEAnd)",
    portal: "https://www.juntadeandalucia.es/temas/seguridad/emergencias-112.html",
    urlDoc: "https://www.juntadeandalucia.es/organismos/presidenciainteriordialogosocialysimplificacionadministrativa/areas/emergencias-112.html",
    telefono: "112",
    canal: "@E112Andalucia",
    peligroNautico: "Oleaje atlántico/mediterráneo, corrientes de resaca e intensificación de viento por efecto canal en el Estrecho y costa andaluza."
  },
  CATALUNYA: {
    id: "CATALUNYA",
    nombre: "112 Catalunya (Protecció Civil)",
    organismo: "Direcció General de Protecció Civil (Generalitat de Catalunya)",
    plan: "Plans Especials INUNCAT / VENTCAT / CAMCAT",
    portal: "https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/",
    urlDoc: "https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/estat_dels_plans/index.html",
    telefono: "112",
    canal: "@emergenciescat",
    peligroNautico: "Viento de Tramuntana/Mestral terral violento en Costa Brava y desembocaduras torrenciales en el litoral central y delta del Ebro."
  },
  VALENCIA: {
    id: "VALENCIA",
    nombre: "112 Comunitat Valenciana",
    organismo: "Agència Valenciana de Seguretat i Resposta a les Emergències (AVSRE / 112 CV)",
    plan: "Plan Especial de Inundaciones y Temporal Costero (Generalitat Valenciana)",
    portal: "https://www.112cv.gva.es/es/inicio",
    urlDoc: "https://www.112cv.gva.es/es/inicio",
    telefono: "112",
    canal: "@GVA112",
    peligroNautico: "Avenidas súbitas en ramblas y cauces secos que desaguan en la playa, generando corrientes de arrastre violentas hacia mar abierto y aguas turbias."
  },
  GALICIA: {
    id: "GALICIA",
    nombre: "112 Galicia (AXEGA)",
    organismo: "Axencia Galega de Emerxencias (Xunta de Galicia)",
    plan: "Plan Especial de Protección Civil ante o Risco de Inundacións e Temporais Costeiros",
    portal: "https://axega112.gal",
    urlDoc: "https://axega112.gal/es/avisos",
    telefono: "112",
    canal: "@112Galicia",
    peligroNautico: "Mar de fondo atlántico violento, rompientes masivas en bajos costeros y fuertes corrientes de marea en bocanas de rías."
  },
  BALEARS: {
    id: "BALEARS",
    nombre: "112 Illes Balears (SEIB 112)",
    organismo: "Direcció General d'Emergències i Interior (Govern de les Illes Balears)",
    plan: "Pla Especial METEOBAL / INUNBAL",
    portal: "https://112ib.caib.es",
    urlDoc: "https://112ib.caib.es",
    telefono: "112",
    canal: "@112IllesBalears",
    peligroNautico: "Rissagas (oscilaciones súbitas del nivel del mar), vientos cambiantes de tramuntana y oleaje cruzado en calas abiertas."
  },
  CANARIAS: {
    id: "CANARIAS",
    nombre: "1-1-2 Canarias (CECOES)",
    organismo: "Dirección General de Emergencias (Gobierno de Canarias)",
    plan: "Plan Específico de Emergencias de Canarias por Fenómenos Meteorológicos Adversos (PEFMA)",
    portal: "https://www.gobiernodecanarias.org/administracionpublica/seguridadyemergencias/avisos/",
    urlDoc: "https://www.gobiernodecanarias.org/administracionpublica/seguridadyemergencias/",
    telefono: "1-1-2",
    canal: "@112canarias",
    peligroNautico: "Oleaje oceánico profundo, mar de fondo del norte, corrientes de retorno y aceleración de alisios entre canales de islas."
  },
  MURCIA: {
    id: "MURCIA",
    nombre: "112 Región de Murcia",
    organismo: "Dirección General de Seguridad Ciudadana y Emergencias (CARM)",
    plan: "Plan Territorial de Protección Civil (PLATERMUR / INUNMUR)",
    portal: "https://112rmurcia.es",
    urlDoc: "https://112rmurcia.es",
    telefono: "112",
    canal: "@112rmurcia",
    peligroNautico: "Desagüe súbito de ramblas hacia el Mar Menor y costa abierta, rachas intensas de levante y rompiente en la orilla."
  },
  CANTABRIA: {
    id: "CANTABRIA",
    nombre: "112 Cantabria (SEMCA)",
    organismo: "Servicio de Emergencias de Cantabria (Gobierno de Cantabria)",
    plan: "Plan Territorial de Protección Civil de Cantabria (PLATERCANT)",
    portal: "https://112cantabria.es",
    urlDoc: "https://112cantabria.es",
    telefono: "112",
    canal: "@112Cantabria",
    peligroNautico: "Galernas súbitas con giro de viento a noroeste, fuerte mar de fondo cantábrico y corrientes de resaca intensas."
  },
  ASTURIAS: {
    id: "ASTURIAS",
    nombre: "112 Asturias (SEPA)",
    organismo: "Servicio de Emergencias del Principado de Asturias (SEPA)",
    plan: "Plan Territorial de Protección Civil del Principado de Asturias (PLATERPA)",
    portal: "https://www.112asturias.es",
    urlDoc: "https://www.112asturias.es",
    telefono: "112",
    canal: "@SEPAcomunica",
    peligroNautico: "Rompientes violentas en acantilados, mar tendida de gran periodo y riesgo de desbordamiento en estuarios y rías."
  },
  EUSKADI: {
    id: "EUSKADI",
    nombre: "112 SOS Deiak (Euskadi)",
    organismo: "Dirección de Atención de Emergencias y Meteorología (Gobierno Vasco)",
    plan: "Plan Especial de Emergencias por Fenómenos Meteorológicos Adversos (DAEM / Euskalmet)",
    portal: "https://www.euskadi.eus/sos-deiak/",
    urlDoc: "https://www.euskadi.eus/sos-deiak/",
    telefono: "112",
    canal: "@112_SOSDeiak",
    peligroNautico: "Galernas cantábricas de impacto fulgurante, grandes trenes de olas en bocanas de puertos y corrientes de retorno."
  },
  NACIONAL: {
    id: "NACIONAL",
    nombre: "DGPCE / AEMET Nacional",
    organismo: "Dirección General de Protección Civil y Emergencias y AEMET",
    plan: "Plan Estatal General de Emergencias (PLEGEM)",
    portal: "https://www.aemet.es/es/eltiempo/prediccion/avisos",
    urlDoc: "https://www.aemet.es/es/eltiempo/prediccion/avisos",
    telefono: "112",
    canal: "@ProteccionCivil",
    peligroNautico: "Condiciones marítimas y meteorológicas adversas. Evita navegar y atiende a las indicaciones oficiales de Protección Civil."
  }
};

// Catálogo de sectores litorales y provincias para España con alias oficiales de avisos costeros y CCAA
export const ZONAS_ESPANA = [
  { nombre: "Alicante", comunidadId: "VALENCIA", alias: /alicante|alacant|campello|santa pola|torrevieja|benidorm|altea|javea|xabia|xàbia|denia|dénia|moraira|calpe/i, latMin: 37.8, latMax: 38.9, lonMin: -1.0, lonMax: 0.3 },
  { nombre: "Valencia", comunidadId: "VALENCIA", alias: /valencia|valència|cullera|gandia|oliva|sagunto|saler/i, latMin: 38.8, latMax: 40.1, lonMin: -1.5, lonMax: 0.1 },
  { nombre: "Castellón", comunidadId: "VALENCIA", alias: /castellon|castelló|oropesa|benicassim|benicàssim|peñiscola|vinaros|vinaròs/i, latMin: 39.8, latMax: 40.8, lonMin: -0.8, lonMax: 0.6 },
  { nombre: "Murcia", comunidadId: "MURCIA", alias: /murcia|cartagena|mazarron|mazarrón|aguilas|águilas|la manga|mar menor|guadalentin/i, latMin: 37.3, latMax: 38.8, lonMin: -2.3, lonMax: -0.6 },
  { nombre: "Almería", comunidadId: "ANDALUCIA", alias: /almeria|almería|cabo de gata|roquetas|mojacar|mojájar|san jose|san josé|poniente.*almeria|levante.*almeriense|tabernas/i, latMin: 36.6, latMax: 37.7, lonMin: -3.1, lonMax: -1.6 },
  { nombre: "Granada", comunidadId: "ANDALUCIA", alias: /granada|granadina|costa tropical|motril|almuñecar|almuñécar|salobreña|alpujarra/i, latMin: 36.6, latMax: 37.5, lonMin: -4.0, lonMax: -3.0 },
  { nombre: "Málaga", comunidadId: "ANDALUCIA", alias: /malaga|málaga|costa del sol|marbella|fuengirola|torremolinos|estepona|nerja|axarquia|axarquía/i, latMin: 36.4, latMax: 37.1, lonMin: -5.4, lonMax: -3.7 },
  { nombre: "Cádiz", comunidadId: "ANDALUCIA", alias: /cadiz|cádiz|tarifa|barbate|conil|el palmar|roto|chiclana|algeciras|estrecho|gaditano/i, latMin: 36.0, latMax: 37.0, lonMin: -6.5, lonMax: -5.1 },
  { nombre: "Huelva", comunidadId: "ANDALUCIA", alias: /huelva|ayamonte|isla cristina|punta umbria|punta umbría|mazagon|mazagón|matalascañas|onubense/i, latMin: 36.9, latMax: 38.2, lonMin: -7.5, lonMax: -6.3 },
  { nombre: "Baleares", comunidadId: "BALEARS", alias: /baleares|balears|mallorca|menorca|ibiza|eivissa|formentera|palma|alcudia|alcúdia|tramuntana/i, latMin: 38.5, latMax: 40.3, lonMin: 1.1, lonMax: 4.4 },
  { nombre: "Barcelona", comunidadId: "CATALUNYA", alias: /barcelona|sitges|castelldefels|badalona|mataro|mataró|maresme|baix llobregat/i, latMin: 41.1, latMax: 42.0, lonMin: 1.5, lonMax: 2.8 },
  { nombre: "Tarragona", comunidadId: "CATALUNYA", alias: /tarragona|cambrils|salou|delta de l'ebre|delta del ebro|amposta/i, latMin: 40.5, latMax: 41.6, lonMin: 0.1, lonMax: 1.6 },
  { nombre: "Girona", comunidadId: "CATALUNYA", alias: /girona|gerona|costa brava|roses|cadaques|cadaqués|palamos|palamós|blanes|platja d'aro|emporda|empordà|ampurdan/i, latMin: 41.6, latMax: 42.5, lonMin: 2.4, lonMax: 3.3 },
  { nombre: "Cantabria", comunidadId: "CANTABRIA", alias: /cantabria|santander|somo|suances|liencres|laredo|castro urdiales|noja|cantabrico|cantábrico/i, latMin: 42.8, latMax: 43.6, lonMin: -4.8, lonMax: -3.1 },
  { nombre: "Asturias", comunidadId: "ASTURIAS", alias: /asturias|asturiano|gijon|gijón|oviedo|aviles|avilés|ribadesella|llanes|rodiles/i, latMin: 42.9, latMax: 43.7, lonMin: -7.2, lonMax: -4.5 },
  { nombre: "Pontevedra", comunidadId: "GALICIA", alias: /pontevedra|rias baixas|rías baixas|vigo|sanxenxo|cangas|baiona|miño/i, latMin: 41.8, latMax: 42.8, lonMin: -9.0, lonMax: -7.9 },
  { nombre: "A Coruña", comunidadId: "GALICIA", alias: /coruña|coruna|costa da morte|ferrol|rias altas|rías altas|oleiros|artabra|ártabra/i, latMin: 42.5, latMax: 43.8, lonMin: -9.3, lonMax: -7.8 },
  { nombre: "Lugo", comunidadId: "GALICIA", alias: /lugo|mariña|marina lucense|ribadeo|viveiro|foc/i, latMin: 42.3, latMax: 43.8, lonMin: -7.9, lonMax: -6.9 },
  { nombre: "Bizkaia", comunidadId: "EUSKADI", alias: /bizkaia|vizcaya|bilbao|sopelana|mundaka|plentzia|getxo/i, latMin: 43.0, latMax: 43.5, lonMin: -3.4, lonMax: -2.4 },
  { nombre: "Gipuzkoa", comunidadId: "EUSKADI", alias: /gipuzkoa|guipuzcoa|guipúzcoa|donostia|san sebastian|san sebastián|zarautz|hondarribia/i, latMin: 42.9, latMax: 43.4, lonMin: -2.6, lonMax: -1.7 },
  { nombre: "Canarias", comunidadId: "CANARIAS", alias: /canarias|tenerife|gran canaria|lanzarote|fuerteventura|corralejo|maspalomas|las palmas|la palma|la gomera|el hierro/i, latMin: 27.5, latMax: 29.5, lonMin: -18.2, lonMax: -13.3 }
];

export function obtenerZonaAproximada(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return ZONAS_ESPANA.find(z => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax);
}

export function obtenerAutoridadEmergencias(lat, lon, zona = null, locationText = "") {
  let matchedZona = zona || obtenerZonaAproximada(lat, lon);
  if (!matchedZona && locationText) {
    matchedZona = ZONAS_ESPANA.find(z => z.alias && z.alias.test(locationText));
  }
  if (matchedZona && AUTORIDADES_112[matchedZona.comunidadId]) {
    return { ...AUTORIDADES_112[matchedZona.comunidadId], zonaNombre: matchedZona.nombre };
  }
  if (locationText) {
    for (const [key, aut] of Object.entries(AUTORIDADES_112)) {
      if (new RegExp(aut.nombre.replace(/[\(\)]/g, ""), "i").test(locationText)) {
        return { ...aut, zonaNombre: aut.nombre };
      }
    }
  }
  return { ...AUTORIDADES_112.NACIONAL, zonaNombre: "Litoral de España" };
}

export function parsePdfStreamText(pdfBuffer) {
  let text = '';
  let streamStart = 0;
  while ((streamStart = pdfBuffer.indexOf(Buffer.from('stream'), streamStart)) !== -1) {
    streamStart += 6;
    if (pdfBuffer[streamStart] === 0x0d && pdfBuffer[streamStart + 1] === 0x0a) streamStart += 2;
    else if (pdfBuffer[streamStart] === 0x0a) streamStart += 1;

    const streamEnd = pdfBuffer.indexOf(Buffer.from('endstream'), streamStart);
    if (streamEnd === -1) break;

    const compressed = pdfBuffer.subarray(streamStart, streamEnd);
    try {
      const decompressed = zlib.inflateSync(compressed);
      const str = decompressed.toString('latin1');
      const matches = str.match(/\(([^)]+)\)\s*T[jJ]/g) || [];
      for (const m of matches) {
        text += m.replace(/^[(]|[\)]\s*T[jJ]$/g, '') + ' ';
      }
      const tjArr = str.match(/\[(.*?)\]\s*TJ/g) || [];
      for (const t of tjArr) {
        const sub = t.match(/\(([^)]*)\)/g) || [];
        for (const s of sub) {
          text += s.slice(1, -1);
        }
        text += ' ';
      }
    } catch (e) {}
    streamStart = streamEnd + 9;
  }
  return text.replace(/\\([()\\])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function interpretarTextoAlerta(texto, url = '') {
  let fechaEmision = null;
  let anio = 2026;
  let mes = 10;

  const emisionMatch = /FECHA:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*HORA:\s*([0-9\s:]+)/i.exec(texto);
  if (emisionMatch) {
    const dia = parseInt(emisionMatch[1], 10);
    mes = parseInt(emisionMatch[2], 10);
    anio = parseInt(emisionMatch[3], 10);
    if (anio < 100) anio += 2000;
    const horaParts = emisionMatch[4].replace(/\s+/g, '').split(':');
    const hh = parseInt(horaParts[0] || '12', 10);
    const mm = parseInt(horaParts[1] || '0', 10);
    fechaEmision = new Date(Date.UTC(anio, mes - 1, dia, hh, mm)).toISOString();
  }

  // Detectar inicio: "comience el sábado 17" o "a partir del sábado 17"
  const inicioRe = /(?:comienc[ea]|inici[ea]|a partir del?|desde el?|a contar del?)\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i;
  // Detectar fin: "durante el domingo 18" o "hasta el domingo 18"
  const finRe = /(?:durante|hasta|finaliz[ea]|termin[ea])\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i;

  const mIni = inicioRe.exec(texto);
  const mFin = finRe.exec(texto);

  let diaInicio = mIni ? parseInt(mIni[2], 10) : null;
  let nombreDiaInicio = mIni && mIni[1] ? mIni[1].toLowerCase() : '';

  let diaFin = mFin ? parseInt(mFin[2], 10) : null;
  let nombreDiaFin = mFin && mFin[1] ? mFin[1].toLowerCase() : '';

  if (!diaInicio && /fin de semana/i.test(texto)) {
    nombreDiaInicio = 'sábado';
    nombreDiaFin = 'domingo';
  }

  const pad = n => String(n).padStart(2, '0');
  let inicioISO = diaInicio ? `${anio}-${pad(mes)}-${pad(diaInicio)}T00:00:00` : (fechaEmision ? fechaEmision.slice(0, 19) : null);
  let finISO = (diaFin || diaInicio) ? `${anio}-${pad(mes)}-${pad(diaFin || diaInicio)}T23:59:59` : null;

  let periodoTexto = '';
  if (diaInicio && diaFin) {
    periodoTexto = `Desde el ${nombreDiaInicio ? `${nombreDiaInicio} ` : ''}${diaInicio} hasta el ${nombreDiaFin ? `${nombreDiaFin} ` : ''}${diaFin} de ${pad(mes)}/${anio}`;
  } else if (diaInicio) {
    periodoTexto = `A partir del ${nombreDiaInicio ? `${nombreDiaInicio} ` : ''}${diaInicio} de ${pad(mes)}/${anio}`;
  } else if (/fin de semana/i.test(texto)) {
    periodoTexto = 'Previsto durante el próximo fin de semana (sábado y domingo)';
  } else {
    periodoTexto = fechaEmision ? `Emitido el ${fechaEmision.slice(8, 10)}/${fechaEmision.slice(5, 7)}/${fechaEmision.slice(0, 4)}` : 'Vigencia oficial en seguimiento';
  }

  let extracto = '';
  const idxSit = texto.indexOf('situación más probable');
  if (idxSit !== -1) {
    extracto = texto.slice(idxSit, idxSit + 350).replace(/\s+/g, ' ').trim();
  } else {
    const idxEp = texto.indexOf('EPISODIO');
    if (idxEp !== -1) {
      extracto = texto.slice(idxEp, idxEp + 350).replace(/\s+/g, ' ').trim();
    }
  }

  return {
    fechaEmision,
    inicio: inicioISO,
    fin: finISO,
    diaInicio,
    diaFin,
    nombreDiaInicio,
    nombreDiaFin,
    periodoTexto,
    extractoOficial: extracto,
    urlDoc: url
  };
}

export function parsearAlertasAtomMeteoalarm(xmlString, zona = null, autoridad = null) {
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
      const capOnsetMatch = /<cap:onset>([\s\S]*?)<\/cap:onset>/i.exec(entry);
      const capExpiresMatch = /<cap:expires>([\s\S]*?)<\/cap:expires>/i.exec(entry);
      const capEffectiveMatch = /<cap:effective>([\s\S]*?)<\/cap:effective>/i.exec(entry);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
      const summary = summaryMatch ? summaryMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
      const area = capAreaMatch ? capAreaMatch[1].trim() : "";
      const severity = capSeverityMatch ? capSeverityMatch[1].trim().toUpperCase() : "";
      const event = capEventMatch ? capEventMatch[1].trim() : "";
      const onset = capOnsetMatch ? capOnsetMatch[1].trim() : (capEffectiveMatch ? capEffectiveMatch[1].trim() : null);
      const expires = capExpiresMatch ? capExpiresMatch[1].trim() : null;

      // Filtrar por la zona si se identificó provincia o alias
      if (zonaRegex && area && !zonaRegex.test(area) && !zonaRegex.test(title)) {
        continue;
      }

      let nivel = "AMARILLA";
      if (/red|roja|extreme/i.test(severity) || /rojo|roja/i.test(title)) nivel = "ROJA";
      else if (/orange|naranja|severe/i.test(severity) || /naranja/i.test(title)) nivel = "NARANJA";
      else if (/yellow|amarill/i.test(severity) || /amarill/i.test(title)) nivel = "AMARILLA";

      const esSevero = nivel === "NARANJA" || nivel === "ROJA" || /coastal|costero|costera|viento|wind|mar|wave|ola|storm|tormenta|rain|lluvia|inund|thunder/i.test(event + " " + title + " " + summary);

      const periodoTexto = onset && expires
        ? `Desde ${onset.slice(0, 16).replace('T', ' ')} hasta ${expires.slice(0, 16).replace('T', ' ')}`
        : null;

      // Si tenemos autoridad regional de emergencias y el aviso reviste gravedad,
      // emitir la alerta vinculada con su organismo 112 y plan oficial
      if (autoridad && esSevero) {
        alertas.push({
          origen: autoridad.nombre,
          autoridad: autoridad.organismo,
          tipo: `Aviso Protección Civil (${autoridad.nombre}) - ${event || title || "Alerta Costera"}`,
          titulo: `${autoridad.nombre.toUpperCase()} - ${event || title}`,
          nivel,
          descripcion: `${summary || title}. Activado seguimiento preventivo bajo el ${autoridad.plan} (${autoridad.organismo}). ${autoridad.peligroNautico}`,
          zona: area || zona?.nombre || autoridad.zonaNombre || "Litoral",
          urlDoc: autoridad.urlDoc,
          plan: authorityPlan(autoridad),
          inicio: onset,
          fin: expires,
          periodoTexto,
          esEspecial: nivel === "NARANJA" || nivel === "ROJA" || /especial/i.test(title)
        });
      }

      // Registro técnico oficial AEMET
      alertas.push({
        origen: "AEMET",
        tipo: event || title || "Aviso costero o meteorológico",
        nivel,
        descripcion: summary || title,
        zona: area || zona?.nombre || "Costa de España",
        inicio: onset,
        fin: expires,
        periodoTexto
      });
    }
  } catch (e) {
    console.warn("[AEMET Ingestor] Error parseando XML:", e.message);
  }
  return alertas;
}

function authorityPlan(aut) {
  return aut?.plan || "Plan Especial de Protección Civil";
}

/**
 * Consulta Avisos Especiales de Protección Civil y Emergencias 112 Comunitat Valenciana
 * Lee e interpreta el PDF oficial y sus fechas de vigencia exacta (inicio y fin)
 */
export async function consultarAvisos112CV() {
  try {
    const resp = await fetch("https://www.112cv.gva.es/es/inicio", { signal: AbortSignal.timeout(3500) });
    if (!resp.ok) return [];
    const html = await resp.text();
    const avisos112 = [];

    const linkRegex = /<a[^>]*href="([^"]*(?:EGEN|\.pdf|aviso)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const textoHtml = match[2].replace(/<[^>]+>/g, "").replace(/[⚠\s]+/g, " ").trim();
      const esAvisoEmergencia = /EGEN|aviso[-_]?especial|preemerg|alerta/i.test(href) || /aviso\s+especial|preemergencia|alerta\s+meteorol/i.test(textoHtml);
      if (!esAvisoEmergencia || !/\.pdf/i.test(href)) continue;
      const url = href.startsWith("http") ? href : `https://www.112cv.gva.es${href}`;

      // Leer y entender el PDF oficial de aviso para extraer su vigencia temporal y detalles
      let detalle = {
        inicio: null,
        fin: null,
        periodoTexto: "",
        extractoOficial: "",
        fechaEmision: null,
        diaInicio: null,
        diaFin: null,
        nombreDiaInicio: "",
        nombreDiaFin: ""
      };

      try {
        const pdfResp = await fetch(url, { signal: AbortSignal.timeout(1200) });
        if (pdfResp.ok) {
          const buf = Buffer.from(await pdfResp.arrayBuffer());
          const pdfText = parsePdfStreamText(buf);
          if (pdfText) {
            detalle = interpretarTextoAlerta(pdfText, url);
          }
        }
      } catch (errPdf) {
        console.warn("[112CV Ingestor] Lectura de PDF no bloqueante:", errPdf.message);
      }

      const descDetallada = detalle.extractoOficial
        ? `${textoHtml || "Aviso Especial 112 CV"} (${detalle.periodoTexto || 'Vigencia oficial'}). ${detalle.extractoOficial}. Riesgo de avenidas súbitas en barrancos y ramblas hacia playas y litoral.`
        : `${textoHtml || "Aviso Especial de Emergencias"} - Emergencias Generalitat Valenciana (112 CV). Riesgo de precipitaciones intensas y avenidas súbitas en ramblas y desembocaduras hacia el litoral marítimo.`;

      avisos112.push({
        origen: "112 Comunitat Valenciana",
        autoridad: "Agència Valenciana de Seguretat i Resposta a les Emergències (112 CV)",
        tipo: "Aviso Especial Protección Civil (112 CV)",
        titulo: "AVISO ESPECIAL DE PROTECCIÓN CIVIL (112 CV)",
        nivel: "NARANJA",
        descripcion: descDetallada,
        extractoOficial: detalle.extractoOficial || null,
        periodoTexto: detalle.periodoTexto || null,
        inicio: detalle.inicio || null,
        fin: detalle.fin || null,
        diaInicio: detalle.diaInicio || null,
        diaFin: detalle.diaFin || null,
        nombreDiaInicio: detalle.nombreDiaInicio || null,
        nombreDiaFin: detalle.nombreDiaFin || null,
        fechaEmision: detalle.fechaEmision || null,
        zona: "Comunitat Valenciana (Litoral)",
        urlDoc: url,
        plan: "Plan Especial de Inundaciones y Temporal Costero (Generalitat Valenciana)",
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
  const locationText = String(req.query?.location || req.body?.location || "");

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
  const autoridad = obtenerAutoridadEmergencias(lat, lon, zona, locationText);
  const esComunitatValenciana = autoridad.id === "VALENCIA";
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
            alertas = parsearAlertasAtomMeteoalarm(rawCap, zona, autoridad);
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
        alertas = parsearAlertasAtomMeteoalarm(atomXml, zona, autoridad);
      }
    }

    // 3. Ingestión de Avisos Especiales de Protección Civil en tiempo real para Comunitat Valenciana
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
      autoridad: {
        id: autoridad.id,
        nombre: autoridad.nombre,
        organismo: autoridad.organismo,
        plan: autoridad.plan,
        urlDoc: autoridad.urlDoc,
        portal: autoridad.portal,
        telefono: autoridad.telefono,
        canal: autoridad.canal,
        peligroNautico: autoridad.peligroNautico
      },
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
      zonaDetectada: zona?.nombre || "Litoral de España",
      autoridad: {
        id: autoridad.id,
        nombre: autoridad.nombre,
        organismo: autoridad.organismo,
        plan: autoridad.plan,
        urlDoc: autoridad.urlDoc,
        portal: autoridad.portal,
        telefono: autoridad.telefono,
        canal: autoridad.canal,
        peligroNautico: autoridad.peligroNautico
      },
      alertas: [],
      mensaje: "AEMET no disponible temporalmente"
    });
  }
}
