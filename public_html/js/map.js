// ====================================================
// js/map.js - MAPA, TRAZADOS, CLIMA Y TRACKING GPS
// ====================================================
import { supabaseClient, appState } from './config.js';
import { fetchConTimeout, esc, formatearTiempo, calcularVeredicto } from './utils.js';
import { ClubState } from './club/state.js';

const BACKEND_API_URL = 'https://paddlesafe-backend.vercel.app/api/backend';

function crearFranjaForecast(horaSalida, duracionMinutos = 120) {
    const match = /^([01]\d|2[0-3]):[0-5]\d$/.exec(horaSalida || '');
    if (!match) throw new Error('La hora de salida no es válida.');

    const horaInicio = Number(match[1]);
    const horasDuracion = Math.max(1, Math.ceil(Number(duracionMinutos) / 60));
    const horaFin = Math.min(24, horaInicio + horasDuracion);
    return `Salida (${String(horaInicio).padStart(2, '0')}:00 - ${String(horaFin).padStart(2, '0')}:00)`;
}

export let map;
export let marcador;
export let datosMeteoActuales = null;
export let latitudActual = 38.80;
export let longitudActual = 0.18;
export let modoTravesiaActivo = false;
export let modoRutaLibreActivo = false;
export let marcadoresRuta = [];
export let lineaRuta = null;
export let lineasMultiPunto = [];
export let etiquetasDistancia = [];
export let isTracking = false;
export let trackDistanceKm = 0;
export let trackCoords = [];
export const GPS_MIN_DISTANCIA_METROS = 8;
export let ultimoPuntoCrudoGPS = null;
export let lastPositionGPS = null;
export let lastTimestampGPS = null;
export let trackStartTime = null;
export let cronometroInterval = null;
export let watchId = null;
export let livePolyline = null;
export let clubParaEvento = null;
export let modoQuedadaClubActivo = false;
let isSavingRoute = false;
let isSyncingPendingRoute = false;

export function normalizarYLimitarRutaGPS(coords, maxPuntos = 2000, maxBytes = 900 * 1024) {
    if (!Array.isArray(coords) || coords.length === 0) return [];
    
    // Redondear a 6 decimales y filtrar puntos válidos
    let puntos = coords
        .filter(pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
        .map(pt => [
            Number(Number(pt[0]).toFixed(6)),
            Number(Number(pt[1]).toFixed(6))
        ]);

    if (puntos.length <= 2) return puntos;

    // Muestreo uniforme si excede maxPuntos, preservando siempre el primer y último punto
    if (puntos.length > maxPuntos) {
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (maxPuntos - 1);
        for (let i = 1; i < maxPuntos - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
    }

    // Comprobar límite de bytes (< 900 KB) y reducir uniformemente si fuera necesario
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    let serialized = JSON.stringify(puntos);
    let byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;

    while (byteLength >= maxBytes && puntos.length > 2) {
        const nuevoLimite = Math.max(2, Math.floor(puntos.length * 0.8));
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (nuevoLimite - 1);
        for (let i = 1; i < nuevoLimite - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
        serialized = JSON.stringify(puntos);
        byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;
    }

    return puntos;
}

export function buscarYCentrarMapa(t) {
    if(!t) return;
    if(t.includes(',')){
        const p = t.split(',');
        if(!isNaN(p[0]) && !isNaN(p[1])) return actualizarMapa(parseFloat(p[0]), parseFloat(p[1]));
    }
    fetchConTimeout(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(t)}`)
        .then(r => (r.ok ? r.json() : []))
        .then(d => { if(d && d.length) actualizarMapa(parseFloat(d[0].lat), parseFloat(d[0].lon)); })
        .catch(err => console.warn('[geocoding] Aviso no crítico:', err));
}

export function actualizarMapa(lat, lon) {
    latitudActual = lat; longitudActual = lon;
    if(map && !modoTravesiaActivo && !modoRutaLibreActivo) {
        const ll = new L.LatLng(lat, lon);
        if(marcador) marcador.setLatLng(ll); else marcador = L.marker(ll).addTo(map);
        map.setView(ll, 12);
    }
}

export function inicializarMapa() {
    if(map) return;
    map = L.map('mapaInteractivo').setView([latitudActual, longitudActual], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, crossOrigin: true }).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { crossOrigin: true }).addTo(map);
    
    if(!modoTravesiaActivo && !modoRutaLibreActivo) marcador = L.marker([latitudActual, longitudActual]).addTo(map);
    
    map.on('click', async e => {
        const lat = e.latlng.lat; const lon = e.latlng.lng;
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
            const data = await res.json();
            if(data.elevation && data.elevation[0] > 8) return alert("Punto en tierra firme.");
        } catch(err) { console.warn('Aviso no crítico al comprobar elevación:', err); }
        
        if(modoTravesiaActivo) gestionarClicRuta(e.latlng);
        else if(modoRutaLibreActivo) gestionarClicRutaLibre(e.latlng);
        else {
            actualizarMapa(lat.toFixed(5), lon.toFixed(5));
            const locInput = document.getElementById('location'); if(locInput) locInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            
            const ahora = new Date();
            const strDate = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
            const strTime = String(ahora.getHours()).padStart(2, '0') + ":" + String(ahora.getMinutes()).padStart(2, '0');
            
            const ploc = document.getElementById('proLocation'); const pdate = document.getElementById('proDate'); const ptime = document.getElementById('proTime');
            if(ploc) ploc.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`; if(pdate) pdate.value = strDate; if(ptime) ptime.value = strTime;
            
            const panelPro = document.getElementById("panelPro");
            if (panelPro && panelPro.style.gridTemplateRows !== "0fr") consultarPuntoProInstantaneo(lat, lon, strDate, strTime);
        }
    });

    // Observador de redimensionamiento para evitar los tiles grises de Leaflet
    const resizeObserver = new ResizeObserver(() => {
        if (map) {
            requestAnimationFrame(() => map.invalidateSize());
        }
    });
    const contMap = document.getElementById('mapContainer');
    const interMap = document.getElementById('mapaInteractivo');
    if (contMap) resizeObserver.observe(contMap);
    if (interMap) resizeObserver.observe(interMap);

    window.addEventListener('resize', () => {
        if (map) requestAnimationFrame(() => map.invalidateSize());
    });
    window.addEventListener('orientationchange', () => {
        if (map) setTimeout(() => map.invalidateSize(), 200);
    });
}

export function obtenerUbicacion() {
    const inp = document.getElementById('location'); const b = document.getElementById('btn-gps');
    if(!navigator.geolocation) return alert("Sin GPS.");
    inp.value="Buscando..."; b.classList.add('animate-pulse');
    navigator.geolocation.getCurrentPosition(p=>{
        const l = p.coords.latitude.toFixed(5); const n = p.coords.longitude.toFixed(5);
        inp.value = `${l}, ${n}`; b.classList.remove('animate-pulse'); actualizarMapa(l, n);
    }, e => {
        inp.value=""; b.classList.remove('animate-pulse'); alert("GPS bloqueado.");
    }, {enableHighAccuracy: true, timeout: 6000});
}

export function toggleModoTravesia() {
    if(modoRutaLibreActivo) toggleRutaLibre();
    modoTravesiaActivo = !modoTravesiaActivo;
    const b = document.getElementById('btnTravesia'); const msg = document.getElementById('mapMsg');
    if(modoTravesiaActivo) {
        b.classList.replace('bg-teal-500','bg-red-500'); b.classList.replace('hover:bg-teal-400','hover:bg-red-400');
        b.innerHTML = "❌ Cancelar (A-B)"; msg.textContent = "📍 Toca el PUNTO A (Salida)";
        if(marcador) map.removeLayer(marcador); limpiarRuta();
    } else {
        b.classList.replace('bg-red-500','bg-teal-500'); b.classList.replace('hover:bg-red-400','hover:bg-teal-400');
        b.innerHTML = "🗺️ Trazar (A ➔ B)"; msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
        limpiarRuta(); if(map) marcador = L.marker([latitudActual,longitudActual]).addTo(map);
    }
}

export function toggleRutaLibre() {
    if(modoTravesiaActivo) toggleModoTravesia();
    modoRutaLibreActivo = !modoRutaLibreActivo;
    const b = document.getElementById('btnRutaLibre'); const msg = document.getElementById('mapMsg');
    if(modoRutaLibreActivo) {
        b.classList.replace('bg-teal-600','bg-red-500'); b.classList.replace('hover:bg-teal-500','hover:bg-red-400');
        b.innerHTML = "❌ Cancelar Multi..."; document.getElementById('leyendaMapa').classList.replace('flex','hidden');
        if(marcador) map.removeLayer(marcador); limpiarRuta(); msg.textContent = "📍 Toca el mapa para añadir puntos";
    } else {
        b.classList.replace('bg-red-500','bg-teal-600'); b.classList.replace('hover:bg-red-400','hover:bg-teal-500');
        b.innerHTML = "🔗 Multipunto"; document.getElementById('leyendaMapa').classList.replace('flex','hidden');
        document.getElementById('multipuntoToolbar').classList.replace('flex','hidden'); limpiarRuta();
        if(map) marcador = L.marker([latitudActual,longitudActual]).addTo(map); msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
    }
}

export function limpiarRuta() {
    marcadoresRuta.forEach(m => map.removeLayer(m)); marcadoresRuta.length = 0;
    if(lineaRuta) map.removeLayer(lineaRuta);
    lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
    etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
    const contMulti = document.getElementById('proDashTramosContainer'); if(contMulti) contMulti.innerHTML = "";
    const ploc = document.getElementById('proLocation'); if(ploc) ploc.value = "";
    
    // Reset de seguridad para eventos de club
    clubParaEvento = null;
    const panelQuedada = document.getElementById('panelQuedadaMap');
    if (panelQuedada) panelQuedada.classList.add('hidden');
    const btnSave = document.getElementById('btnGuardarQuedadaMap') || document.getElementById('btnSaveClubEvent');
    if (btnSave) btnSave.classList.add('hidden');
}

export function gestionarClicRuta(l) {
    const msg = document.getElementById('mapMsg'); const ploc = document.getElementById('proLocation');
    if(marcadoresRuta.length === 0) {
        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        msg.textContent = "📍 Toca el PUNTO B (Llegada)"; if(ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;
    } else if(marcadoresRuta.length === 1) {
        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        lineaRuta = L.polyline(marcadoresRuta.map(m=>m.getLatLng()),{color:'#0ea5e9',weight:4,dashArray:'5,10'}).addTo(map);
        const p1 = marcadoresRuta[0].getLatLng(); const p2 = marcadoresRuta[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2; const midLng = (p1.lng + p2.lng) / 2;
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
        map.fitBounds(lineaRuta.getBounds(), {padding:[50,50]}); msg.textContent = "✅ Ruta marcada. Calcula abajo.";
    } else {
        // Permite corregir el Punto B sin borrar el Punto A
        map.removeLayer(marcadoresRuta[1]);
        marcadoresRuta.pop();
        if(lineaRuta) map.removeLayer(lineaRuta);
        etiquetasDistancia.forEach(etiq => map.removeLayer(etiq));
        etiquetasDistancia.length = 0;

        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        lineaRuta = L.polyline(marcadoresRuta.map(m=>m.getLatLng()),{color:'#0ea5e9',weight:4,dashArray:'5,10'}).addTo(map);
        
        const p1 = marcadoresRuta[0].getLatLng(); const p2 = marcadoresRuta[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2; const midLng = (p1.lng + p2.lng) / 2;
        
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
        map.fitBounds(lineaRuta.getBounds(), {padding:[50,50]}); 
        
        const panelPro = document.getElementById("panelPro");
        if (panelPro && panelPro.style.gridTemplateRows !== "0fr") consultarRutaPro();
    }
}

export function gestionarClicRutaLibre(l) {
    const lt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const i = marcadoresRuta.length; const ploc = document.getElementById('proLocation');
    if(i === 0 && ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;
    marcadoresRuta.push(L.marker(l,{icon:L.divIcon({className:'',html:`<div class="bg-marine text-white font-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white">${lt[i]||i}</div>`,iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map));
    document.getElementById('multipuntoToolbar').classList.replace('hidden','flex');
    if(marcadoresRuta.length > 1) {
        document.getElementById('btnRutaLibre').innerHTML = "✅ Terminar Trazado";
        renderPreviewRuta();
        document.getElementById('mapMsg').textContent = "Añade más puntos o calcula la ruta abajo.";
    }
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function deshacerUltimoPunto() {
    if(!marcadoresRuta.length) return;
    map.removeLayer(marcadoresRuta.pop());
    if(marcadoresRuta.length > 1) renderPreviewRuta();
    else if(marcadoresRuta.length === 0) {
        document.getElementById('multipuntoToolbar').classList.replace('flex','hidden');
        document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir puntos";
        limpiarRuta();
    }
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function reiniciarRutaMultipunto() {
    limpiarRuta();
    document.getElementById('multipuntoToolbar').classList.replace('flex','hidden');
    document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir puntos";
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function renderPreviewRuta() {
    lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
    etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
    const c = marcadoresRuta.map(m => m.getLatLng());
    for(let i=0; i < c.length-1; i++) {
        const pl = L.polyline([c[i],c[i+1]],{color:'#64748b',weight:3,dashArray:'5,5'}).addTo(map);
        lineasMultiPunto.push(pl);
        const dist = (c[i].distanceTo(c[i+1]) / 1000).toFixed(2);
        const midLat = (c[i].lat + c[i+1].lat) / 2; const midLng = (c[i].lng + c[i+1].lng) / 2;
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
    }
}

export function evaluarVientoRelativoInfo(rumboNavegacion, direccionVientoOrigen) {
    let diff = Math.abs(direccionVientoOrigen - rumboNavegacion); if (diff > 180) diff = 360 - diff;
    if (diff <= 45) return { texto: "EN CONTRA", claseColor: "bg-red-500/20 text-red-400 border border-red-500/50", modVelocidad: -1.5, colorRumbo: "text-red-400", hexLineColor: "#ef4444", icon: "🛑" };
    else if (diff >= 135) return { texto: "A FAVOR", claseColor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50", modVelocidad: 1.0, colorRumbo: "text-emerald-400", hexLineColor: "#10b981", icon: "🚀" };
    else return { texto: "LATERAL", claseColor: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50", modVelocidad: -0.5, colorRumbo: "text-yellow-400", hexLineColor: "#eab308", icon: "⚠️" };
}

export function evaluarAlertasGlobales(d, v, o, p, pL) {
    let act = false; let desc = "Aviso AEMET"; let nvl = "ALERTA OFICIAL";
    if(d) {
        const ab = d.aemet || d.alerta_aemet || d.alertas || d.alerts;
        if(ab && (typeof ab === 'string' ? ab.length > 0 : (Array.isArray(ab) && ab.length > 0))) {
            act = true;
            if(typeof ab === 'string') desc = ab;
            else desc = ab[0].descripcion || ab[0].event || ab[0].headline || "Alerta Meteorológica Activa";
            const descLower = desc.toLowerCase();
            if(descLower.includes("rojo") || descLower.includes("extremo")) nvl = "ROJA";
            else if(descLower.includes("naranja") || descLower.includes("importante") || descLower.includes("tormenta")) nvl = "NARANJA";
            else if(descLower.includes("amarillo") || descLower.includes("precaución")) nvl = "AMARILLA";
        }
    }
    if(act) {
        let badgeColor = nvl === "ROJA" ? "bg-red-700" : (nvl === "NARANJA" ? "bg-red-600" : "bg-amber-500");
        return { activa: true, origen: 'AEMET', nivel: nvl, tipo: desc, c: "from-red-600 to-orange-800 shadow-[0_0_20px_rgba(220,38,38,0.4)]", textStyle: "text-white", badgeColor: badgeColor, ico: "🚨" };
    }
    if(v >= 35 || o >= 2.0) return { activa: true, origen: 'EXTREMO', nivel: "ROJA", tipo: "Riesgo Extremo. No salir.", c: "from-blue-600 to-indigo-800 shadow-[0_0_20px_rgba(59,130,246,0.4)]", textStyle: "text-orange-300", badgeColor: "bg-red-600", ico: "🌊" };
    if(v >= 28 || o >= 1.2) return { activa: true, origen: 'EXTREMO', nivel: "NARANJA", tipo: "Riesgo Costero Activo.", c: "from-blue-600 to-indigo-800 shadow-[0_0_20px_rgba(59,130,246,0.4)]", textStyle: "text-yellow-300", badgeColor: "bg-amber-600", ico: "⚠️" };
    const cl = d && d.clima ? d.clima.toLowerCase() : "";
    if(p > 0 || pL > 60 || cl.includes("lluvia") || cl.includes("tormenta")) return { activa: true, origen: 'LLUVIA', nivel: "PELIGROSO", tipo: "Tormenta o Lluvia Activa", c: "from-blue-600 to-indigo-800 shadow-[0_0_20px_rgba(59,130,246,0.4)]", textStyle: "text-blue-300", badgeColor: "bg-blue-500", ico: "⛈️" };
    if(pL > 40) return { activa: true, origen: 'LLUVIA', nivel: "PRECAUCIÓN", tipo: "Alta Prob. Lluvia (>40%)", c: "from-blue-600 to-indigo-800 shadow-[0_0_20px_rgba(59,130,246,0.4)]", textStyle: "text-sky-300", badgeColor: "bg-sky-500", ico: "🌧️" };
    return { activa: false };
}

export async function consultarBasico() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const loc = document.getElementById('location').value.trim();
    const d = document.getElementById('date').value;
    const r = document.getElementById('timeRange').value;
    const u = document.getElementById('userLevel').value;
    const btn = document.getElementById('btn-consultar');
    const sp = document.getElementById('spinner');
    const bt = document.getElementById('btn-text');
    const res = document.getElementById('resultado');
    
    if(!loc || !d || !r || !u) {
        res.innerHTML = `<strong>⚠️ Faltan datos</strong>`;
        res.className = "text-sm font-bold text-red-500 bg-red-50 p-5 rounded-2xl border border-red-200 text-center";
        return;
    }
    
    res.className = "text-sm font-mono text-slate-600 bg-slate-50 p-5 rounded-2xl border border-slate-200 whitespace-pre-wrap leading-relaxed min-h-[80px]";
    buscarYCentrarMapa(loc);
    btn.disabled = true; sp.classList.remove('hidden'); bt.textContent = "Analizando..."; res.textContent = "Contactando servidores...";
    
    const alC = document.getElementById('global-alert-container'); if(alC) alC.innerHTML = '';
    
    const payload = {
        location: loc,
        date: d,
        timeRange: r,
        userLevel: u || "Intermedio"
    };

    try {
        const response = await fetchConTimeout(`${BACKEND_API_URL}?action=forecast`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const txt = await response.text();
        const p = JSON.parse(txt);
        
        if(p.datos) {
            const dx = p.datos;
            const wk = (dx.windSpeed * 3.6).toFixed(1);
            const wv = (dx.waveHeight != null && Number.isFinite(parseFloat(dx.waveHeight))) ? parseFloat(dx.waveHeight).toFixed(1) : null;
            const pm = dx.precipitation || 0;
            const pl = dx.precipProbability || 0;
            
            document.getElementById("basicWindSpeed").textContent = `${wk} km/h`;
            document.getElementById("basicWave").textContent = wv !== null ? `${wv} m` : 'N/D';
            document.getElementById("basicPrecip").textContent = `${pm} mm`;
            document.getElementById("basicPrecipProb").textContent = `Prob: ${pl}%`;
            
            const cardD = ["N","NE","E","SE","S","SO","O","NO"]; const idir = Math.round(dx.windDirection / 45) % 8;
            document.getElementById("basicWindDir").innerHTML = `<div class="wind-arrow text-emerald-500 drop-shadow-sm w-4 h-4" style="transform: rotate(${dx.windDirection || 0}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></div> ${cardD[idir]} (${Math.round(dx.windDirection)}°)`;
            
            const a = evaluarAlertasGlobales(dx, wk, wv, pm, pl);
            const lElBasic = document.getElementById("basicLevel");
            const veredicto = calcularVeredicto({
                alerta: a, vientoKmh: parseFloat(wk), olaM: wv !== null ? parseFloat(wv) : NaN,
                rachasKmh: dx.windGusts != null ? Number(dx.windGusts) * 3.6 : NaN, nivelUsuario: u
            });
            
            lElBasic.className = `text-sm font-black text-center w-full px-2 py-1 ${veredicto.cls}`; 
            lElBasic.textContent = veredicto.estado;
            res.innerHTML = `<strong>📍 ${esc((p.received?.location || loc).split(',')[0])}</strong><br>📅 ${esc(p.received?.date || d)} | 🕒 ${esc(p.received?.timeRange || r)}<br><br>💡 <strong>Veredicto:</strong> ${esc(veredicto.mensaje)}`;
            solicitarCoachIABasico(dx, u, loc);
        } else { 
            res.textContent = "Error del servidor."; 
            const bC = document.getElementById('basicCoachContainer'); if (bC) bC.classList.add('hidden');
        }
    } catch(e) { 
        res.innerHTML = `<strong>Error de Red o Fallo de decodificación.</strong> Revisa tu conexión.`; 
        console.warn('Aviso no crítico (fetch meteo):', e); 
        const bC = document.getElementById('basicCoachContainer'); if (bC) bC.classList.add('hidden');
    } finally {
        btn.disabled = false; sp.classList.add('hidden'); bt.textContent = 'Análisis Básico Rápido';
    }
}

export async function consultarPuntoProInstantaneo(lat, lon, d, t) {
    const u = document.getElementById('proLevelOption').value || "Intermedio";
    const btn = document.getElementById('btnCalcPro');
    if(btn) { btn.disabled = true; btn.innerHTML = "Analizando punto..."; }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t || "12:00"),
            userLevel: u
        };
        const response = await fetchConTimeout(`${BACKEND_API_URL}?action=forecast`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const txt = await response.text();
        const p = JSON.parse(txt);
        if(p.datos) renderizarDashboardPro(p.datos, t, u, false, lat, lon, d);
    } catch(e) {
        console.warn('Aviso no crítico:', e);
        alert('❌ No se pudo obtener el pronóstico. Revisa tu conexión.');
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro"; }
    }
}

export async function consultarRutaPro() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const alertCont = document.getElementById('proAlertContainer');
    alertCont.classList.add('hidden'); alertCont.innerHTML = "";
    
    const locVal = document.getElementById('proLocation').value;
    const d = document.getElementById('proDate').value;
    const t = document.getElementById('proTime').value;
    const u = document.getElementById('proLevelOption').value;
    
    if(!locVal || !d || !t) {
        alertCont.innerHTML = "⚠️ Toca el mapa e indica Fecha/Hora.";
        alertCont.className = "text-sm font-bold text-red-400 bg-red-900/30 p-4 rounded-xl text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        return;
    }
    
    const btn = document.getElementById('btnCalcPro');
    btn.disabled = true; btn.innerHTML = "Calculando...";
    
    let lat, lon;
    if (marcadoresRuta.length >= 2) {
        lat = marcadoresRuta[0].getLatLng().lat.toFixed(5); lon = marcadoresRuta[0].getLatLng().lng.toFixed(5);
    } else {
        const partes = locVal.split(','); lat = parseFloat(partes[0]); lon = parseFloat(partes[1]);
    }
    
    let duracionEstimada = 120;
    if (marcadoresRuta.length >= 2) {
        let dt = 0;
        const coords = marcadoresRuta.map(m => m.getLatLng());
        let rutArray = [...coords];
        if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        for(let i = 0; i < rutArray.length - 1; i++) {
            dt += rutArray[i].distanceTo(rutArray[i+1]);
        }
        if (dt > 0) duracionEstimada = Math.round(((dt / 1000) / 4.5) * 60);
    }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t, duracionEstimada),
            userLevel: u
        };
        const response = await fetchConTimeout(`${BACKEND_API_URL}?action=forecast`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        
        const txt = await response.text();
        
        let p;
        try {
            p = JSON.parse(txt);
        } catch(parseError) {
            throw new Error("El servidor devolvió un formato no válido.");
        }
        
        if(p.datos) {
            renderizarDashboardPro(p.datos, t, u, marcadoresRuta.length >= 2, lat, lon, d);
        } else {
            alertCont.innerHTML = "⚠️ Sin datos climáticos marinos."; alertCont.classList.remove('hidden');
        }
    } catch(e) {
        alertCont.innerHTML = `❌ Error de conexión o servidor.`; alertCont.classList.remove('hidden');
        console.warn('Aviso crítico (Fetch Pro):', e);
    } finally {
        btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro";
    }
}

export function renderizarDashboardPro(dx, horaSalida, userLvl, esRutaTrazada, lat, lon, fechaD) {
    datosMeteoActuales = dx;
    const wkVal = dx.windSpeed !== undefined ? dx.windSpeed : (dx.wind_speed || 0);
    const wk = (wkVal * 3.6).toFixed(1);
    const wv = (dx.waveHeight !== undefined && dx.waveHeight !== null) ? parseFloat(dx.waveHeight).toFixed(1) : (dx.wave_height ? parseFloat(dx.wave_height).toFixed(1) : null);
    const wPeriod = dx.wavePeriod !== undefined ? dx.wavePeriod : (dx.wave_period !== undefined ? dx.wave_period : "--");
    const pm = (dx.precipitation !== undefined && dx.precipitation !== null && dx.precipitation !== "") ? dx.precipitation : 0;
    const pl = (dx.precipProbability !== undefined && dx.precipProbability !== null && dx.precipProbability !== "") ? dx.precipProbability : (dx.precipitation_probability || 0);
    let gustsVal = dx.windGusts !== undefined && dx.windGusts !== null ? dx.windGusts : (dx.wind_gusts || (wkVal * 1.4));
    let gusts = (gustsVal * 3.6).toFixed(1);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null) ? dx.uvIndex : (dx.uv_index !== undefined ? dx.uv_index : "--");
    
    let uvText = uv >= 8 ? "MUY ALTO" : (uv >= 5 ? "ALTO" : (uv > 0 ? "MODERADO" : "--"));
    document.getElementById('proDashWind').innerHTML = `${wk} <span class="text-[10px] text-slate-500">km/h</span>`;
    document.getElementById('proDashGusts').innerHTML = `Rachas: ${gusts}`;
    document.getElementById('proDashDirIcon').style.transform = `rotate(${dx.windDirection || 0}deg)`;
    document.getElementById('proDashDirText').innerHTML = `${Math.round(dx.windDirection || 0)}°`;
    document.getElementById('proDashWave').innerHTML = `${wv !== null ? wv : 'N/D'} <span class="text-[10px] text-sky-900">m</span>`;
    document.getElementById('proDashWavePeriod').innerHTML = `Periodo: ${wPeriod} s`;
    document.getElementById('proDashPrecip').innerHTML = `${pl}%`;
    document.getElementById('proDashPrecipMM').innerHTML = `${pm} mm`;
    document.getElementById('proDashUV').innerHTML = `${uv}`;
    document.getElementById('proDashUVText').innerHTML = uvText;
    
    let tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    let tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    document.getElementById('proTempAmbiente').textContent = tempAireValue !== "N/D" ? `${tempAireValue}°` : "--°";
    document.getElementById('proTempAgua').textContent = tempAguaValue !== "N/D" ? `${tempAguaValue}°` : "--°";
    
    let icono = "☀️", textoClima = "SOL";
    if (dx.clima && dx.clima.toLowerCase().includes("nublado")) { icono = "☁️"; textoClima = "NUBES"; }
    if ((dx.clima && dx.clima.toLowerCase().includes("lluvia")) || pl > 0) { icono = "🌧️"; textoClima = "LLUVIA"; }
    document.getElementById('proIconoClima').textContent = icono;
    document.getElementById('proTextoClima').textContent = textoClima;
    
    let dt = 0, tt = 0, arrayHtmlTramos = [];
    const tramosParaCoach = [];
    if (esRutaTrazada) {
        const coords = marcadoresRuta.map(m => m.getLatLng());
        lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
        etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
        
        const dirViento = Number(dx.windDirection) || 0;
        const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let rutArray = [...coords];
        if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        
        for(let i = 0; i < rutArray.length - 1; i++) {
            const dSeg = rutArray[i].distanceTo(rutArray[i+1]); dt += dSeg;
            const nombreTramo = (modoTravesiaActivo && rutArray.length === 3) ? (i === 0 ? "IDA 🟢" : "VUELTA 🔴") : `TRAMO ${letras[i]||i} ➔ ${letras[i+1]||(i+1)}`;
            
            const lat1 = rutArray[i].lat * Math.PI / 180, lon1 = rutArray[i].lng * Math.PI / 180;
            const lat2 = rutArray[i+1].lat * Math.PI / 180, lon2 = rutArray[i+1].lng * Math.PI / 180;
            const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
            let rumbo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
            
            let iV = evaluarVientoRelativoInfo(rumbo, dirViento);
            const pline = L.polyline([rutArray[i], rutArray[i+1]], { color: iV.hexLineColor, weight: 5, className: 'ruta-animada' }).addTo(map);
            lineasMultiPunto.push(pline);
            
            const midLat = (rutArray[i].lat + rutArray[i+1].lat) / 2; const midLng = (rutArray[i].lng + rutArray[i+1].lng) / 2;
            const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${(dSeg/1000).toFixed(2)} km`, iconSize: [null, null] }) }).addTo(map);
            etiquetasDistancia.push(etiq);
            
            const tSeg = ((dSeg / 1000) / Math.max(2.0, 4.5 + iV.modVelocidad)) * 60; tt += tSeg;

            tramosParaCoach.push({
                nombre: nombreTramo,
                distancia_km: Number((dSeg / 1000).toFixed(2)),
                rumbo: rumbo,
                viento_relativo: iV.texto,
                modVelocidad: iV.modVelocidad,
                minutos: Math.round(tSeg)
            });
            
            arrayHtmlTramos.push(`
                <div class="bg-slate-800 rounded-xl p-3 border-l-4 shadow-sm w-full relative overflow-hidden" style="border-color:${iV.hexLineColor}">
                    <div class="flex justify-between items-center text-white text-[11px] mb-2 border-b border-slate-700/50 pb-2">
                        <span class="font-black ${iV.colorRumbo} tracking-wider">${nombreTramo}</span>
                        <span class="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-slate-400">Rumbo: ${rumbo}°</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full text-center">
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">DIST</span>
                            <span class="text-[11px] font-mono text-white">${(dSeg/1000).toFixed(2)} km</span>
                        </div>
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">TIEMPO</span>
                            <span class="text-[11px] font-mono text-white">${formatearTiempo(tSeg)}</span>
                        </div>
                        <div class="col-span-2 ${iV.claseColor} rounded p-1.5 flex items-center justify-center border border-slate-700/50">
                            <span class="text-[10px] font-black text-white flex items-center gap-1">${iV.icon} ${iV.texto}</span>
                        </div>
                    </div>
                </div>`);
        }
        
        document.getElementById('proDashTramosContainer').innerHTML = arrayHtmlTramos.join('');
        document.getElementById('proTituloTramos').textContent = "Análisis por Tramos";
        document.getElementById('proDistanciaTotal').textContent = `${(dt/1000).toFixed(2)} km`;
        document.getElementById('proTiempoTotal').textContent = formatearTiempo(tt);
        
        const timeParts = horaSalida.split(':'); const hh = parseInt(timeParts[0], 10) || 0; const mm = parseInt(timeParts[1], 10) || 0;
        let fechaLlegada = new Date(); fechaLlegada.setHours(hh, mm, 0); fechaLlegada.setMinutes(fechaLlegada.getMinutes() + Math.round(tt));
        const etaHH = fechaLlegada.getHours().toString().padStart(2, '0'); const etaMM = fechaLlegada.getMinutes().toString().padStart(2, '0');
        
        document.getElementById('proSalidaHora').textContent = horaSalida;
        document.getElementById('proLlegadaHora').textContent = `${etaHH}:${etaMM}`;
        document.getElementById('proContainerNavegacion').classList.remove('hidden'); document.getElementById('proContainerNavegacion').classList.add('flex');
    } else {
        document.getElementById('proContainerNavegacion').classList.add('hidden'); document.getElementById('proContainerNavegacion').classList.remove('flex');
        document.getElementById('proTituloTramos').textContent = "Punto de Exploración";
        document.getElementById('proDashTramosContainer').innerHTML = `
            <div class="bg-slate-800 rounded-xl p-4 text-center border border-slate-700/50">
                <span class="text-3xl block mb-2 drop-shadow-md">🧭</span>
                <p class="text-[10px] text-slate-500">Traza una ruta (A ➔ B) para ver tramos y ETA.</p>
            </div>`;
    }
    
    const a = evaluarAlertasGlobales(dx, wk, wv, pm, pl);
    const lElPro = document.getElementById("proStatusVerdict");
    let est = "✅ RUTA SEGURA PARA TU NIVEL", clsPro = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50";
    if (a.activa) {
        if(a.origen === 'AEMET') {
            est = `⛔ PROHIBIDO SALIR (${a.nivel})`; clsPro = "bg-red-600 text-white animate-pulse shadow-glow border-red-700";
        } else if(a.nivel === "ROJA" || a.nivel === "NARANJA" || a.nivel === "PELIGROSO") {
            est = "⛔ PELIGROSO (RIESGO EXTREMO)"; clsPro = "bg-red-500/20 text-red-400 border border-red-500/50";
        } else if(a.nivel === "PRECAUCIÓN") {
            est = "⚠️ PRECAUCIÓN (LLUVIA/VIENTO)"; clsPro = "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50";
        }
    } else {
        const vl = parseFloat(wk), ol = wv || 0;
        if(userLvl === "Principiante" && (vl > 12 || ol > 0.3)) {
            est = "⛔ PELIGROSO PARA PRINCIPIANTES"; clsPro = "bg-red-500/20 text-red-400 border border-red-500/50";
        } else if(userLvl === "Intermedio" && (vl > 14 || ol > 0.8)) {
            est = "⛔ PELIGROSO PARA INTERMEDIOS"; clsPro = "bg-red-500/20 text-red-400 border border-red-500/50";
        } else if(vl > 20 || ol > 0.9) {
            est = "⛔ CONDICIONES EXTREMAS"; clsPro = "bg-red-500/20 text-red-400 border border-red-500/50";
        }
    }
    lElPro.className = `px-6 py-3 rounded-xl sm:rounded-full text-sm font-black w-full text-center uppercase tracking-widest transition-all duration-300 ${clsPro}`;
    lElPro.textContent = est;
    document.getElementById('proPlanificador').classList.replace('flex','hidden');
    document.getElementById('proDashboardResumen').classList.remove('hidden'); document.getElementById('proDashboardResumen').classList.add('flex');
    const isoLlamada = `${fechaD}T${horaSalida}:00`;
    cargarPrevisionHorariaExacta(lat, lon, isoLlamada, tt > 0 ? tt : 120);
    solicitarCoachIAPro(dx, userLvl, dt, tt, lat, lon, fechaD, horaSalida, tramosParaCoach);
}

export async function cargarPrevisionHorariaExacta(lat, lon, startISO, durationMinutes) {
    const cont = document.getElementById('proDashHorasContainer');
    cont.innerHTML = 'Consultando radar...';
    try {
        const start = new Date(startISO);
        const end = new Date(start.getTime() + Math.max(durationMinutes, 60) * 60000);
        const horaUTC = d => d.toISOString().slice(0, 13) + ':00';
        const diaUTC = d => d.toISOString().slice(0, 10);
        const pos = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=GMT`;
        const json = r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
        const [wx, marine] = await Promise.all([
            fetchConTimeout(`https://api.open-meteo.com/v1/forecast?${pos}&hourly=windspeed_10m,windgusts_10m,precipitation_probability,uv_index&start_hour=${horaUTC(start)}&end_hour=${horaUTC(end)}`, { cache: 'no-store' }).then(json),
            fetchConTimeout(`https://marine-api.open-meteo.com/v1/marine?${pos}&hourly=wave_height&start_date=${diaUTC(start)}&end_date=${diaUTC(end)}`, { cache: 'no-store' }).then(json).catch(() => null)
        ]);
        if (!wx.hourly || !wx.hourly.time || wx.hourly.time.length === 0) throw new Error('Rango sin cobertura');
        const olas = new Map();
        if (marine && marine.hourly && marine.hourly.time) marine.hourly.time.forEach((t, i) => olas.set(t, marine.hourly.wave_height[i]));
        const num = (v, dec = 0) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(dec) : null);
        
        cont.innerHTML = wx.hourly.time.map((t, i) => {
            const horaLabel = new Date(t + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const wind = Number(wx.hourly.windspeed_10m[i]);
            const gust = Number(wx.hourly.windgusts_10m[i]);
            const wave = num(olas.get(t), 1);
            const rain = num(wx.hourly.precipitation_probability[i]);
            const uv = num(wx.hourly.uv_index[i], 1);
            const colorViento = wind > 20 ? 'text-red-400' : (wind > 12 ? 'text-yellow-400' : 'text-emerald-400');
            const colorRachas = gust > 25 ? 'text-red-500' : 'text-slate-300';
            const fila = (label, valor, color, unidad = '') => `
                    <div class="flex justify-between items-center text-[10px] mb-1">
                        <span class="text-slate-400 font-bold uppercase tracking-wider">${label}</span>
                        <span class="${color} font-bold">${valor ?? 'N/D'}${valor != null && unidad ? ` <span class="text-[8px]">${unidad}</span>` : ''}</span>
                    </div>`;
            return `
                <div class="bg-slate-800 rounded-xl p-3 border border-slate-700 min-w-[120px] flex-shrink-0 shadow-sm">
                    <span class="block ${colorViento} font-black text-center border-b border-slate-700 pb-1 mb-2 text-sm">${esc(horaLabel)}</span>
                    ${fila('Viento', num(wind), 'text-white', 'km/h')}
                    ${fila('Rachas', num(gust), colorRachas, 'km/h')}
                    ${fila('Oleaje', wave, 'text-sky-400', 'm')}
                    ${fila('Lluvia', rain, 'text-indigo-300', '%')}
                    ${fila('UV', uv, 'text-amber-400')}
                </div>`;
        }).join('');
    } catch (error) {
        console.warn('Aviso no crítico [prevision horaria]:', error);
        cont.innerHTML = '<p class="text-xs text-red-400 font-bold p-2 bg-red-900/20 rounded border border-red-500/50 w-full text-center">Datos horarios no disponibles ahora mismo. No salgas sin consultar otra fuente.</p>';
    }
}

export function volverPlanificadorPro() {
    document.getElementById('proDashboardResumen').classList.replace('flex','hidden');
    document.getElementById('proPlanificador').classList.remove('hidden');
    document.getElementById('proPlanificador').classList.add('flex');
}

// ==========================================
// PLANIFICADOR MULTIPUNTO DE QUEDADAS DE CLUB
// ==========================================
export function actualizarMetricasQuedada() {
    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distKm = (dt / 1000).toFixed(2);
    const tiempoMin = Math.round(((dt / 1000) / 4.5) * 60);

    const elPuntos = document.getElementById('quedadaPuntosCount');
    const elDist = document.getElementById('quedadaDistanciaKm');
    const elTiempo = document.getElementById('quedadaTiempoMin');

    if (elPuntos) elPuntos.textContent = marcadoresRuta.length;
    if (elDist) elDist.textContent = `${distKm} km`;
    if (elTiempo) elTiempo.textContent = `${tiempoMin} min`;
}

export async function iniciarCreacionQuedadaClub(clubIdPreseleccionado = null) {
    if (!appState.sesionActual || appState.esInvitado) {
        alert("Debes iniciar sesión con tu cuenta para planificar y publicar quedadas.");
        if (window.abrirModalAuth) window.abrirModalAuth();
        return;
    }

    // Comprobar clubes a los que pertenece el usuario
    let misClubes = ClubState.myClubs || [];
    if (!misClubes || misClubes.length === 0) {
        try {
            const { data } = await supabaseClient.rpc('obtener_clubs_usuario', { p_user_id: appState.sesionActual.user.id });
            if (data && data.length) {
                ClubState.myClubs = data;
                misClubes = data;
            }
        } catch (_) {}
    }

    if (!misClubes || misClubes.length === 0) {
        alert("Aún no perteneces a ningún club. Funda un club o únete a uno existente para organizar quedadas.");
        if (window.Club && window.Club.abrirModal) window.Club.abrirModal();
        return;
    }

    // Poblar selector de club
    const select = document.getElementById('quedadaClubSelect');
    if (select) {
        select.innerHTML = misClubes.map(c => `
            <option value="${c.club_id}" ${c.club_id === clubIdPreseleccionado || c.club_id === ClubState.activeId ? 'selected' : ''}>
                ${esc(c.nombre)}
            </option>
        `).join('');
    }

    // Restricción estricta de fecha: máximo 7 días a la fecha actual
    const hoy = new Date();
    const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const maxStr = maxDate.toISOString().slice(0, 10);

    const fechaInput = document.getElementById('quedadaFechaInput');
    if (fechaInput) {
        fechaInput.min = hoyStr;
        fechaInput.max = maxStr;
        if (!fechaInput.value || fechaInput.value < hoyStr || fechaInput.value > maxStr) {
            fechaInput.value = hoyStr;
        }
    }

    // Cerrar modales si estuvieran abiertos
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    if (window.Club && window.Club.cerrarClubProfileView) window.Club.cerrarClubProfileView();

    // Desplegar panel Pro si estuviera colapsado
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    // Limpiar trazado anterior y activar modo multipunto
    limpiarRuta();
    if (!modoRutaLibreActivo) {
        toggleRutaLibre();
    }
    modoQuedadaClubActivo = true;

    // Mostrar panel flotante del mapa
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.remove('hidden');

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
        msg.innerHTML = "📍 MODO QUEDADA: Toca el mar para trazar la ruta multipunto";
    }

    actualizarMetricasQuedada();

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
}

export function cancelarCreacionQuedadaClub() {
    modoQuedadaClubActivo = false;
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.add('hidden');

    limpiarRuta();
    if (modoRutaLibreActivo) {
        toggleRutaLibre();
    }

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-teal-600 h-10 px-4 rounded-xl border border-teal-500 shadow-md flex items-center justify-center transition-colors";
        msg.innerHTML = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
    }
}

export function deshacerUltimoPuntoQuedada() {
    deshacerUltimoPunto();
    actualizarMetricasQuedada();
}

export function reiniciarPuntosQuedada() {
    reiniciarRutaMultipunto();
    actualizarMetricasQuedada();
}

export async function guardarQuedadaDesdeMapa() {
    const select = document.getElementById('quedadaClubSelect');
    const clubId = select ? select.value : null;
    if (!clubId) return alert("⚠️ Selecciona un club para publicar la quedada.");

    const tituloInput = document.getElementById('quedadaTituloInput');
    const nombre = tituloInput ? tituloInput.value.trim() : '';
    if (!nombre) return alert("⚠️ Asigna un nombre a la ruta/quedada (ej: Travesía al Faro).");

    const fechaVal = document.getElementById('quedadaFechaInput')?.value;
    const horaVal = document.getElementById('quedadaHoraInput')?.value;
    if (!fechaVal || !horaVal) return alert("⚠️ Selecciona la fecha y la hora de salida.");

    const fechaSeleccionada = new Date(`${fechaVal}T${horaVal}:00`);
    const ahora = new Date();

    if (fechaSeleccionada.getTime() < ahora.getTime()) {
        return alert("⚠️ La fecha y hora de la quedada no pueden ser en el pasado.");
    }

    const diffMs = fechaSeleccionada.getTime() - ahora.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);
    if (diffDias > 7) {
        return alert("⚠️ Para garantizar la exactitud de la previsión marina en vivo, las rutas solo se pueden crear con un máximo de 7 días de antelación.");
    }

    if (marcadoresRuta.length < 2) {
        return alert("⚠️ Debes trazar al menos 2 puntos en el mar para definir el recorrido de la quedada.");
    }

    const desc = document.getElementById('quedadaDescInput')?.value?.trim() || '';

    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distanciaKm = parseFloat((dt / 1000).toFixed(2));
    const tiempoMinutos = Math.round(((dt / 1000) / 4.5) * 60);
    const coordsArray = coords.map(c => [c.lat, c.lng]);

    const btn = document.getElementById('btnGuardarQuedadaMap');
    if (btn) { btn.disabled = true; btn.textContent = "Publicando..."; }

    try {
        const { data: newEv, error } = await supabaseClient
            .from('club_eventos')
            .insert([{
                club_id: clubId,
                creador_id: appState.sesionActual.user.id,
                nombre,
                descripcion: desc,
                fecha_evento: fechaSeleccionada.toISOString(),
                distancia_km: distanciaKm,
                tiempo_minutos: tiempoMinutos,
                ruta_json: coordsArray
            }])
            .select()
            .single();

        if (error) throw error;

        // Inscribir automáticamente al creador como asistente
        if (newEv && newEv.id) {
            try {
                await supabaseClient.from('club_eventos_asistentes').insert([{
                    evento_id: newEv.id,
                    user_id: appState.sesionActual.user.id
                }]);
            } catch (_) {}
        }

        alert("🎉 ¡Quedada publicada con éxito en el club!");

        // Cerrar planificador del mapa
        cancelarCreacionQuedadaClub();

        // Abrir directamente la pestaña Eventos del club correspondiente
        ClubState.activeId = clubId;
        if (window.Club && window.Club.abrirModal) {
            window.Club.abrirModal();
            setTimeout(() => {
                if (window.Club.cambiarVistaInterna) window.Club.cambiarVistaInterna('eventos');
            }, 400);
        }

    } catch (err) {
        console.error('[map] error al guardar quedada:', err);
        alert("Error al guardar la quedada: " + (err.message || err));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🚀 Publicar"; }
    }
}

export function cargarRutaEnMapaGrande(coordsData, nombre = 'Quedada') {
    let coords = coordsData;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    if (!Array.isArray(coords) || coords.length === 0) return;

    // Cerrar modales
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    if (window.Club && window.Club.cerrarClubProfileView) window.Club.cerrarClubProfileView();

    // Desplegar panel Pro si estuviera cerrado
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    limpiarRuta();

    const latLngs = coords.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
    if (lineaRuta) map.removeLayer(lineaRuta);
    lineaRuta = L.polyline(latLngs, { color: '#0284c7', weight: 5, opacity: 0.9 }).addTo(map);

    // Marcador de inicio (verde)
    marcadoresRuta.push(L.circleMarker(latLngs[0], { radius: 7, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 }).addTo(map));
    // Marcador de fin (rojo)
    if (latLngs.length > 1) {
        marcadoresRuta.push(L.circleMarker(latLngs[latLngs.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map));
    }

    map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors";
        msg.innerHTML = `🧭 Ruta del Club: ${esc(nombre)}`;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
}

export function cargarRutaDeportivaEnMapa(ruta) {
    if (!ruta) return;
    let coords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    if (!Array.isArray(coords) || coords.length === 0) {
        alert("Esta ruta no tiene coordenadas registradas para visualizar.");
        return;
    }

    // 1. Cerrar modales que tapen la vista
    if (typeof window.cerrarModalAuth === 'function') window.cerrarModalAuth();
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();

    // 2. Desplegar panel Pro si estuviera contraído
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    // 3. Limpiar capas previas en el mapa
    limpiarRuta();

    // 4. Formatear y añadir polilínea deportiva
    const latLngs = coords.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
    if (lineaRuta) map.removeLayer(lineaRuta);
    lineaRuta = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    // 5. Marcador de Inicio (Verde)
    const inicioIcon = L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏁</div>`,
        iconSize: [0, 0]
    });
    const mInicio = L.marker(latLngs[0], { icon: inicioIcon }).addTo(map).bindPopup("<b>Inicio de la Ruta</b>");
    marcadoresRuta.push(mInicio);

    // 6. Marcador de Fin (Rojo)
    if (latLngs.length > 1) {
        const finIcon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `<div class="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏆</div>`,
            iconSize: [0, 0]
        });
        const mFin = L.marker(latLngs[latLngs.length - 1], { icon: finIcon }).addTo(map).bindPopup("<b>Meta / Fin de Ruta</b>");
        marcadoresRuta.push(mFin);
    }

    // 7. Auto-ajuste de cámara
    map.fitBounds(lineaRuta.getBounds(), { padding: [50, 50] });

    // 8. Panel de estadísticas flotante
    const dist = Number(ruta.distance_km || ruta.distancia_km || 0).toFixed(2);
    const secs = Number(ruta.duration_seconds || (ruta.tiempo_minutos ? ruta.tiempo_minutos * 60 : 0));
    const mins = Math.max(1, Math.round(secs / 60));
    const avgSpd = Number(ruta.avg_speed || (mins > 0 ? (dist / (mins / 60)) : 0)).toFixed(1);
    const maxSpd = Number(ruta.max_speed || (avgSpd * 1.35)).toFixed(1);
    const titulo = ruta.title || 'Ruta Deportiva';

    if (ruta && ruta.id) {
        if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
        window.__rutasUsuarioCache.set(String(ruta.id), ruta);
    }

    const msg = document.getElementById('mapMsg');
    if (msg) {
        const rutaIdEsc = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : '';
        const btnCoach = ruta.id ? `
            <button type="button" onclick="if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>🧠</span> <span>Coach</span>
            </button>
        ` : '';

        msg.className = "text-xs font-bold text-white bg-slate-900/95 py-2.5 px-4 rounded-2xl border border-sky-500/40 shadow-2xl flex items-center justify-between gap-3 flex-wrap transition-all";
        msg.innerHTML = `
            <div class="flex items-center gap-3 flex-wrap">
                <span class="truncate max-w-[150px] text-sky-400 font-black">🧭 ${esc(titulo)}</span>
                <span class="text-white">📏 <b>${dist}</b> km</span>
                <span class="text-white">⏱️ <b>${mins}</b> min</span>
                <span class="text-amber-400">⚡ Med: <b>${avgSpd}</b> km/h</span>
                <span class="text-emerald-400">🚀 Max: <b>${maxSpd}</b> km/h</span>
            </div>
            ${btnCoach}
        `;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            if (lineaRuta) map.fitBounds(lineaRuta.getBounds(), { padding: [50, 50] });
        }
    }, 250);
}

// Retrocompatibilidad
export function activarModoPlanificacionEvento(clubId) {
    iniciarCreacionQuedadaClub(clubId);
}

export function guardarEventoClub() {
    guardarQuedadaDesdeMapa();
}

// ==========================================
export async function iniciarTravesia() {
    if(!appState.sesionActual && !appState.esInvitado) return alert("Inicia sesión.");
    if(!navigator.geolocation) return alert("Sin GPS.");
    
    if(livePolyline) { map.removeLayer(livePolyline); livePolyline = null; }
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    isTracking = true; trackDistanceKm = 0; trackCoords = []; ultimoPuntoCrudoGPS = null; lastPositionGPS = null; lastTimestampGPS = null; trackStartTime = new Date();
    
    const p = document.getElementById('liveTrackingPanel');
    p.innerHTML = `
        <div class="flex justify-between items-center mb-3 w-full">
            <span class="text-[10px] font-bold text-red-400 animate-pulse uppercase tracking-widest">🔴 Grabando GPS</span>
            <span id="liveTime" class="font-mono text-2xl font-black text-emerald-400">00:00</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center mb-3 w-full">
            <div class="bg-slate-800 rounded-xl py-2">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest">DISTANCIA</p>
                <p id="liveDist" class="font-black text-lg text-white">0.00 km</p>
            </div>
            <div class="bg-slate-800 rounded-xl py-2">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest">VELOCIDAD</p>
                <p id="liveSpeed" class="font-black text-lg text-white">0.0 km/h</p>
            </div>
        </div>
        <button type="button" onclick="finalizarTravesia()" class="w-full h-11 bg-red-600 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">⏹ Finalizar Travesía</button>
    `;
    p.classList.remove('hidden'); document.getElementById('btnIniciarLive').classList.add('hidden');
    if(document.getElementById('proDashboardResumen')) document.getElementById('proDashboardResumen').classList.replace('flex','hidden');
    if(document.getElementById('proPlanificador')) document.getElementById('proPlanificador').classList.replace('flex','hidden');
    
    if(lineaRuta) map.removeLayer(lineaRuta);
    livePolyline = L.polyline([], {color:'#ef4444', weight:5}).addTo(map);
    
    cronometroInterval = setInterval(() => {
        const s = Math.floor((new Date() - trackStartTime) / 1000);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`
            : `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
            
        const liveTimeEl = document.getElementById('liveTime');
        if (liveTimeEl) liveTimeEl.textContent = timeStr;
    }, 1000);
    
    watchId = navigator.geolocation.watchPosition(ps => {
        if(!isTracking) return;
        if (ps.coords.accuracy > 40) return;
        
        const lat6 = Number(ps.coords.latitude.toFixed(6));
        const lon6 = Number(ps.coords.longitude.toFixed(6));
        const puntoActual = [lat6, lon6];
        ultimoPuntoCrudoGPS = puntoActual;

        const l = L.latLng(lat6, lon6);
        const currentTimestamp = Date.now();

        // Siempre guardar el primer punto
        if (trackCoords.length === 0) {
            trackCoords.push(puntoActual);
            livePolyline.addLatLng(l); 
            map.panTo(l);
            lastPositionGPS = l;
            lastTimestampGPS = currentTimestamp;
            return;
        }

        if(lastPositionGPS && lastTimestampGPS) {
            const timeDiff = (currentTimestamp - lastTimestampGPS) / 1000;
            const mDist = (lastPositionGPS.distanceTo(l));
            
            const speedKmh = timeDiff > 0 ? (mDist / timeDiff) * 3.6 : 0;
            if (speedKmh > 25) return; 

            // Filtrar lecturas con distancia menor a 8 metros
            if (mDist < GPS_MIN_DISTANCIA_METROS) return;
            
            trackDistanceKm += (mDist / 1000);
            document.getElementById('liveDist').textContent = `${trackDistanceKm.toFixed(2)} km`;
            
            const uiSpeed = document.getElementById('liveSpeed');
            if (uiSpeed) uiSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;
        }
        
        trackCoords.push(puntoActual);
        livePolyline.addLatLng(l); 
        map.panTo(l);
        
        lastPositionGPS = l;
        lastTimestampGPS = currentTimestamp;
    }, e => {
        if (e.code === 1) alert('Permiso de ubicación denegado. Actívalo para registrar la travesía.');
    }, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
}

export async function finalizarTravesia() {
    if (!isTracking || isSavingRoute) return;
    isSavingRoute = true;
    isTracking = false; 
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    const m = Math.floor((new Date() - trackStartTime) / 60000);
    if(trackDistanceKm < 0.05 && m < 1) { alert("Ruta demasiado corta."); return restaurarTracker(); }
    if(appState.esInvitado) { alert(`🏅 ${trackDistanceKm.toFixed(2)} km en ${formatearTiempo(m)}.`); return restaurarTracker(); }
    
    document.getElementById('liveTrackingPanel').innerHTML = `
        <div class="text-center py-6 w-full">
            <span class="text-4xl block mb-2 animate-bounce">⏳</span>
            <p class="font-black text-white text-sm uppercase tracking-widest">Guardando...</p>
        </div>`;
        
    let img = null;
    let imgBase64Backup = null;
    try {
        if(livePolyline && trackCoords.length) map.fitBounds(livePolyline.getBounds());
        await new Promise(r => setTimeout(r, 1000));
        const cv = await html2canvas(document.getElementById('mapContainer'), {
            useCORS:true, backgroundColor:'#e2e8f0',
            ignoreElements: (el) => el.classList.contains('leaflet-control-container') || el.id === 'liveTrackingPanel'
        });
        
        imgBase64Backup = cv.toDataURL('image/jpeg', 0.8);
        
        const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
        const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}.jpg`;
        const {error:ue} = await supabaseClient.storage.from('paddlesafe').upload(fn, b, { upsert: true, contentType: 'image/jpeg' });
        if(!ue) {
            const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
            img = data.publicUrl;
        }
    } catch(e) { console.warn('Aviso no crítico al generar/subir canvas de ruta:', e); }
    
    // Asegurar que el último punto válido esté incluido en la ruta
    if (ultimoPuntoCrudoGPS && trackCoords.length > 0) {
        const lastCoord = trackCoords[trackCoords.length - 1];
        if (lastCoord[0] !== ultimoPuntoCrudoGPS[0] || lastCoord[1] !== ultimoPuntoCrudoGPS[1]) {
            trackCoords.push(ultimoPuntoCrudoGPS);
        }
    }

    const rutaNormalizada = normalizarYLimitarRutaGPS(trackCoords);
    const pts = Math.round(trackDistanceKm * 10) + m;
    
    const { data: nuevaRuta, error: errRuta } = await supabaseClient.from('rutas').insert([{
        user_id: appState.sesionActual.user.id,
        distancia_km: Number(trackDistanceKm.toFixed(2)),
        tiempo_minutos: m,
        ruta_json: rutaNormalizada,
        imagen_url: img,
        ubicacion: "Travesía GPS"
    }]).select().single();
    
    if (errRuta || !nuevaRuta) {
        let pendingMessage = "No se pudo conservar la ruta en este dispositivo.";
        try {
            localStorage.setItem('paddlesafe_ruta_pendiente', JSON.stringify({
                user_id: appState.sesionActual.user.id,
                km: trackDistanceKm,
                min: m,
                coords: rutaNormalizada,
                img,
                b64: imgBase64Backup,
                ts: Date.now()
            }));
            pendingMessage = "Se conserva una copia en este dispositivo";
        } catch (e) {
            console.warn('No se pudo guardar la ruta pendiente localmente:', e);
        }
        document.getElementById('liveTrackingPanel').innerHTML = `
            <div class="text-center py-4 w-full">
                <span class="text-4xl block mb-2">⚠️</span>
                <h3 class="font-black text-white text-lg">No se pudo guardar</h3>
                <p class="text-amber-300 font-bold text-[10px] uppercase tracking-widest mb-3">${pendingMessage}</p>
                <button type="button" onclick="restaurarTracker()" class="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
            </div>`;
        return;
    }
    
    if (ClubState.activeId) {
        await supabaseClient.from('club_rutas').insert([{ club_id: ClubState.activeId, ruta_id: nuevaRuta.id }]);
    }
    
    if(window.cargarPerfilUsuarioActivo) await window.cargarPerfilUsuarioActivo();
    
    document.getElementById('liveTrackingPanel').innerHTML = `
        <div class="text-center py-4 w-full">
            <span class="text-4xl block mb-2">✅</span>
            <h3 class="font-black text-white text-lg">Guardada</h3>
            <p class="text-emerald-400 font-bold text-[10px] uppercase tracking-widest mb-3">+${pts} pts</p>
            <button type="button" onclick="restaurarTracker()" class="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
        </div>`;
}

export async function sincronizarRutasPendientes() {
    if (isSyncingPendingRoute || !appState.sesionActual?.user?.id) return;
    isSyncingPendingRoute = true;
    try {
        const pendienteStr = localStorage.getItem('paddlesafe_ruta_pendiente');
        if (!pendienteStr) return;
        
        const p = JSON.parse(pendienteStr);
        if (!p.user_id) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            console.warn("Se eliminó una ruta pendiente heredada sin propietario para proteger la privacidad.");
            alert("Se descartó una ruta pendiente antigua porque no se puede verificar a qué cuenta pertenece.");
            return;
        }
        if (p.user_id !== appState.sesionActual.user.id) {
            console.warn("Ruta pendiente asociada a otra cuenta; se conserva sin sincronizar.");
            return;
        }
        
        let urlSincronizada = p.img || null;
        if (!urlSincronizada && p.b64) {
            try {
                const res = await fetch(p.b64);
                const blob = await res.blob();
                const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}_sync.jpg`;
                const { error: ue } = await supabaseClient.storage.from('paddlesafe').upload(fn, blob, { contentType: 'image/jpeg' });
                if (!ue) {
                    const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
                    urlSincronizada = data.publicUrl;
                }
            } catch(e) { console.warn("Fallo subiendo canvas offline:", e); }
        }

        const coordsNormalizadas = normalizarYLimitarRutaGPS(p.coords);

        const { error } = await supabaseClient.from('rutas').insert([{
            user_id: appState.sesionActual.user.id,
            distancia_km: Number(p.km.toFixed(2)),
            tiempo_minutos: p.min,
            ruta_json: coordsNormalizadas,
            imagen_url: urlSincronizada || p.img,
            ubicacion: "Travesía GPS (Sincronización Offline)"
        }]);
        
        if (!error) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            const pts = Math.round(p.km * 10) + p.min;
            alert(`¡Ruta guardada offline sincronizada con éxito! (+${pts} pts)`);
            if (window.cargarPerfilUsuarioActivo) await window.cargarPerfilUsuarioActivo();
        }
    } catch (e) {
        console.warn("Error al intentar sincronizar ruta pendiente:", e);
    } finally {
        isSyncingPendingRoute = false;
    }
}

export function restaurarTracker() {
    isSavingRoute = false;
    document.getElementById('liveTrackingPanel').classList.add('hidden'); document.getElementById('btnIniciarLive').classList.remove('hidden');
    if(document.getElementById('proPlanificador')) { document.getElementById('proPlanificador').classList.remove('hidden'); document.getElementById('proPlanificador').classList.add('flex'); }
}

// ==========================================
// COACH (MOTOR INTELIGENTE SUP)
// ==========================================

export async function solicitarCoachIAPro(dx, userLvl, distMetros, tiempoMinutos, lat, lon, fechaD, horaSalida, tramosData = []) {
    const bodyCont = document.getElementById('proCoachBody');
    const badgeLvl = document.getElementById('proCoachLevelBadge');
    if (!bodyCont) return;

    if (badgeLvl) badgeLvl.textContent = `Nivel: ${userLvl || 'Intermedio'}`;

    const wkVal = dx.windSpeed !== undefined ? dx.windSpeed : (dx.wind_speed || 0);
    const gustsVal = dx.windGusts !== undefined && dx.windGusts !== null ? dx.windGusts : (dx.wind_gusts || (wkVal * 1.35));
    const wv = (dx.waveHeight !== undefined && dx.waveHeight !== null) ? parseFloat(dx.waveHeight) : (dx.wave_height ? parseFloat(dx.wave_height) : 0);
    const wPeriod = (dx.wavePeriod !== undefined && dx.wavePeriod !== null && dx.wavePeriod !== "--") ? parseFloat(dx.wavePeriod) : 0;
    const tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    const tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    const pm = (dx.precipitation !== undefined && dx.precipitation !== null && dx.precipitation !== "") ? dx.precipitation : 0;
    const pl = (dx.precipProbability !== undefined && dx.precipProbability !== null && dx.precipProbability !== "") ? dx.precipProbability : (dx.precipitation_probability || 0);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null && dx.uvIndex !== "--") ? dx.uvIndex : 0;

    const payload = {
        condiciones: {
            viento: Number((wkVal * 3.6).toFixed(1)),
            rachas: Number((gustsVal * 3.6).toFixed(1)),
            direccion: Number(dx.windDirection) || 0,
            oleaje: Number(wv.toFixed(1)),
            periodo: Number(wPeriod),
            tempAire: tempAireValue,
            tempAgua: tempAguaValue,
            lluvia: Number(pm),
            precipProb: Number(pl),
            uv: Number(uv),
            distanciaKm: distMetros > 0 ? Number((distMetros / 1000).toFixed(2)) : 0,
            duracionMin: tiempoMinutos > 0 ? Math.round(tiempoMinutos) : 60,
            ubicacion: `${lat}, ${lon}`,
            tramos_data: tramosData,
            lat,
            lon
        },
        userLevel: userLvl || "Intermedio"
    };

    // 1. RENDERIZADO INMEDIATO (0ms): Sin tiempos de espera ni bloqueos ("pensando")
    renderizarCoachProFallbackLocal(payload.condiciones, userLvl, tramosData);

    // 2. Consulta en segundo plano opcional y no bloqueante
    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=coach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, 2500);

        const data = await resp.json();
        if (data.ok && data.coach && (data.coach.resumen || data.coach.veredicto)) {
            renderizarCoachProCard(data.coach, data.fuente, userLvl);
        }
    } catch (e) {
        // Silencioso: el análisis experto completo ya está visible al usuario desde el milisegundo 0
    }
}

export function renderizarCoachProCard(coach, fuente, userLvl) {
    const bodyCont = document.getElementById('proCoachBody');
    const badgeLvl = document.getElementById('proCoachLevelBadge');
    const badgeScore = document.getElementById('proCoachScoreBadge');
    if (!bodyCont || !coach) return;

    const score = Math.max(0, Math.min(100, Math.round(Number(coach.score) || 70)));
    let scoreBadgeCls = "bg-emerald-950/80 text-emerald-300 border-emerald-500/40";
    let scoreBarBg = "bg-emerald-500";
    let scoreIcon = "🟢";

    if (score < 45) {
        scoreBadgeCls = "bg-rose-950/80 text-rose-300 border-rose-500/40";
        scoreBarBg = "bg-rose-500";
        scoreIcon = "🔴";
    } else if (score < 75) {
        scoreBadgeCls = "bg-amber-950/80 text-amber-300 border-amber-500/40";
        scoreBarBg = "bg-amber-500";
        scoreIcon = "🟡";
    }

    if (badgeLvl) badgeLvl.textContent = `Nivel: ${userLvl || 'Intermedio'}`;
    if (badgeScore) {
        badgeScore.className = `text-xs font-black font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${scoreBadgeCls}`;
        badgeScore.innerHTML = `<span>${scoreIcon}</span> Score SUP: ${score}/100`;
    }

    // Normalización defensiva de dureza
    const dureza = (coach.dureza_ruta && typeof coach.dureza_ruta === 'object')
        ? {
            nivel: coach.dureza_ruta.nivel || "Moderada (5/10)",
            descripcion: coach.dureza_ruta.descripcion || "Exigencia física media acorde a la distancia y viento previsto."
        }
        : {
            nivel: typeof coach.dureza_ruta === 'string' ? coach.dureza_ruta : "Moderada (5/10)",
            descripcion: "Exigencia física acorde a la distancia y viento previsto."
        };

    // Normalización defensiva de estrategia_viento
    const estViento = (coach.estrategia_viento && typeof coach.estrategia_viento === 'object')
        ? {
            tramo_facil: coach.estrategia_viento.tramo_facil || "Aprovecha los tramos con viento a favor para deslizar la tabla.",
            tramo_exigente: coach.estrategia_viento.tramo_exigente || "Rema con postura baja en los tramos contra el viento.",
            consejo_pacing: coach.estrategia_viento.consejo_pacing || "Sal contra el viento y guarda un 30% de energía para el regreso."
        }
        : {
            tramo_facil: typeof coach.estrategia_viento === 'string' ? coach.estrategia_viento : "Aprovecha los tramos con viento a favor para deslizar la tabla.",
            tramo_exigente: "Rema con postura baja en los tramos contra el viento.",
            consejo_pacing: "Sal contra el viento y guarda un 30% de energía para el regreso."
        };

    // Normalización defensiva de análisis de zona y peligros
    let rawPeligros = coach.analisis_zona?.peligros_detectados || coach.peligros_detectados || [];
    if (typeof rawPeligros === 'string') rawPeligros = [rawPeligros];
    if (!Array.isArray(rawPeligros)) rawPeligros = [];

    const zona = (coach.analisis_zona && typeof coach.analisis_zona === 'object')
        ? {
            orografia: coach.analisis_zona.orografia || "Costa abierta con exposición normal al viento.",
            peligros_detectados: rawPeligros,
            recomendacion_seguridad: coach.analisis_zona.recomendacion_seguridad || ""
        }
        : {
            orografia: typeof coach.analisis_zona === 'string' ? coach.analisis_zona : "Costa abierta con exposición normal al viento.",
            peligros_detectados: rawPeligros.length > 0 ? rawPeligros : ["Atención a posibles ráfagas en salientes y cabos."],
            recomendacion_seguridad: "Mantén navegación paralela a la costa."
        };

    let consejosNivel = [];
    if (Array.isArray(coach.consejos_nivel) && coach.consejos_nivel.length > 0) {
        consejosNivel = coach.consejos_nivel;
    } else if (typeof coach.consejos_nivel === 'string' && coach.consejos_nivel) {
        consejosNivel = [coach.consejos_nivel];
    } else if (Array.isArray(coach.tecnica_postura) && coach.tecnica_postura.length > 0) {
        consejosNivel = coach.tecnica_postura;
    } else if (typeof coach.tecnica_postura === 'string' && coach.tecnica_postura) {
        consejosNivel = [coach.tecnica_postura];
    } else {
        consejosNivel = ["Mantén flexión de rodillas y mirada al horizonte."];
    }

    const peligrosArr = Array.isArray(zona.peligros_detectados) ? zona.peligros_detectados : [];
    const peligrosHtml = peligrosArr.length > 0
        ? peligrosArr.map(p => `
            <li class="flex items-start gap-2 text-xs text-amber-200/90">
                <span class="text-amber-400 shrink-0 text-sm">⚠️</span>
                <span class="leading-relaxed">${esc(p)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Sin peligros orográficos severos detectados.</li>';

    const consejosNivelHtml = consejosNivel.map(c => `
        <li class="flex items-start gap-2 text-xs text-slate-200">
            <span class="text-teal-400 shrink-0 text-sm">🏄</span>
            <span class="leading-relaxed">${esc(c)}</span>
        </li>
    `).join('');

    let segArr = coach.seguridad_estrategia;
    if (typeof segArr === 'string') segArr = [segArr];
    if (!Array.isArray(segArr)) segArr = [];
    const seguridadItems = segArr.length > 0
        ? segArr.map(item => `
            <li class="flex items-start gap-2 text-xs text-slate-200">
                <span class="text-sky-400 shrink-0 text-sm">🛡️</span>
                <span class="leading-relaxed">${esc(item)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Sin alertas críticas de seguridad.</li>';

    let matArr = coach.material_recomendado;
    if (typeof matArr === 'string') matArr = [matArr];
    if (!Array.isArray(matArr)) matArr = [];
    const materialItems = matArr.length > 0
        ? matArr.map(item => `
            <li class="flex items-start gap-2 text-xs text-slate-200">
                <span class="text-amber-400 shrink-0 text-sm">🎒</span>
                <span class="leading-relaxed">${esc(item)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Leash obligatorio y chaleco 50N.</li>';

    const fuenteLabel = fuente && fuente.includes("gemini")
        ? "✨ Análisis del Coach"
        : "🌊 Motor Experto PaddleSafe (FESurfing / ISA)";

    bodyCont.innerHTML = `
        <!-- Veredicto Principal del Coach -->
        <div class="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 shadow-md flex flex-col gap-2.5">
            <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
                <span class="font-black text-xs uppercase tracking-wider text-white flex items-center gap-1.5">
                    <span>🧭</span> ${esc(coach.veredicto || 'EVALUACIÓN DEL DÍA')}
                </span>
                <span class="text-[11px] font-mono text-emerald-400 font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/20">${score}/100</span>
            </div>
            <p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(coach.resumen || '')}</p>
            <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden mt-0.5">
                <div class="${scoreBarBg} h-full rounded-full transition-all duration-700" style="width: ${score}%"></div>
            </div>
        </div>

        <!-- 1. DUREZA DE LA RUTA -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-rose-500/30 flex flex-col gap-2 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <span>⚡</span> Dureza & Demanda Física
                </span>
                <span class="text-[10px] font-black uppercase font-mono px-2 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-500/40">
                    ${esc(dureza.nivel || 'Moderada')}
                </span>
            </div>
            <p class="text-xs text-slate-200 leading-relaxed">${esc(dureza.descripcion || '')}</p>
        </div>

        <!-- 2. ESTRATEGIA DE VIENTO & DOWNWIND -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-emerald-500/30 flex flex-col gap-2.5 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>💨</span> Estrategia de Viento & Downwind
                </span>
                <span class="text-[10px] font-mono text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">Viento Favorable</span>
            </div>
            
            <!-- Tramo Favorable -->
            <div class="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30 flex items-start gap-2.5">
                <span class="text-emerald-400 shrink-0 text-base mt-0.5">🟢</span>
                <div class="flex-1">
                    <span class="text-[11px] font-black text-emerald-300 uppercase tracking-wide block mb-0.5">Cuándo será más fácil (A favor):</span>
                    <p class="text-xs text-slate-200 leading-relaxed">${esc(estViento.tramo_facil || '')}</p>
                </div>
            </div>

            <!-- Tramo Exigente -->
            <div class="bg-rose-950/25 p-3 rounded-xl border border-rose-500/30 flex items-start gap-2.5">
                <span class="text-rose-400 shrink-0 text-base mt-0.5">🔴</span>
                <div class="flex-1">
                    <span class="text-[11px] font-black text-rose-300 uppercase tracking-wide block mb-0.5">Tramo más exigente (En contra/Lateral):</span>
                    <p class="text-xs text-slate-200 leading-relaxed">${esc(estViento.tramo_exigente || '')}</p>
                </div>
            </div>

            <!-- Consejo Pacing -->
            <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-2">
                <span class="text-amber-400 shrink-0 text-sm">💡</span>
                <span class="leading-relaxed"><strong>Pacing y Energía:</strong> ${esc(estViento.consejo_pacing || '')}</span>
            </div>
        </div>

        <!-- 3. ANÁLISIS DE LA ZONA MARCADA EN EL MAPA -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-sky-500/30 flex flex-col gap-2.5 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <span>🗺️</span> Análisis de la Zona & Orografía
                </span>
                <span class="text-[10px] font-mono text-sky-300 font-bold bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">Relieve y Costa</span>
            </div>

            <p class="text-xs text-slate-300 font-medium">${esc(zona.orografia || '')}</p>

            <!-- Peligros / Dificultades Detectadas -->
            <div class="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 flex flex-col gap-1.5">
                <span class="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <span>⚠️</span> Dificultades detectadas en el spot:
                </span>
                <ul class="flex flex-col gap-2 mt-1">
                    ${peligrosHtml}
                </ul>
            </div>

            ${zona.recomendacion_seguridad ? `
            <div class="bg-sky-950/30 p-2.5 rounded-xl border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-2">
                <span class="shrink-0 text-sm">📍</span>
                <span class="leading-relaxed"><strong>Consejo para esta costa:</strong> ${esc(zona.recomendacion_seguridad)}</span>
            </div>
            ` : ''}
        </div>

        <!-- 4. BLOQUE DOBLE: TÉCNICA NIVEL Y MATERIAL -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Consejos por nivel -->
            <div class="bg-slate-800/70 rounded-2xl p-3.5 border border-teal-500/20 flex flex-col gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/50 pb-1.5">
                    <span>🏄</span> Claves Técnicas (${esc(userLvl || 'Intermedio')})
                </span>
                <ul class="flex flex-col gap-2">
                    ${consejosNivelHtml}
                </ul>
            </div>

            <!-- Material Clave -->
            <div class="bg-slate-800/70 rounded-2xl p-3.5 border border-amber-500/20 flex flex-col gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 border-b border-slate-700/50 pb-1.5">
                    <span>🎒</span> Material & Seguridad SUP
                </span>
                <ul class="flex flex-col gap-2">
                    ${materialItems}
                </ul>
            </div>
        </div>

        <!-- Regla de Oro -->
        ${coach.regla_oro ? `
        <div class="bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-teal-500/20 border border-amber-500/50 rounded-2xl p-3.5 text-center shadow-md">
            <span class="text-amber-300 font-black text-[10px] uppercase tracking-widest block mb-0.5">💡 Regla de Oro del Coach</span>
            <p class="text-white text-xs font-bold italic leading-relaxed">"${esc(coach.regla_oro)}"</p>
        </div>
        ` : ''}

        <!-- Pie de Información y Transparencia -->
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            <span>${fuenteLabel}</span>
            <span class="font-mono text-emerald-400 font-bold">PaddleSafe Coach</span>
        </div>
    `;
}

export function renderizarCoachProFallbackLocal(cond, userLvl, tramosData = []) {
    let score = 85;
    const seg = [];
    const tec = [];
    const mat = [];

    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const cardIdx = Math.round((((cond.direccion || 0) % 360) + 360) % 360 / 45) % 8;
    const cardinal = dirs[cardIdx];

    const isOffshore = ((cond.direccion || 0) >= 150 && (cond.direccion || 0) <= 240);

    if (cond.viento >= 18) {
        score -= 40;
        seg.push(`⛔ Viento fuerte (${cond.viento} km/h). Remar contra el viento en la ida con máxima precaución.`);
        tec.push("Flexiona rodillas y baja el centro de gravedad. Remada más corta y frecuente en la zona de proa.");
    } else if (cond.viento >= 12) {
        score -= 20;
        seg.push(`Viento moderado (${cond.viento} km/h de componente ${cardinal}). Planifica la ida contra el viento.`);
        tec.push("Adelanta la fase de agarre de la pala e inclina el torso levemente hacia el viento.");
    } else {
        tec.push("Excelente para trabajar rotación de tronco (core) y cadencia regular (45-50 SPM).");
    }

    if (isOffshore && cond.viento >= 10) {
        score -= 20;
        seg.push(`🚨 Alerta Viento Offshore (${cardinal}): Sopla hacia mar adentro. No te alejes de la orilla.`);
    }

    if (cond.oleaje > 0.8) {
        score -= 25;
        seg.push(`Oleaje de ${cond.oleaje}m: Cuidado al embarcar y desembarcar en orilla.`);
        tec.push("Postura escalonada con pies no alineados horizontalmente para ganar estabilidad en mar movido.");
    } else {
        tec.push("Pies paralelos centrados en el asa de transporte, peso repartido en las bolas de los pies.");
    }

    if (userLvl === "Principiante" && (cond.viento > 11 || cond.oleaje > 0.4)) {
        score -= 25;
        seg.push("Como principiante, manténte a menos de 100m de costa y cerca de zonas resguardadas.");
        tec.push("Si sientes inestabilidad o ráfagas repentinas, pasa a posición de rodillas de inmediato.");
    }

    mat.push(cond.oleaje > 0.7 ? "Leash recto fijado al tobillo para olas." : "Leash tipo coiled de rodilla para no arrastrar.");
    mat.push("Chaleco de flotabilidad 50N y funda de móvil estanca obligatorios.");

    // Dureza de la ruta local
    const dist = cond.distanciaKm || 0;
    let baseDureza = 3.0;
    if (dist > 6) baseDureza += 3.0;
    else if (dist > 3) baseDureza += 2.0;
    else if (dist > 1) baseDureza += 1.0;
    if (cond.viento > 14) baseDureza += 2.0;
    if (cond.oleaje > 0.6) baseDureza += 1.5;
    if (userLvl === "Principiante") baseDureza += 1.5;
    const scoreDureza = Math.max(1, Math.min(10, Math.round(baseDureza * 10) / 10));

    let durezaTexto = scoreDureza >= 7 ? "Alta / Exigente" : (scoreDureza >= 4.5 ? "Moderada / Intermedia" : "Baja / Plácida");
    let durezaDesc = scoreDureza >= 6
        ? `Ruta con demanda física notable (${scoreDureza}/10). La combinación de ${dist > 0 ? dist + ' km' : 'distancia'} con viento de ${cond.viento} km/h generará fatiga muscular en hombros y piernas tras los primeros 30 minutos.`
        : `Sesión de demanda física asequible (${scoreDureza}/10). Buenas condiciones para completar la distancia con ritmo estable y sin sobrecargas musculares.`;

    // Estrategia de viento local
    let tramoFavor = null;
    let tramoContra = null;
    if (Array.isArray(tramosData) && tramosData.length > 0) {
        for (const t of tramosData) {
            const vRel = (t.viento_relativo || "").toUpperCase();
            if (vRel.includes("FAVOR") && !tramoFavor) tramoFavor = t;
            if (vRel.includes("CONTRA") && !tramoContra) tramoContra = t;
        }
    }

    const rumboDownwind = Math.round(((cond.direccion || 0) + 180) % 360);
    const cardDownwind = dirs[Math.round(((rumboDownwind % 360) + 360) % 360 / 45) % 8];

    const tramoFacilTxt = tramoFavor
        ? `El tramo más fácil será "${tramoFavor.nombre}" (rumbo ${tramoFavor.rumbo}°): contarás con viento a favor (downwind) de componente ${cardinal} que impulsará tu avance con mínimo esfuerzo.`
        : `Navegar con rumbo ~${rumboDownwind}° (${cardDownwind}) será el momento más fácil y fluido gracias al viento a favor empujando la popa.`;

    const tramoDuroTxt = tramoContra
        ? `Atención al tramo "${tramoContra.nombre}": remarás contra viento (${cond.viento} km/h). Rema inclinado hacia proa y baja el centro de gravedad.`
        : `Evita regresar con rumbo directo hacia el viento (${cardinal}) cuando estés cansado; planifica bordadas suaves pegadas a la orilla.`;

    const peligrosZona = [];
    if (isOffshore && cond.viento >= 10) {
        peligrosZona.push(`Viento terral (offshore): Sopla hacia el mar abierto. El agua parece engañosamente plana cerca de la orilla pero empuja hacia fuera.`);
    }
    if (cond.viento >= 14) {
        peligrosZona.push("Aceleración de viento en salientes y cabos rocosos (Efecto Venturi).");
    }
    if (cond.oleaje >= 0.6) {
        peligrosZona.push("Efecto clapotis (mar cruzado) cerca de paredes de roca o espigones.");
    }
    peligrosZona.push("Presta atención al calado de la quilla en la entrada y salida de la playa o cala.");

    const consejosNivelLoc = [];
    if (userLvl === "Principiante") {
        consejosNivelLoc.push("Si sientes rachas de viento o desequilibrio, siéntate o ponte de rodillas (kneeling paddle) inmediatamente para no derivar.");
        consejosNivelLoc.push("Mantén siempre una referencia visual fija en tierra para controlar la deriva lateral.");
    } else if (userLvl === "Intermedio") {
        consejosNivelLoc.push("Inicia la salida remando contra el viento para que el tramo de regreso sea con viento a favor (downwind).");
        consejosNivelLoc.push("Usa la rotación del tronco (core) para traccionar con la pala y no cargues los bíceps.");
    } else {
        consejosNivelLoc.push("En tramos a favor con ondulación, bombea con 2 paladas enérgicas para coger la pendiente y planea atrasando el pie dominante.");
        consejosNivelLoc.push("Mantén monitoreo constante de la evolución de las rachas de viento y salidas de emergencia en la costa.");
    }

    score = Math.max(15, Math.min(100, score));

    const coachLocal = {
        score,
        veredicto: score >= 75 ? "CONDICIONES APROPIADAS PARA SUP" : (score >= 50 ? "PRECAUCIÓN Y ATENCIÓN ACTIVA" : "CONDICIONES EXIGENTES - EVALÚA SALIR"),
        resumen: `Análisis para nivel ${userLvl}: Viento de ${cond.viento} km/h (${cardinal}) y oleaje de ${cond.oleaje}m. Planifica tu navegación adaptando tu ritmo a la dirección del viento.`,
        dureza_ruta: {
            nivel: `${durezaTexto} (${scoreDureza}/10)`,
            descripcion: durezaDesc
        },
        estrategia_viento: {
            tramo_facil: tramoFacilTxt,
            tramo_exigente: tramoDuroTxt,
            consejo_pacing: "Regla del 30%: Sal siempre contra el viento mientras estés fresco y guarda un tercio de energía para la vuelta."
        },
        analisis_zona: {
            orografia: "Costa con influencia del viento y relieve marítimo local.",
            peligros_detectados: peligrosZona,
            recomendacion_seguridad: "Navega respetando distancia con bañistas y mantén línea de costa a la vista."
        },
        consejos_nivel: consejosNivelLoc,
        seguridad_estrategia: seg,
        tecnica_postura: tec,
        material_recomendado: mat,
        regla_oro: userLvl === "Principiante"
            ? "¡Ante cualquier racha imprevista: a rodillas, manos bajas y rema con calma hacia la orilla!"
            : "Reserva siempre un 30% de tus fuerzas y agua para el tramo final del regreso."
    };

    renderizarCoachProCard(coachLocal, "coach-experto-sup (instantáneo)", userLvl);
}

export async function solicitarCoachIABasico(dx, userLvl, loc) {
    const cont = document.getElementById('basicCoachContainer');
    if (!cont) return;

    cont.classList.remove('hidden');

    const wkVal = dx.windSpeed !== undefined ? dx.windSpeed : (dx.wind_speed || 0);
    const gustsVal = dx.windGusts !== undefined && dx.windGusts !== null ? dx.windGusts : (dx.wind_gusts || (wkVal * 1.35));
    const wv = (dx.waveHeight !== undefined && dx.waveHeight !== null) ? parseFloat(dx.waveHeight) : (dx.wave_height ? parseFloat(dx.wave_height) : 0);
    const wPeriod = (dx.wavePeriod !== undefined && dx.wavePeriod !== null && dx.wavePeriod !== "--") ? parseFloat(dx.wavePeriod) : 0;
    const tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    const tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    const pm = (dx.precipitation !== undefined && dx.precipitation !== null && dx.precipitation !== "") ? dx.precipitation : 0;
    const pl = (dx.precipProbability !== undefined && dx.precipProbability !== null && dx.precipProbability !== "") ? dx.precipProbability : (dx.precipitation_probability || 0);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null && dx.uvIndex !== "--") ? dx.uvIndex : 0;

    const payload = {
        condiciones: {
            viento: Number((wkVal * 3.6).toFixed(1)),
            rachas: Number((gustsVal * 3.6).toFixed(1)),
            direccion: Number(dx.windDirection) || 0,
            oleaje: Number(wv.toFixed(1)),
            periodo: Number(wPeriod),
            tempAire: tempAireValue,
            tempAgua: tempAguaValue,
            lluvia: Number(pm),
            precipProb: Number(pl),
            uv: Number(uv),
            ubicacion: loc || "Spot de Costa"
        },
        userLevel: userLvl || "Intermedio"
    };

    // Renderizado local instantáneo a 0ms (sin bloqueo ni espera)
    const v = payload.condiciones.viento;
    const o = payload.condiciones.oleaje;
    const dir = payload.condiciones.direccion;
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const cardinal = dirs[Math.round(((dir % 360) + 360) % 360 / 45) % 8];
    const downwindDir = Math.round((dir + 180) % 360);
    const cardDownwind = dirs[Math.round(((downwindDir % 360) + 360) % 360 / 45) % 8];

    cont.innerHTML = `
        <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span class="font-black text-emerald-300 text-xs uppercase tracking-wider">✨ Coach (${esc(userLvl || 'Intermedio')})</span>
                <span class="text-[10px] text-slate-400 font-mono">Consejo Inmediato</span>
            </div>
            <p class="text-xs text-slate-200 leading-relaxed">
                ${v > 14 
                    ? `Viento notable de ${v} km/h (${cardinal}): Comienza navegando en contra del viento para que la vuelta sea con viento a favor (downwind) y menos exigente.` 
                    : `Viento plácido (${v} km/h) y mar accesible (${o}m): Condiciones idóneas para trabajar cadencia fluida y rotación del core.`}
            </p>
            <div class="text-[11px] text-emerald-300 flex items-start gap-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                <span class="shrink-0">💨</span>
                <span><strong>Momento más fácil:</strong> Con rumbo ~${downwindDir}° (${cardDownwind}) tendrás viento en popa que empujará la tabla.</span>
            </div>
            <div class="text-[11px] text-amber-200 flex items-start gap-1.5 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20">
                <span class="shrink-0">💡</span>
                <span class="italic font-semibold">Regla del 30%: Reserva siempre un tercio de tu energía y agua para el regreso a la orilla.</span>
            </div>
        </div>
    `;

    // Enriquecimiento opcional en segundo plano
    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=coach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, 2000);

        const data = await resp.json();
        if (data.ok && data.coach && (data.coach.resumen || data.coach.veredicto)) {
            const coach = data.coach;
            const score = Math.max(0, Math.min(100, Math.round(Number(coach.score) || 70)));
            let scoreCls = score >= 75 ? "text-emerald-400" : (score >= 45 ? "text-amber-400" : "text-rose-400");

            cont.innerHTML = `
                <div class="flex flex-col gap-2.5">
                    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-base">✨</span>
                            <span class="font-black text-emerald-300 text-xs uppercase tracking-wider">Coach (${esc(userLvl || 'Intermedio')})</span>
                        </div>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 ${scoreCls} border border-slate-700 font-bold">Score: ${score}/100</span>
                    </div>
                    <p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(coach.resumen || '')}</p>
                    ${coach.estrategia_viento && coach.estrategia_viento.tramo_facil ? `
                    <div class="text-[11px] text-emerald-300 flex items-start gap-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                        <span class="shrink-0">💨</span>
                        <span><strong>Viento a favor:</strong> ${esc(coach.estrategia_viento.tramo_facil)}</span>
                    </div>` : ''}
                    ${coach.seguridad_estrategia && coach.seguridad_estrategia[0] ? `
                    <div class="text-[11px] text-sky-300 flex items-start gap-1.5 bg-sky-950/40 p-2 rounded-lg border border-sky-500/20">
                        <span class="shrink-0">🛡️</span>
                        <span>${esc(coach.seguridad_estrategia[0])}</span>
                    </div>` : ''}
                    ${coach.regla_oro ? `
                    <div class="text-[11px] text-amber-200 flex items-start gap-1.5 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20">
                        <span class="shrink-0">💡</span>
                        <span class="italic font-semibold">${esc(coach.regla_oro)}</span>
                    </div>` : ''}
                </div>
            `;
        }
    } catch (e) {
        // Silencioso: el usuario ya tiene la tarjeta del Coach cargada
    }
}

window.buscarYCentrarMapa = buscarYCentrarMapa;
window.obtenerUbicacion = obtenerUbicacion;
window.toggleModoTravesia = toggleModoTravesia;
window.toggleRutaLibre = toggleRutaLibre;
window.deshacerUltimoPunto = deshacerUltimoPunto;
window.reiniciarRutaMultipunto = reiniciarRutaMultipunto;
window.consultarBasico = consultarBasico;
window.consultarPuntoProInstantaneo = consultarPuntoProInstantaneo;
window.consultarRutaPro = consultarRutaPro;
window.volverPlanificadorPro = volverPlanificadorPro;
window.solicitarCoachIAPro = solicitarCoachIAPro;
window.renderizarCoachProCard = renderizarCoachProCard;
window.solicitarCoachIABasico = solicitarCoachIABasico;
window.iniciarTravesia = iniciarTravesia;
window.finalizarTravesia = finalizarTravesia;
window.restaurarTracker = restaurarTracker;
window.inicializarMapa = inicializarMapa;
window.activarModoPlanificacionEvento = activarModoPlanificacionEvento;
window.guardarEventoClub = guardarEventoClub;
window.sincronizarRutasPendientes = sincronizarRutasPendientes;
window.normalizarYLimitarRutaGPS = normalizarYLimitarRutaGPS;
window.cargarRutaDeportivaEnMapa = cargarRutaDeportivaEnMapa;
window.addEventListener('online', () => {
    if (appState.sesionActual?.user?.id) void sincronizarRutasPendientes();
});

window.addEventListener('beforeunload', (event) => {
    if (isTracking) {
        const advertencia = "Tienes una travesía en curso. Si cierras la pestaña, se perderá el progreso no guardado.";
        event.returnValue = advertencia;
        return advertencia;
    }
});