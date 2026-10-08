// ====================================================
// js/map.js - MAPA, TRAZADOS, CLIMA Y TRACKING GPS
// ====================================================
import { supabaseClient, appState } from './config.js';
import { fetchConTimeout, esc, formatearTiempo, calcularVeredicto } from './utils.js';
import { ClubState } from './club/state.js';

const BACKEND_API_URL = 'https://paddlesafe-backend.vercel.app/api/backend';

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
export let lastPositionGPS = null;
export let lastTimestampGPS = null;
export let trackStartTime = null;
export let cronometroInterval = null;
export let watchId = null;
export let livePolyline = null;
export let clubParaEvento = null;

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
    resizeObserver.observe(document.getElementById('mapContainer'));
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
    const btnSave = document.getElementById('btnSaveClubEvent');
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
}

export function reiniciarRutaMultipunto() {
    limpiarRuta();
    document.getElementById('multipuntoToolbar').classList.replace('flex','hidden');
    document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir puntos";
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
    
    let hSalida = "12:00";
    if(r.includes("06:00")) hSalida = "06:00";
    else if(r.includes("18:00")) hSalida = "18:00";

    const payload = {
        fecha: d,
        horaSalida: hSalida,
        nivel: u || "Intermedio",
        coordenadas: loc,
        duracionRuta: 120
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
        } else { 
            res.textContent = "Error del servidor."; 
        }
    } catch(e) { 
        res.innerHTML = `<strong>Error de Red o Fallo de decodificación.</strong> Revisa tu conexión.`; 
        console.warn('Aviso no crítico (fetch meteo):', e); 
    } finally {
        btn.disabled = false; sp.classList.add('hidden'); bt.textContent = 'Análisis Básico Rápido';
    }
}

export async function consultarPuntoProInstantaneo(lat, lon, d, t) {
    const u = document.getElementById('proLevelOption').value || "Intermedio";
    const btn = document.getElementById('btnCalcPro');
    if(btn) { btn.disabled = true; btn.innerHTML = "Analizando punto..."; }
    
    const payload = {
        fecha: d,
        horaSalida: t || "12:00",
        nivel: u,
        coordenadas: `${lat},${lon}`,
        duracionRuta: 120
    };

    try {
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

    const payload = {
        fecha: d,
        horaSalida: t || "12:00",
        nivel: u,
        coordenadas: `${lat},${lon}`,
        duracionRuta: duracionEstimada
    };

    try {
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
// NUEVAS FUNCIONES DE PLANIFICACIÓN DE EVENTOS
// ==========================================
export function activarModoPlanificacionEvento(clubId) {
    clubParaEvento = clubId;
    
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows === "0fr") {
        document.getElementById("btnPro").click();
    }
    
    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
        msg.innerHTML = "📍 MODO PLANIFICACIÓN: Traza la ruta y elige Fecha/Hora abajo";
    }
    
    let btnSave = document.getElementById('btnSaveClubEvent');
    if (!btnSave) {
        const btnCalc = document.getElementById('btnCalcPro');
        btnSave = document.createElement('button');
        btnSave.id = 'btnSaveClubEvent';
        btnSave.className = 'w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all text-xs flex justify-center items-center gap-2 mt-3 cursor-pointer';
        btnSave.innerHTML = '💾 Guardar Evento del Club';
        btnSave.onclick = () => guardarEventoClub();
        if (btnCalc && btnCalc.parentElement) {
            btnCalc.parentElement.appendChild(btnSave);
        }
    } else {
        btnSave.classList.remove('hidden');
    }
    
    if (!modoTravesiaActivo && !modoRutaLibreActivo) {
        toggleRutaLibre();
    }
    
    document.getElementById('mapContainer').scrollIntoView({ behavior: 'smooth' });
}

export async function guardarEventoClub() {
    if (!clubParaEvento) return;
    
    const d = document.getElementById('proDate').value;
    const t = document.getElementById('proTime').value;
    
    if (!d || !t) return alert("⚠️ Selecciona una Fecha y Hora válida en el panel.");
    if (marcadoresRuta.length < 2) return alert("⚠️ Debes trazar al menos 2 puntos en el mapa para guardar el evento.");
    
    const fechaSeleccionada = new Date(`${d}T${t}:00`);
    const ahora = new Date();
    
    if (fechaSeleccionada.getTime() < ahora.getTime()) {
        return alert("⚠️ No puedes planificar un evento en una fecha u hora que ya ha pasado.");
    }
    
    const diffMs = fechaSeleccionada - ahora;
    const diffDias = diffMs / (1000 * 60 * 60 * 24);
    if (diffDias > 7) {
        return alert("⚠️ Solo puedes planificar eventos con un máximo de 7 días de antelación para garantizar la precisión de la meteorología marina en vivo.");
    }
    
    const nombre = prompt("📝 Asigna un nombre a esta Quedada (ej. Travesía a la Cueva):");
    if (!nombre || !nombre.trim()) return;
    
    const desc = prompt("💬 Breve descripción o material necesario (Opcional):") || "";
    
    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    let rutArray = [...coords];
    if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
    
    for(let i = 0; i < rutArray.length - 1; i++) {
        dt += rutArray[i].distanceTo(rutArray[i+1]);
    }
    
    const distanciaKm = (dt / 1000).toFixed(2);
    const tiempoMinutos = Math.round(((dt / 1000) / 4.5) * 60);
    const coordsArray = rutArray.map(c => [c.lat, c.lng]);
    const fechaIso = fechaSeleccionada.toISOString();
    
    const btn = document.getElementById('btnSaveClubEvent');
    btn.disabled = true; btn.innerHTML = "Guardando...";
    
    try {
        const { error } = await supabaseClient.from('club_eventos').insert([{
            club_id: clubParaEvento,
            creador_id: appState.sesionActual.user.id,
            nombre: nombre.trim(),
            descripcion: desc.trim(),
            fecha_evento: fechaIso,
            distancia_km: parseFloat(distanciaKm),
            tiempo_minutos: tiempoMinutos,
            ruta_json: coordsArray
        }]);
        
        if (error) throw error;
        
        alert("🎉 Quedada planificada y publicada en el club!");
        
        const savedClubId = clubParaEvento;
        clubParaEvento = null;
        btn.classList.add('hidden');
        
        const msg = document.getElementById('mapMsg');
        msg.className = "text-xs font-bold text-white bg-teal-600 h-10 px-4 rounded-xl border border-teal-500 shadow-md flex items-center justify-center transition-colors";
        msg.innerHTML = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
        
        limpiarRuta();
        if(modoRutaLibreActivo) toggleRutaLibre();
        if(modoTravesiaActivo) toggleModoTravesia();
        
        if (window.openClubProfile) {
            await window.openClubProfile(savedClubId);
            setTimeout(() => { if (window.cambiarTabClub) window.cambiarTabClub('eventos'); }, 500);
        }
        
    } catch(e) {
        console.warn(e);
        alert("❌ Error al guardar el evento.");
        btn.disabled = false; btn.innerHTML = '💾 Guardar Evento del Club';
    }
}

// ==========================================
export async function iniciarTravesia() {
    if(!appState.sesionActual && !appState.esInvitado) return alert("Inicia sesión.");
    if(!navigator.geolocation) return alert("Sin GPS.");
    
    if(livePolyline) { map.removeLayer(livePolyline); livePolyline = null; }
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    isTracking = true; trackDistanceKm = 0; trackCoords = []; lastPositionGPS = null; lastTimestampGPS = null; trackStartTime = new Date();
    
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
        
        const l = L.latLng(ps.coords.latitude, ps.coords.longitude);
        const currentTimestamp = Date.now();

        if(lastPositionGPS && lastTimestampGPS) {
            const timeDiff = (currentTimestamp - lastTimestampGPS) / 1000;
            const mDist = (lastPositionGPS.distanceTo(l));
            
            const speedKmh = timeDiff > 0 ? (mDist / timeDiff) * 3.6 : 0;
            if (speedKmh > 25) return; 
            
            trackDistanceKm += (mDist / 1000);
            document.getElementById('liveDist').textContent = `${trackDistanceKm.toFixed(2)} km`;
            
            const uiSpeed = document.getElementById('liveSpeed');
            if (uiSpeed) uiSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;
        }
        
        trackCoords.push([ps.coords.latitude, ps.coords.longitude]);
        livePolyline.addLatLng(l); 
        map.panTo(l);
        
        lastPositionGPS = l;
        lastTimestampGPS = currentTimestamp;
    }, e => {
        if (e.code === 1) alert('Permiso de ubicación denegado. Actívalo para registrar la travesía.');
    }, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
}

export async function finalizarTravesia() {
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
    
    const pts = Math.round(trackDistanceKm * 10) + m;
    
    const { data: nuevaRuta, error: errRuta } = await supabaseClient.from('rutas').insert([{
        user_id: appState.sesionActual.user.id,
        distancia_km: Number(trackDistanceKm.toFixed(2)),
        tiempo_minutos: m,
        ruta_json: trackCoords,
        imagen_url: img,
        ubicacion: "Travesía GPS"
    }]).select().single();
    
    if (errRuta || !nuevaRuta) {
        try { localStorage.setItem('paddlesafe_ruta_pendiente', JSON.stringify({ km: trackDistanceKm, min: m, coords: trackCoords, b64: imgBase64Backup, ts: Date.now() })); } catch (e) { console.warn('No se pudo usar localStorage', e); }
        document.getElementById('liveTrackingPanel').innerHTML = `
            <div class="text-center py-4 w-full">
                <span class="text-4xl block mb-2">⚠️</span>
                <h3 class="font-black text-white text-lg">No se pudo guardar</h3>
                <p class="text-amber-300 font-bold text-[10px] uppercase tracking-widest mb-3">Se conserva una copia en este dispositivo</p>
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
    try {
        const pendienteStr = localStorage.getItem('paddlesafe_ruta_pendiente');
        if (!pendienteStr) return;
        
        const p = JSON.parse(pendienteStr);
        if (!appState.sesionActual) return;
        
        let urlSincronizada = null;
        if (p.b64) {
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

        const { error } = await supabaseClient.from('rutas').insert([{
            user_id: appState.sesionActual.user.id,
            distancia_km: Number(p.km.toFixed(2)),
            tiempo_minutos: p.min,
            ruta_json: p.coords,
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
    }
}

export function restaurarTracker() {
    document.getElementById('liveTrackingPanel').classList.add('hidden'); document.getElementById('btnIniciarLive').classList.remove('hidden');
    if(document.getElementById('proPlanificador')) { document.getElementById('proPlanificador').classList.remove('hidden'); document.getElementById('proPlanificador').classList.add('flex'); }
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
window.iniciarTravesia = iniciarTravesia;
window.finalizarTravesia = finalizarTravesia;
window.restaurarTracker = restaurarTracker;
window.inicializarMapa = inicializarMapa;
window.activarModoPlanificacionEvento = activarModoPlanificacionEvento;
window.guardarEventoClub = guardarEventoClub;
window.sincronizarRutasPendientes = sincronizarRutasPendientes;

window.addEventListener('beforeunload', (event) => {
    if (isTracking) {
        const advertencia = "Tienes una travesía en curso. Si cierras la pestaña, se perderá el progreso no guardado.";
        event.returnValue = advertencia;
        return advertencia;
    }
});