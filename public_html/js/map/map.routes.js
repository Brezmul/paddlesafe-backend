// ==============================================================================
// PADDLESAFE NEXT-GEN - ROUTES & MULTIPOINT GPX ENGINE (map.routes.js)
// Modularized under Strangler Fig pattern from map.js
// Handles: Multi-Point Free Route, GPX Import/Export, Sports Route Viewer,
// Club Quedada Planner, Offline Map Tile Downloader, and SVG Profile Chart.
// ==============================================================================

import { supabaseClient, appState } from '../config.js';
import { ClubState } from '../club/state.js';
import { esc, kmhANudos, calcularSolYCrepusculo, formatearTiempo } from '../utils.js';
import { parseGPX, descargarGPX } from '../gpxParser.js';
import { mapRuntime } from './map.state.js';
import { solicitarPronostico, valorNumericoMeteo, crearFranjaForecast, obtenerMotorExperto } from './map.weather.js';
import { calcularBiometriaSup } from './map.tracker.js';
import { solicitarAnalisisIARutaDeportiva } from './map.coach.js';
import { obtenerVelocidadCruceroUsuario, descargarZonaMapaOffline } from './map.core.js';


/**
 * Activa / desactiva el modo de trazado multipunto libre.
 */
export function toggleRutaLibre() {
    if (mapRuntime.radarActivo && typeof window.desactivarModoRadar === 'function') {
        window.desactivarModoRadar();
    }
    if (mapRuntime.modoTravesiaActivo && typeof window.toggleModoTravesia === 'function') {
        window.toggleModoTravesia();
    }
    mapRuntime.modoRutaLibreActivo = !mapRuntime.modoRutaLibreActivo;
    const b = document.getElementById('btnRutaLibre');
    const msg = document.getElementById('mapMsg');
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);

    if (mapRuntime.modoRutaLibreActivo) {
        if (b) {
            b.classList.replace('bg-teal-600', 'bg-red-500');
            b.classList.replace('hover:bg-teal-500', 'hover:bg-red-400');
            b.innerHTML = "❌ Cancelar Multi...";
        }
        const leyenda = document.getElementById('leyendaMapa');
        if (leyenda) leyenda.classList.replace('flex', 'hidden');
        if (mapRuntime.marcador && currentMap) {
            currentMap.removeLayer(mapRuntime.marcador);
        }
        limpiarRuta();
        if (msg) msg.textContent = "📍 Toca el mapa para añadir puntos";
    } else {
        // Al desactivar Multipunto, limpiar también el modo Quedada Club si estaba activo
        if (mapRuntime.modoQuedadaClubActivo) {
            mapRuntime.modoQuedadaClubActivo = false;
            mapRuntime.clubParaEvento = null;
            const panelQuedada = document.getElementById('panelQuedadaMap');
            const formQuedada = document.getElementById('quedadaFormPanel');
            if (panelQuedada) panelQuedada.classList.add('hidden');
            if (formQuedada) formQuedada.classList.add('hidden');
            const btnQ = document.getElementById('btnQuedadaClub');
            if (btnQ) btnQ.innerHTML = "⛵ Quedada Club";
        }
        if (b) {
            b.classList.replace('bg-red-500', 'bg-teal-600');
            b.classList.replace('hover:bg-red-400', 'hover:bg-teal-500');
            b.innerHTML = "✍️ Multipunto";
        }
        const leyenda = document.getElementById('leyendaMapa');
        if (leyenda) leyenda.classList.replace('flex', 'hidden');
        const toolbar = document.getElementById('multipuntoToolbar');
        if (toolbar) toolbar.classList.replace('flex', 'hidden');
        limpiarRuta();
        if (currentMap && typeof L !== 'undefined') {
            mapRuntime.marcador = L.marker([mapRuntime.latitudActual, mapRuntime.longitudActual]).addTo(currentMap);
        }
        if (msg) msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
    }
}

/**
 * Limpia todas las capas activas de rutas, marcadores, polilíneas y etiquetas del mapa.
 */
export function limpiarRuta() {
    detenerReplayRuta();
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (mapRuntime.marcadoresRuta && currentMap) {
        mapRuntime.marcadoresRuta.forEach(m => {
            try { currentMap.removeLayer(m); } catch (_) {}
        });
        mapRuntime.marcadoresRuta.length = 0;
    }
    if (mapRuntime.lineaRuta && currentMap) {
        try { currentMap.removeLayer(mapRuntime.lineaRuta); } catch (_) {}
        mapRuntime.lineaRuta = null;
    }
    if (mapRuntime.lineasMultiPunto && currentMap) {
        mapRuntime.lineasMultiPunto.forEach(l => {
            try { currentMap.removeLayer(l); } catch (_) {}
        });
        mapRuntime.lineasMultiPunto.length = 0;
    }
    if (mapRuntime.etiquetasDistancia && currentMap) {
        mapRuntime.etiquetasDistancia.forEach(l => {
            try { currentMap.removeLayer(l); } catch (_) {}
        });
        mapRuntime.etiquetasDistancia.length = 0;
    }
    const contMulti = document.getElementById('proDashTramosContainer');
    if (contMulti) contMulti.innerHTML = "";
    const ploc = document.getElementById('proLocation');
    if (ploc) ploc.value = "";

    if (mapRuntime.marcadorRosaVectores && currentMap) {
        try { currentMap.removeLayer(mapRuntime.marcadorRosaVectores); } catch (_) {}
        mapRuntime.marcadorRosaVectores = null;
    }
    if (mapRuntime.marcadorReporteSpot && currentMap) {
        try { currentMap.removeLayer(mapRuntime.marcadorReporteSpot); } catch (_) {}
        mapRuntime.marcadorReporteSpot = null;
    }
    if (!mapRuntime.isTracking && mapRuntime.livePolyline && currentMap) {
        try { currentMap.removeLayer(mapRuntime.livePolyline); } catch (_) {}
        mapRuntime.livePolyline = null;
    }
    const hudEl = document.getElementById('mapWindWaveHud');
    if (hudEl) hudEl.classList.add('hidden');

    // Reset de seguridad para eventos de club
    mapRuntime.clubParaEvento = null;
    if (!mapRuntime.modoQuedadaClubActivo) {
        const panelQuedada = document.getElementById('panelQuedadaMap');
        const formQuedada = document.getElementById('quedadaFormPanel');
        if (panelQuedada) panelQuedada.classList.add('hidden');
        if (formQuedada) formQuedada.classList.add('hidden');
    }
}

/**
 * Gestiona el clic en el mapa para trazar una ruta simple Punto A -> Punto B.
 */
export function gestionarClicRuta(l) {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    const msg = document.getElementById('mapMsg');
    const ploc = document.getElementById('proLocation');
    const marcadores = mapRuntime.marcadoresRuta;

    if (marcadores.length === 0) {
        marcadores.push(L.marker(l, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(currentMap));
        if (msg) msg.textContent = "📍 Toca el PUNTO B (Llegada)";
        if (ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;
    } else if (marcadores.length === 1) {
        marcadores.push(L.marker(l, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(currentMap));
        mapRuntime.lineaRuta = L.polyline(marcadores.map(m => m.getLatLng()), {
            color: '#0ea5e9',
            weight: 4,
            dashArray: '5,10'
        }).addTo(currentMap);

        const p1 = marcadores[0].getLatLng();
        const p2 = marcadores[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;
        const etiq = L.marker([midLat, midLng], {
            icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] })
        }).addTo(currentMap);
        mapRuntime.etiquetasDistancia.push(etiq);
        currentMap.fitBounds(mapRuntime.lineaRuta.getBounds(), { padding: [50, 50] });
        if (msg) msg.textContent = "✅ Ruta marcada. Calcula abajo.";
    } else {
        // Permite corregir el Punto B sin borrar el Punto A
        currentMap.removeLayer(marcadores[1]);
        marcadores.pop();
        if (mapRuntime.lineaRuta) currentMap.removeLayer(mapRuntime.lineaRuta);
        mapRuntime.etiquetasDistancia.forEach(etiq => currentMap.removeLayer(etiq));
        mapRuntime.etiquetasDistancia.length = 0;

        marcadores.push(L.marker(l, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(currentMap));
        mapRuntime.lineaRuta = L.polyline(marcadores.map(m => m.getLatLng()), {
            color: '#0ea5e9',
            weight: 4,
            dashArray: '5,10'
        }).addTo(currentMap);

        const p1 = marcadores[0].getLatLng();
        const p2 = marcadores[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;

        const etiq = L.marker([midLat, midLng], {
            icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] })
        }).addTo(currentMap);
        mapRuntime.etiquetasDistancia.push(etiq);
        currentMap.fitBounds(mapRuntime.lineaRuta.getBounds(), { padding: [50, 50] });

        const panelPro = document.getElementById("panelPro");
        if (panelPro && panelPro.style.gridTemplateRows !== "0fr" && typeof window.consultarRutaPro === 'function') {
            window.consultarRutaPro();
        }
    }
}

/**
 * Gestiona el clic en el mapa para trazar puntos libres multipunto (A, B, C, D...).
 */
export function gestionarClicRutaLibre(l) {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    const lt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const i = mapRuntime.marcadoresRuta.length;
    const ploc = document.getElementById('proLocation');
    if (i === 0 && ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;

    mapRuntime.marcadoresRuta.push(L.marker(l, {
        icon: L.divIcon({
            className: '',
            html: `<div class="bg-marine text-white font-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white">${lt[i] || i}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(currentMap));

    const toolbar = document.getElementById('multipuntoToolbar');
    if (toolbar) toolbar.classList.replace('hidden', 'flex');
    document.getElementById('mapWindWaveHud')?.classList.add('hidden');
    document.getElementById('multipuntoToolbar')?.classList.replace('flex', 'hidden');
    document.getElementById('radarBottomBar')?.classList.add('hidden');

    if (mapRuntime.marcadoresRuta.length > 1) {
        const btnLibre = document.getElementById('btnRutaLibre');
        if (btnLibre) btnLibre.innerHTML = "✅ Terminar Trazado";
        renderPreviewRuta();
        const msg = document.getElementById('mapMsg');
        if (msg) msg.textContent = "Añade más puntos o calcula la ruta abajo.";
    }
    if (mapRuntime.modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

/**
 * Elimina el último punto trazado en la ruta multipunto.
 */
export function deshacerUltimoPunto() {
    const marcadores = mapRuntime.marcadoresRuta;
    if (!marcadores || !marcadores.length) return;
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap) currentMap.removeLayer(marcadores.pop());

    if (marcadores.length > 1) {
        renderPreviewRuta();
    } else if (marcadores.length === 0) {
        const toolbar = document.getElementById('multipuntoToolbar');
        if (toolbar) toolbar.classList.replace('flex', 'hidden');
        const msg = document.getElementById('mapMsg');
        if (msg) msg.textContent = "📍 Toca el mapa para añadir puntos";
        limpiarRuta();
    }
    if (mapRuntime.modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

/**
 * Reinicia la ruta multipunto completa.
 */
export function reiniciarRutaMultipunto() {
    limpiarRuta();
    const toolbar = document.getElementById('multipuntoToolbar');
    if (toolbar) toolbar.classList.replace('flex', 'hidden');
    const msg = document.getElementById('mapMsg');
    if (msg) msg.textContent = "📍 Toca el mapa para añadir puntos";
    if (mapRuntime.modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

/**
 * Conecta los puntos existentes en orden inverso para generar automáticamente la vuelta hacia el origen.
 */
export function cerrarIdaYVueltaMultipunto() {
    const marcadores = mapRuntime.marcadoresRuta;
    if (!marcadores || marcadores.length < 2) {
        alert("Traza al menos 2 puntos para generar el trayecto de ida y vuelta.");
        return;
    }

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    // Si la ruta ya regresa al punto inicial, evitar duplicar
    const pPrimero = marcadores[0].getLatLng();
    const pUltimo = marcadores[marcadores.length - 1].getLatLng();
    if (pPrimero.distanceTo(pUltimo) < 20) {
        alert("La ruta ya regresa al punto de salida.");
        return;
    }

    const puntosRetorno = marcadores.slice(0, -1).reverse();
    const lt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    puntosRetorno.forEach(m => {
        const l = m.getLatLng();
        const i = marcadores.length;
        const letra = lt[i] || `${i + 1}`;
        const marker = L.marker(l, {
            icon: L.divIcon({
                className: '',
                html: `<div class="bg-marine text-white font-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white">${letra}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(currentMap);
        marcadores.push(marker);
    });

    renderPreviewRuta();

    if (mapRuntime.modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    } else {
        const panelPro = document.getElementById("panelPro");
        if (panelPro && panelPro.style.gridTemplateRows !== "0fr" && typeof window.consultarRutaPro === 'function') {
            window.consultarRutaPro();
        }
    }
    const mapMsg = document.getElementById('mapMsg');
    if (mapMsg) mapMsg.textContent = "🔄 Trayecto de ida y vuelta generado. Consulta los tramos abajo.";
}

/**
 * Renderiza la previsualización de líneas punteadas y etiquetas de distancia entre tramos.
 */
export function renderPreviewRuta() {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    mapRuntime.lineasMultiPunto.forEach(l => currentMap.removeLayer(l));
    mapRuntime.lineasMultiPunto.length = 0;
    mapRuntime.etiquetasDistancia.forEach(l => currentMap.removeLayer(l));
    mapRuntime.etiquetasDistancia.length = 0;

    const c = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < c.length - 1; i++) {
        const pl = L.polyline([c[i], c[i + 1]], { color: '#64748b', weight: 3, dashArray: '5,5' }).addTo(currentMap);
        mapRuntime.lineasMultiPunto.push(pl);
        const dist = (c[i].distanceTo(c[i + 1]) / 1000).toFixed(2);
        const midLat = (c[i].lat + c[i + 1].lat) / 2;
        const midLng = (c[i].lng + c[i + 1].lng) / 2;
        const etiq = L.marker([midLat, midLng], {
            icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] })
        }).addTo(currentMap);
        mapRuntime.etiquetasDistancia.push(etiq);
    }
}

/**
 * Evalúa la influencia del viento en función del rumbo de navegación.
 */
export function evaluarVientoRelativoInfo(rumboNavegacion, direccionVientoOrigen) {
    if (!Number.isFinite(Number(rumboNavegacion)) || direccionVientoOrigen === null
        || direccionVientoOrigen === undefined || !Number.isFinite(Number(direccionVientoOrigen))) {
        return { texto: "DIRECCIÓN N/D", claseColor: "bg-slate-500/20 text-slate-300 border border-slate-500/50", modVelocidad: -0.5, colorRumbo: "text-slate-300", hexLineColor: "#94a3b8", icon: "⚠️" };
    }
    let diff = Math.abs(direccionVientoOrigen - rumboNavegacion);
    if (diff > 180) diff = 360 - diff;
    if (diff <= 45) return { texto: "EN CONTRA", claseColor: "bg-red-500/20 text-red-400 border border-red-500/50", modVelocidad: -1.5, colorRumbo: "text-red-400", hexLineColor: "#ef4444", icon: "🛑" };
    else if (diff >= 135) return { texto: "A FAVOR", claseColor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50", modVelocidad: 1.0, colorRumbo: "text-emerald-400", hexLineColor: "#10b981", icon: "🚀" };
    else return { texto: "LATERAL", claseColor: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50", modVelocidad: -0.5, colorRumbo: "text-yellow-400", hexLineColor: "#eab308", icon: "⚠️" };
}

// ==========================================
// PLANIFICADOR MULTIPUNTO DE QUEDADAS DE CLUB
// ==========================================

export function actualizarMetricasQuedada() {
    let dt = 0;
    const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distKm = (dt / 1000).toFixed(2);
    const tiempoMin = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);

    const elPuntos = document.getElementById('quedadaPuntosCount');
    const elLabelPuntos = document.getElementById('quedadaPuntosLabel');
    const elDist = document.getElementById('quedadaDistanciaKm');
    const elTiempo = document.getElementById('quedadaTiempoMin');

    if (elPuntos) elPuntos.textContent = mapRuntime.marcadoresRuta.length;
    if (elLabelPuntos) elLabelPuntos.textContent = mapRuntime.marcadoresRuta.length === 1 ? 'punto' : 'puntos';
    if (elDist) elDist.textContent = `${distKm} km`;
    if (elTiempo) elTiempo.textContent = `${tiempoMin} min`;

    const indicacion = document.getElementById('quedadaIndicacionMapa');
    if (indicacion) {
        if (mapRuntime.marcadoresRuta.length === 0) indicacion.textContent = 'Toca el mapa para marcar el primer punto';
        else if (mapRuntime.marcadoresRuta.length === 1) indicacion.textContent = 'Toca el mapa para añadir otro punto';
        else indicacion.textContent = 'Sigue añadiendo puntos o abre los datos';
    }
}

export async function evaluarMeteoParaQuedada() {
    const preview = document.getElementById('quedadaMeteoPreview');
    if (!preview) return;

    if (!mapRuntime.marcadoresRuta || mapRuntime.marcadoresRuta.length === 0) {
        preview.classList.remove('hidden');
        preview.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-center text-slate-400 text-xs">
                📍 Marca al menos un punto en el mar para consultar la previsión marina.
            </div>`;
        return;
    }

    const salida = mapRuntime.marcadoresRuta[0].getLatLng();
    const lat = salida.lat;
    const lon = salida.lng;

    const fechaVal = document.getElementById('quedadaFechaInput')?.value || new Date().toISOString().slice(0, 10);
    const horaVal = document.getElementById('quedadaHoraInput')?.value || '10:00';

    preview.classList.remove('hidden');
    preview.innerHTML = `
        <div class="bg-slate-800/80 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-center gap-2 text-indigo-300 font-bold text-xs">
            <span class="animate-spin">⏳</span> Evaluando previsión marina para ${fechaVal} ${horaVal}...
        </div>`;

    let dt = 0;
    const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distKm = dt / 1000;
    const duracionBaseMin = Math.max(30, Math.round((distKm / obtenerVelocidadCruceroUsuario()) * 60));

    try {
        const payload = {
            location: `${lat.toFixed(5)},${lon.toFixed(5)}`,
            date: fechaVal,
            timeRange: crearFranjaForecast(horaVal, duracionBaseMin),
            userLevel: 'Intermedio'
        };

        const p = await solicitarPronostico(payload);
        const dx = p.datos || {};
        dx.date = fechaVal;
        dx.fecha = fechaVal;
        dx.selected_date = fechaVal;
        dx.fechaConsulta = fechaVal;

        const wkVal = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
        const windKt = wkVal !== null ? kmhANudos(wkVal * 3.6) : null;
        const wgVal = valorNumericoMeteo(dx.windGust, dx.wind_gust, dx.rachas);
        const gustKt = wgVal !== null ? kmhANudos(wgVal * 3.6) : null;
        const dirViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const waveH = valorNumericoMeteo(dx.waveHeight, dx.wave_height);
        const motor = obtenerMotorExperto(dx, 'Intermedio');

        // Cálculo de tiempo sumando tramo a tramo con evaluarVientoRelativoInfo
        let tiempoAjustadoMin = 0;
        if (coords.length >= 2) {
            for (let i = 0; i < coords.length - 1; i++) {
                const lat1Rad = coords[i].lat * Math.PI / 180;
                const lon1Rad = coords[i].lng * Math.PI / 180;
                const lat2Rad = coords[i + 1].lat * Math.PI / 180;
                const lon2Rad = coords[i + 1].lng * Math.PI / 180;
                const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
                const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
                const rumboTramo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
                const dMetros = coords[i].distanceTo(coords[i + 1]);
                const infoV = evaluarVientoRelativoInfo(rumboTramo, dirViento);
                const velTramo = Math.max(1.5, obtenerVelocidadCruceroUsuario() + infoV.modVelocidad);
                tiempoAjustadoMin += ((dMetros / 1000) / velTramo) * 60;
            }
        } else {
            tiempoAjustadoMin = duracionBaseMin;
        }

        const tiempoFinalMin = Math.round(tiempoAjustadoMin);
        const elTiempo = document.getElementById('quedadaTiempoMin');
        if (elTiempo) elTiempo.textContent = `${tiempoFinalMin} min`;

        const cardD = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
        const idir = dirViento !== null ? Math.round((((dirViento % 360) + 360) % 360) / 45) % 8 : null;
        const dirTexto = idir !== null ? cardD[idir] : '--';

        const isOffshore = motor.componenteTierraMar === 'TERRAL' || motor.alertaDerivaMarAdentro || motor.riesgoDeriva === 'ALTO' || motor.riesgoDeriva === 'MUY ALTO';

        let semaforo = '🟢';
        let badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
        const rec = (motor.recomendacion || motor.veredicto || '').toUpperCase();
        if (rec.includes('PELIGRO') || rec.includes('EXTREMO') || rec.includes('NO RECOMENDADO')) {
            semaforo = '🔴';
            badgeColor = 'bg-red-500/20 text-red-400 border-red-500/40';
        } else if (rec.includes('ELEVADO') || rec.includes('DESFAVORABLE')) {
            semaforo = '🟠';
            badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/40';
        } else if (rec.includes('PRECAUCI') || rec.includes('MODERADO')) {
            semaforo = '🟡';
            badgeColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
        }

        const solarQ = calcularSolYCrepusculo(lat, lon, fechaVal);
        const timePartsQ = (horaVal || '10:00').split(':');
        const hhQ = parseInt(timePartsQ[0], 10) || 0;
        const mmQ = parseInt(timePartsQ[1], 10) || 0;
        const salidaMinQ = hhQ * 60 + mmQ;
        const llegadaMinQ = salidaMinQ + tiempoFinalMin;
        const hayRiesgoOcasoQ = llegadaMinQ >= (solarQ.sunsetMin - 30);
        let avisoOcasoHtml = '';
        if (hayRiesgoOcasoQ) {
            const retornoHH = String(Math.floor((llegadaMinQ % 1440) / 60)).padStart(2, '0');
            const retornoMM = String((llegadaMinQ % 1440) % 60).padStart(2, '0');
            avisoOcasoHtml = `
                <div class="mt-2 text-[10px] font-bold text-amber-200 bg-amber-950/60 border border-amber-500/40 rounded-lg p-2.5 flex items-start gap-2 shadow">
                    <span class="text-base shrink-0">🌇</span>
                    <div>
                        <strong class="text-amber-300">Alerta Ocaso:</strong> La quedada finalizará sobre las <strong>${retornoHH}:${retornoMM}</strong> (Ocaso: <strong>${solarQ.sunsetStr}</strong>). Sin luz solar el rescate es crítico.
                    </div>
                </div>
            `;
        }

        mapRuntime.cacheMeteoQuedada = {
            estado: motor.veredicto || motor.recomendacion || 'SEGURO',
            semaforo,
            windKt,
            gustKt,
            dirTexto,
            waveH,
            tiempoFinalMin,
            isOffshore
        };

        preview.innerHTML = `
            <div class="bg-slate-800/95 border border-indigo-500/40 rounded-xl p-3 shadow-lg">
                <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/70">
                    <span class="text-[10px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                        <span>🌊</span> Previsión Oficial Salida
                    </span>
                    <span class="text-xs px-2.5 py-0.5 rounded-full font-bold border ${badgeColor}">
                        ${semaforo} ${esc(mapRuntime.cacheMeteoQuedada.estado)}
                    </span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Viento</span>
                        <span class="text-xs font-black text-white">${windKt !== null ? windKt.toFixed(1) : '--'} kt</span>
                        <span class="text-[9px] text-slate-400 block">(${dirTexto})</span>
                    </div>
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Rachas</span>
                        <span class="text-xs font-black text-amber-300">${gustKt !== null ? gustKt.toFixed(1) : '--'} kt</span>
                        <span class="text-[9px] text-slate-400 block">Máx</span>
                    </div>
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Oleaje</span>
                        <span class="text-xs font-black text-sky-300">${waveH !== null ? waveH.toFixed(1) : '--'} m</span>
                        <span class="text-[9px] text-slate-400 block">Altura</span>
                    </div>
                </div>
                ${isOffshore ? `
                <div class="mt-2 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg p-2 flex items-center gap-2">
                    <span class="text-sm">⚠️</span>
                    <span><strong>Aviso Offshore:</strong> El viento sopla de tierra hacia mar adentro. Extrema precauciones por riesgo de deriva.</span>
                </div>` : ''}
                ${avisoOcasoHtml}
            </div>`;
    } catch (err) {
        console.warn('Error al evaluar meteo en quedada:', err);
        preview.innerHTML = `
            <div class="bg-slate-800/80 border border-amber-500/30 rounded-xl p-2.5 text-center text-amber-300 text-xs">
                ⚠️ No se pudo consultar la previsión marina en vivo. Podrás publicar la quedada igualmente.
            </div>`;
    }
}

export function mostrarFormularioQuedada() {
    const form = document.getElementById('quedadaFormPanel');
    if (!form || !mapRuntime.modoQuedadaClubActivo) return;
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void evaluarMeteoParaQuedada();
}

export function volverAlMapaQuedada() {
    const form = document.getElementById('quedadaFormPanel');
    const mapContainer = document.getElementById('mapContainer');
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (form) form.classList.add('hidden');
    if (mapContainer) {
        mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            if (currentMap) currentMap.invalidateSize();
        }, 350);
    }
}

export async function iniciarCreacionQuedadaClub(clubIdPreseleccionado = null) {
    if (mapRuntime.radarActivo && typeof window.desactivarModoRadar === 'function') {
        window.desactivarModoRadar();
    }
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

    // Si estaba activo el modo travesía A-B, cancelarlo primero
    if (mapRuntime.modoTravesiaActivo && typeof window.toggleModoTravesia === 'function') {
        window.toggleModoTravesia();
    }
    // Limpiar trazado anterior y activar modo multipunto
    limpiarRuta();
    if (!mapRuntime.modoRutaLibreActivo) {
        toggleRutaLibre();
    }
    mapRuntime.modoQuedadaClubActivo = true;

    const btnGuardarQuedada = document.getElementById('btnGuardarQuedadaMap');
    if (btnGuardarQuedada) btnGuardarQuedada.classList.remove('hidden');

    // Mantener libre el mapa durante el trazado; el formulario queda fuera del mapa.
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.remove('hidden');
    const form = document.getElementById('quedadaFormPanel');
    if (form) form.classList.add('hidden');

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
    mapRuntime.modoQuedadaClubActivo = false;
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.add('hidden');
    const form = document.getElementById('quedadaFormPanel');
    if (form) form.classList.add('hidden');

    limpiarRuta();
    if (mapRuntime.modoRutaLibreActivo) {
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

    if (mapRuntime.marcadoresRuta.length < 2) {
        return alert("⚠️ Debes trazar al menos 2 puntos en el mar para definir el recorrido de la quedada.");
    }

    const desc = document.getElementById('quedadaDescInput')?.value?.trim() || '';

    let dt = 0;
    const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distanciaKm = parseFloat((dt / 1000).toFixed(2));
    const tiempoMinutos = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);
    const coordsArray = coords.map(c => [c.lat, c.lng]);

    // Anexo meteorológico limpio en descripción
    let descFinal = desc;
    if (mapRuntime.cacheMeteoQuedada) {
        const mq = mapRuntime.cacheMeteoQuedada;
        const resumenMeteo = `Previsión PaddleSafe: ${mq.estado} | 💨 Viento: ${mq.windKt !== null ? mq.windKt.toFixed(1) : '--'} kt (${mq.dirTexto}) | 🌊 Olas: ${mq.waveH !== null ? mq.waveH.toFixed(1) : '--'} m`;
        descFinal = (descFinal ? `${descFinal}\n\n🌊 ${resumenMeteo}` : `🌊 ${resumenMeteo}`).trim();
    }

    const btn = document.getElementById('btnGuardarQuedadaMap');
    if (btn) { btn.disabled = true; btn.textContent = "Publicando..."; }

    try {
        const { data: newEv, error } = await supabaseClient
            .from('club_eventos')
            .insert([{
                club_id: clubId,
                creador_id: appState.sesionActual.user.id,
                nombre,
                descripcion: descFinal,
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

        // Anuncio automático en club_chat (no bloqueante)
        try {
            const fechaFmt = fechaSeleccionada.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + horaVal;
            const mq = mapRuntime.cacheMeteoQuedada;
            const meteoChatTxt = mq ? ` | 🌊 ${mq.estado} (💨 ${mq.windKt !== null ? mq.windKt.toFixed(1) : '--'} kt)` : '';
            const mensajeChat = `📅 Nueva Quedada: ${nombre} (${fechaFmt}) — 📏 ${distanciaKm.toFixed(1)} km (~${tiempoMinutos} min)${meteoChatTxt}`;
            await supabaseClient.from('club_chat').insert([{
                club_id: clubId,
                user_id: appState.sesionActual.user.id,
                mensaje: mensajeChat,
                visibility: 'club_only',
                is_public: false
            }]);
        } catch (errChat) {
            console.warn('Aviso no crítico al publicar mensaje de quedada en club_chat:', errChat);
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

/**
 * Carga una ruta de quedada o planificada en el visor principal de Leaflet.
 */
export function cargarRutaEnMapaGrande(coordsData, nombre = 'Quedada') {
    let coords = coordsData;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    if (!Array.isArray(coords) || coords.length === 0) return;

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    // Guardar referencia para análisis dinámico
    window._rutaClubCargadaActual = { coords, nombre };

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
    if (mapRuntime.lineaRuta) currentMap.removeLayer(mapRuntime.lineaRuta);
    mapRuntime.lineaRuta = L.polyline(latLngs, { color: '#0284c7', weight: 5, opacity: 0.9 }).addTo(currentMap);

    // Marcador de inicio (verde)
    mapRuntime.marcadoresRuta.push(L.circleMarker(latLngs[0], { radius: 7, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 }).addTo(currentMap));
    // Marcador de fin (rojo)
    if (latLngs.length > 1) {
        mapRuntime.marcadoresRuta.push(L.circleMarker(latLngs[latLngs.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(currentMap));
    }

    currentMap.fitBounds(mapRuntime.lineaRuta.getBounds(), { padding: [40, 40] });

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-3 sm:px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-between transition-colors";
        msg.innerHTML = `
            <span class="truncate mr-2">🧭 Ruta: <b>${esc(nombre)}</b></span>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="exportarRutaPlanificadaGPX()" class="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow cursor-pointer active:scale-95 flex items-center gap-1">📲 GPX</button>
                <button type="button" onclick="analizarVientoRutaClub()" class="shrink-0 px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow cursor-pointer active:scale-95">⚡ Analizar Viento</button>
            </div>
        `;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Consulta la previsión meteorológica tramo a tramo para una ruta de club y renderiza el dashboard de viento.
 */
export async function analizarVientoRutaClub(coordsData = null, nombre = null) {
    const info = coordsData ? { coords: coordsData, nombre: nombre || 'Quedada' } : window._rutaClubCargadaActual;
    if (!info || !info.coords || info.coords.length < 2) return;

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    let coords = info.coords;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    const latLngs = coords.map(pt => Array.isArray(pt) ? L.latLng(pt[0], pt[1]) : (pt.lat ? pt : L.latLng(pt[0], pt[1])));

    limpiarRuta();
    latLngs.forEach(ll => {
        const m = L.circleMarker(ll, { radius: 6, color: '#0ea5e9', fillColor: '#38bdf8', fillOpacity: 0.9 }).addTo(currentMap);
        mapRuntime.marcadoresRuta.push(m);
    });

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
        msg.innerHTML = "⏳ Consultando previsión marina y calculando tramos...";
    }

    try {
        const ahora = new Date();
        const dStr = ahora.toISOString().slice(0, 10);
        const tStr = String(ahora.getHours()).padStart(2, '0') + ":" + String(ahora.getMinutes()).padStart(2, '0');

        let dt = 0;
        for (let i = 0; i < latLngs.length - 1; i++) {
            dt += latLngs[i].distanceTo(latLngs[i + 1]);
        }
        const durMin = Math.max(30, Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60));

        const p = await solicitarPronostico({
            location: `${latLngs[0].lat.toFixed(5)},${latLngs[0].lng.toFixed(5)}`,
            date: dStr,
            timeRange: crearFranjaForecast(tStr, durMin),
            userLevel: 'Intermedio'
        });

        if (typeof window.renderizarDashboardPro === 'function') {
            window.renderizarDashboardPro(p.datos, tStr, 'Intermedio', true, latLngs[0].lat, latLngs[0].lng, dStr);
        }
        currentMap.fitBounds(L.polyline(latLngs).getBounds(), { padding: [40, 40] });

        if (msg) {
            msg.className = "text-xs font-bold text-white bg-emerald-600 h-10 px-4 rounded-xl border border-emerald-500 shadow-md flex items-center justify-center transition-colors";
            msg.innerHTML = `✅ Tramos calculados con viento: <b>${esc(info.nombre || 'Quedada')}</b>`;
        }
    } catch (err) {
        console.warn('Error al analizar viento en ruta de quedada:', err);
        if (msg) {
            msg.className = "text-xs font-bold text-white bg-amber-600 h-10 px-4 rounded-xl border border-amber-500 shadow-md flex items-center justify-center transition-colors";
            msg.textContent = "⚠️ No se pudo obtener la previsión horaria para los tramos.";
        }
    }
}

/**
 * Carga una ruta deportiva guardada en el mapa, cerrando modales y desplegando telemetría e IA Coach.
 */
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
    if (typeof window.cerrarModalDetallesRuta === 'function') window.cerrarModalDetallesRuta();
    if (typeof window.cerrarModalRanking === 'function') window.cerrarModalRanking();
    if (typeof window.cerrarModalFeed === 'function') window.cerrarModalFeed();
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    const spaModal = document.getElementById('userProfileModal');
    if (spaModal && !spaModal.classList.contains('hidden')) {
        if (typeof window.goBackSPA === 'function') window.goBackSPA();
        else spaModal.classList.add('hidden', 'opacity-0');
    }

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
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    // 4. Formatear y añadir polilínea deportiva
    const latLngs = coords.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
    if (mapRuntime.lineaRuta) currentMap.removeLayer(mapRuntime.lineaRuta);
    mapRuntime.lineaRuta = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(currentMap);

    // 5. Marcador de Inicio (Verde)
    const inicioIcon = L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏁</div>`,
        iconSize: [0, 0]
    });
    const mInicio = L.marker(latLngs[0], { icon: inicioIcon }).addTo(currentMap).bindPopup("<b>Inicio de la Ruta</b>");
    mapRuntime.marcadoresRuta.push(mInicio);

    // 6. Marcador de Fin (Rojo)
    if (latLngs.length > 1) {
        const finIcon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `<div class="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏆</div>`,
            iconSize: [0, 0]
        });
        const mFin = L.marker(latLngs[latLngs.length - 1], { icon: finIcon }).addTo(currentMap).bindPopup("<b>Meta / Fin de Ruta</b>");
        mapRuntime.marcadoresRuta.push(mFin);
    }

    // 7. Auto-ajuste de cámara
    currentMap.fitBounds(mapRuntime.lineaRuta.getBounds(), { padding: [50, 50] });

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

    // Guardar referencia activa para exportación GPX
    window._rutaDeportivaCargadaActual = { coords, nombre: titulo };

    // Preparar el motor de Replay a 60 FPS listo para reproducción inmediata
    iniciarReplayRuta(coords, {
        title: titulo,
        totalDistKm: Number(dist),
        durationSec: secs,
        avgSpeedKm: Number(avgSpd)
    });

    let telemetria = null;
    try {
        if (ruta && ruta.id) {
            const rawTel = localStorage.getItem('ps_telemetry_' + ruta.id);
            if (rawTel) telemetria = JSON.parse(rawTel);
        }
        if (!telemetria && ruta && ruta.telemetria) {
            telemetria = ruta.telemetria;
        }
        if (!telemetria) {
            const rawLast = localStorage.getItem('ps_telemetry_last');
            if (rawLast) {
                const parsedLast = JSON.parse(rawLast);
                if (parsedLast?.rutaId && ruta?.id && parsedLast.rutaId === ruta.id) {
                    telemetria = parsedLast;
                }
            }
        }
    } catch (eTel) {
        console.warn('Aviso al leer telemetría de ruta:', eTel);
    }

    let badgeMeteo = '';
    if (telemetria?.meteo?.vientoKt !== undefined && telemetria?.meteo?.vientoKt !== null) {
        badgeMeteo = `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-600/40 font-mono text-[10px]" title="Condiciones meteorológicas grabadas durante la ruta">
                💨 <b>${telemetria.meteo.vientoKt} kt</b>${telemetria.meteo.olasM ? ` · 🌊 <b>${telemetria.meteo.olasM}m</b>` : ''}${telemetria.meteo.score ? ` · 🛡️ <b>${telemetria.meteo.score}</b>` : ''}
            </span>
        `;
    } else if (ruta.ubicacion && ruta.ubicacion.includes('💨')) {
        const parteMeteo = ruta.ubicacion.split('·').slice(1).join('·').trim();
        badgeMeteo = `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-600/40 font-mono text-[10px]">
                ${esc(parteMeteo)}
            </span>
        `;
    }

    let btnSplits = '';
    if (telemetria && Array.isArray(telemetria.splits) && telemetria.splits.length > 0) {
        const rutaIdSplits = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : 'last';
        btnSplits = `
            <button type="button" onclick="mostrarModalSplitsKm('${rutaIdSplits}')" class="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Ver splits por kilómetro">
                <span>⚡</span> <span>Splits (${telemetria.splits.length})</span>
            </button>
        `;
    }

    const msg = document.getElementById('mapMsg');
    if (msg) {
        const rutaIdEsc = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : '';
        const btnCoach = ruta.id ? `
            <button type="button" onclick="if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>🧠</span> <span>Coach</span>
            </button>
        ` : '';
        const btnAiRouteCoach = `
            <button type="button" onclick="solicitarAnalisisIARutaDeportiva('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Analizar biometría y splits con IA Coach">
                <span>🤖</span> <span>IA Coach</span>
            </button>
        `;
        const btnGpx = `
            <button type="button" onclick="exportarRutaPlanificadaGPX()" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>📲</span> <span>GPX</span>
            </button>
        `;

        const biometriaRuta = calcularBiometriaSup({
            duracionMin: mins,
            distKm: Number(dist),
            velKmh: Number(avgSpd),
            vientoKt: telemetria?.meteo?.vientoKt || 0,
            olasM: telemetria?.meteo?.olasM || 0,
            periodoS: telemetria?.meteo?.periodoS || 0,
            tipoTabla: telemetria?.boardType || 'all-round'
        });

        msg.className = "text-xs font-bold text-white bg-slate-900/95 py-2.5 px-4 rounded-2xl border border-sky-500/40 shadow-2xl flex items-center justify-between gap-3 flex-wrap transition-all";
        msg.innerHTML = `
            <div class="flex items-center gap-2.5 flex-wrap">
                <span class="truncate max-w-[150px] text-sky-400 font-black">🧭 ${esc(titulo)}</span>
                <span class="text-white">📏 <b>${dist}</b> km</span>
                <span class="text-white">⏱️ <b>${mins}</b> min</span>
                <span class="text-amber-400">⚡ Med: <b>${avgSpd}</b> km/h</span>
                <span class="text-amber-300">🔥 <b>${biometriaRuta.kcal}</b> kcal</span>
                <span class="text-emerald-400">🚀 Max: <b>${maxSpd}</b> km/h</span>
                ${badgeMeteo}
            </div>
            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                ${btnSplits}
                ${btnAiRouteCoach}
                ${btnGpx}
                ${btnCoach}
            </div>
        `;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        if (currentMap) {
            currentMap.invalidateSize();
            if (mapRuntime.lineaRuta) currentMap.fitBounds(mapRuntime.lineaRuta.getBounds(), { padding: [50, 50] });
        }
    }, 250);
}

/**
 * Exporta cualquier trazado o ruta activa (planificada, deportiva o quedada) a un archivo .gpx estándar.
 */
export function exportarRutaPlanificadaGPX() {
    let coords = [];
    let nombre = "Ruta_PaddleSafe";

    if (mapRuntime.marcadoresRuta && mapRuntime.marcadoresRuta.length >= 2) {
        coords = mapRuntime.marcadoresRuta.map(m => {
            const ll = m.getLatLng ? m.getLatLng() : m;
            return [ll.lat, ll.lng];
        });
        if (mapRuntime.modoTravesiaActivo && coords.length === 2) {
            coords.push(coords[0]);
        }
        nombre = `Ruta_Planificada_${new Date().toISOString().slice(0, 10)}`;
    } else if (window._rutaDeportivaCargadaActual?.coords && window._rutaDeportivaCargadaActual.coords.length > 0) {
        coords = window._rutaDeportivaCargadaActual.coords;
        nombre = window._rutaDeportivaCargadaActual.nombre || "Ruta_Deportiva";
    } else if (window._rutaClubCargadaActual?.coords && window._rutaClubCargadaActual.coords.length > 0) {
        coords = window._rutaClubCargadaActual.coords;
        nombre = window._rutaClubCargadaActual.nombre || "Quedada_Club";
    } else if (mapRuntime.lineaRuta) {
        const latLngs = mapRuntime.lineaRuta.getLatLngs ? mapRuntime.lineaRuta.getLatLngs() : [];
        if (Array.isArray(latLngs) && latLngs.length > 1) {
            coords = latLngs.map(ll => [ll.lat, ll.lng]);
            nombre = `Ruta_${new Date().toISOString().slice(0, 10)}`;
        }
    }

    if (!coords || coords.length < 2) {
        alert("⚠️ No hay ninguna ruta activa con al menos 2 puntos para exportar a GPX.");
        return;
    }

    try {
        const cleanName = String(nombre).replace(/[^\w\d\-_]/g, '_');
        descargarGPX(coords, `${cleanName}.gpx`);
    } catch (e) {
        console.error("[GPX] Error al exportar archivo GPX:", e);
        alert(`No se pudo generar el archivo GPX: ${e.message}`);
    }
}

export function activarModoPlanificacionEvento(clubId) {
    iniciarCreacionQuedadaClub(clubId);
}

export function guardarEventoClub() {
    guardarQuedadaDesdeMapa();
}

/**
 * Importa y carga una ruta GPX externa directamente en el mapa.
 */
export async function importarRutaGPXPro(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const parsed = parseGPX(text);
        const coords = parsed?.coordinates || parsed?.points || [];
        if (parsed && Array.isArray(coords) && coords.length >= 2) {
            const nombre = parsed.name || (file.name ? file.name.replace(/\.(gpx|tcx)$/i, '') : 'Ruta GPX Importada');
            cargarRutaEnMapaGrande(coords, nombre);
            if (event.target) event.target.value = '';
        } else {
            alert('⚠️ El archivo GPX/TCX no contiene suficientes trackpoints o waypoints para trazar la ruta.');
        }
    } catch (err) {
        console.error('Error al importar GPX/TCX Pro:', err);
        alert('❌ Error al procesar el archivo GPX/TCX: ' + (err?.message || 'Archivo corrupto'));
    }
}

/**
 * Centra y resalta un tramo específico de la ruta en el mapa.
 */
export function centrarTramoMapa(tramoIndex) {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    const tramos = window._tramosRutaActuales;
    if (Array.isArray(tramos) && tramos[tramoIndex]) {
        const tr = tramos[tramoIndex];
        if (tr.p1 && tr.p2) {
            const bounds = L.latLngBounds([tr.p1, tr.p2]);
            currentMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
            if (mapRuntime.lineasMultiPunto && mapRuntime.lineasMultiPunto[tramoIndex]) {
                const line = mapRuntime.lineasMultiPunto[tramoIndex];
                const originalWeight = line.options?.weight || 5;
                line.setStyle({ weight: 9, opacity: 1 });
                setTimeout(() => {
                    line.setStyle({ weight: originalWeight, opacity: 0.9 });
                }, 1500);
            }
        }
    }
    if (typeof document !== 'undefined') {
        const cardTramo = document.getElementById(`proTramoDetalle-${tramoIndex}`) || document.getElementById('proTramoDetalle') || document.getElementById('proDashTramosContainer');
        if (cardTramo) {
            cardTramo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

/**
 * Genera el gráfico vectorial SVG del perfil de viento y ritmo estimado de la ruta.
 */
export function generarGraficoSvgPerfilRuta(tramos, dt) {
    if (!Array.isArray(tramos) || tramos.length === 0) return '';
    const totalDistKm = dt > 0 ? (dt / 1000) : tramos.reduce((acc, t) => acc + (t.distancia_km || 0), 0);
    const safeTotalDist = totalDistKm > 0 ? totalDistKm : 1;

    const W = 620;
    const H = 150;
    const padL = 40;
    const padR = 25;
    const padT = 25;
    const padB = 30;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const nodes = [];
    let cumDist = 0;
    nodes.push({
        km: 0,
        x: padL,
        viento_kt: tramos[0].viento_kt ?? 0,
        tramoIndex: 0,
        label: 'A'
    });

    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    tramos.forEach((tr, i) => {
        cumDist += (tr.distancia_km || 0);
        const xPos = padL + (cumDist / safeTotalDist) * chartW;
        nodes.push({
            km: cumDist,
            x: Math.round(xPos * 10) / 10,
            viento_kt: tr.viento_kt ?? (nodes[i].viento_kt || 0),
            tramoIndex: i,
            label: letras[i + 1] || `${i + 1}`,
            velEfectiva: tr.velEfectiva || (tr.modVelocidad !== undefined ? Math.max(1.5, obtenerVelocidadCruceroUsuario() + tr.modVelocidad).toFixed(1) : '4.5'),
            nombre: tr.nombre || `Tramo ${i + 1}`,
            relativo: tr.viento_relativo || 'Viento',
            eta: tr.eta_hora || '--:--'
        });
    });

    const maxWind = Math.max(15, ...nodes.map(n => n.viento_kt), 1);
    nodes.forEach(n => {
        n.y = Math.round((padT + chartH - ((n.viento_kt / maxWind) * chartH)) * 10) / 10;
    });

    const baselineY = padT + chartH;
    const linePathD = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`).join(' ');
    const areaPathD = `${linePathD} L ${nodes[nodes.length - 1].x} ${baselineY} L ${nodes[0].x} ${baselineY} Z`;

    let segmentsSvg = '';
    for (let i = 0; i < tramos.length; i++) {
        const n1 = nodes[i];
        const n2 = nodes[i + 1];
        const tr = tramos[i];
        const segColor = tr.color || (tr.viento_relativo?.includes('FAVOR') ? '#10b981' : (tr.viento_relativo?.includes('CONTRA') ? '#ef4444' : '#f59e0b'));
        const segMidX = (n1.x + n2.x) / 2;
        const segMidY = (n1.y + n2.y) / 2;
        const velEf = tr.velEfectiva || (tr.modVelocidad !== undefined ? Math.max(1.5, obtenerVelocidadCruceroUsuario() + tr.modVelocidad).toFixed(1) : '4.5');

        segmentsSvg += `
            <line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="${segColor}" stroke-width="3" stroke-linecap="round" />
            <g transform="translate(${segMidX}, ${Math.max(padT + 12, segMidY - 14)})" cursor="pointer" onclick="window.centrarTramoMapa(${i})">
                <rect x="-32" y="-9" width="64" height="18" rx="9" fill="rgba(15, 23, 42, 0.85)" stroke="${segColor}" stroke-width="1" />
                <text x="0" y="3.5" fill="#f8fafc" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle" class="ps-tabular">🏄 ${velEf}k/h</text>
            </g>
        `;
    }

    let nodesSvg = '';
    nodes.forEach((n, idx) => {
        const isFirst = idx === 0;
        const tramoIdx = isFirst ? 0 : idx - 1;
        const tr = tramos[tramoIdx] || tramos[0];
        const circleColor = isFirst ? '#10b981' : (idx === nodes.length - 1 ? '#ef4444' : '#38bdf8');
        const tooltip = `${tr.nombre || 'Punto'}: Viento ${n.viento_kt?.toFixed(1) || 0} kt · ETA: ${tr.eta_hora || '--'}`;

        nodesSvg += `
            <g class="cursor-pointer group" onclick="window.centrarTramoMapa(${tramoIdx})">
                <title>${tooltip}</title>
                <circle cx="${n.x}" cy="${n.y}" r="5" fill="${circleColor}" stroke="#0f172a" stroke-width="2" />
                <circle cx="${n.x}" cy="${baselineY}" r="2" fill="#64748b" />
                <text x="${n.x}" y="${baselineY + 14}" fill="#94a3b8" font-size="9" font-family="monospace" text-anchor="middle" class="ps-tabular">${n.label} (${n.km.toFixed(1)}k)</text>
                <text x="${n.x}" y="${n.y - 8}" fill="#e2e8f0" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle" class="ps-tabular">${n.viento_kt?.toFixed(1)}kt</text>
            </g>
        `;
    });

    return `
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto select-none" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="routeWindGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#0369a1" stop-opacity="0.02" />
                </linearGradient>
            </defs>
            <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(148, 163, 184, 0.12)" stroke-dasharray="3,3" />
            <line x1="${padL}" y1="${padT + chartH / 2}" x2="${W - padR}" y2="${padT + chartH / 2}" stroke="rgba(148, 163, 184, 0.12)" stroke-dasharray="3,3" />
            <line x1="${padL}" y1="${baselineY}" x2="${W - padR}" y2="${baselineY}" stroke="rgba(148, 163, 184, 0.25)" />
            <text x="${padL - 6}" y="${padT + 4}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">${Math.round(maxWind)}kt</text>
            <text x="${padL - 6}" y="${padT + chartH / 2 + 3}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">${Math.round(maxWind / 2)}kt</text>
            <text x="${padL - 6}" y="${baselineY + 3}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">0kt</text>
            <path d="${areaPathD}" fill="url(#routeWindGrad)" />
            ${segmentsSvg}
            ${nodesSvg}
        </svg>
    `;
}

// ==============================================================================
// TIME PROGRESSIVE ROUTE WEATHER SIMULATOR (BATCH #19)
// ==============================================================================

/**
 * Evalúa la evolución meteorológica progresiva por tramo según el ETA de avance de la ruta.
 * Detecta incrementos de viento >= 4 kt en tramos tardíos/retorno y genera alertas tácticas.
 * @param {Array} tramos Array de tramos calculados de la ruta
 * @param {number} horaSalidaIdx Hora inicial de salida (0 - 23)
 * @param {Object} hourlyForecast Objeto horario Open-Meteo o series horarias
 * @returns {Object} { hayAumentoCritico, alertas, alertaPrincipal, vientoSalidaKt, tramosEvaluados }
 */
export function calcularMeteoProgresivaPorTramo(tramos, horaSalidaIdx = 10, hourlyForecast = null) {
    if (!Array.isArray(tramos) || tramos.length === 0) {
        return {
            hayAumentoCritico: false,
            alertas: [],
            alertaPrincipal: null,
            vientoSalidaKt: 0,
            tramosEvaluados: []
        };
    }

    const hIdx = Number.isFinite(Number(horaSalidaIdx)) ? Math.max(0, Math.min(23, Math.round(Number(horaSalidaIdx)))) : 10;

    const getWindKtAtHour = (targetHour) => {
        if (!hourlyForecast) return null;
        const normalizedTargetHour = ((targetHour % 24) + 24) % 24;

        if (Array.isArray(hourlyForecast.time)) {
            let matchIdx = hourlyForecast.time.findIndex(t => {
                const hh = parseInt(String(t).slice(11, 13), 10);
                return hh === normalizedTargetHour;
            });
            if (matchIdx < 0 && normalizedTargetHour < hourlyForecast.time.length) {
                matchIdx = normalizedTargetHour;
            }
            if (matchIdx >= 0) {
                const spd = hourlyForecast.wind_speed_10m?.[matchIdx] ?? hourlyForecast.windSpeed?.[matchIdx];
                if (spd !== undefined && spd !== null) {
                    return Number(kmhANudos(Number(spd) * 3.6).toFixed(1));
                }
            }
        } else if (Array.isArray(hourlyForecast)) {
            const el = hourlyForecast.find(h => {
                const hh = h.horaNum ?? parseInt(String(h.hora || h.time || '').slice(0, 2), 10);
                return hh === normalizedTargetHour;
            });
            if (el) {
                const v = el.vientoKt ?? (el.wind_speed ? kmhANudos(el.wind_speed * 3.6) : null);
                if (v !== null) return Number(Number(v).toFixed(1));
            }
        }
        return null;
    };

    const firstTramoWind = (tramos[0].viento_kt !== undefined && tramos[0].viento_kt !== null)
        ? Number(tramos[0].viento_kt)
        : null;
    const launchForecastWind = getWindKtAtHour(hIdx);
    const vientoSalidaKt = launchForecastWind !== null ? launchForecastWind : (firstTramoWind ?? 5.0);

    let minutosAcumulados = 0;
    const alertas = [];
    const tramosEvaluados = [];

    for (let i = 0; i < tramos.length; i++) {
        const tr = tramos[i];
        const duracionTramoMin = Number(tr.minutos) || Math.round((Number(tr.distancia_km) || 1) / 4.5 * 60);

        // Evaluamos al paso por el tramo según tiempo acumulado
        const offsetHoras = Math.round((minutosAcumulados + (duracionTramoMin / 2)) / 60);
        const horaPasoH = (hIdx + offsetHoras) % 24;
        const horaPasoStr = tr.eta_hora || `${String((hIdx + Math.floor(minutosAcumulados / 60)) % 24).padStart(2, '0')}:${String(Math.round(minutosAcumulados % 60)).padStart(2, '0')}`;

        const forecastWindAtTramo = getWindKtAtHour(horaPasoH);
        const vientoTramoKt = forecastWindAtTramo !== null 
            ? forecastWindAtTramo 
            : ((tr.viento_kt !== undefined && tr.viento_kt !== null) ? Number(tr.viento_kt) : vientoSalidaKt);

        const incrementoKt = Number((vientoTramoKt - vientoSalidaKt).toFixed(1));
        const nombreTramo = tr.nombre || `Tramo ${i + 1}`;

        const evaluacion = {
            tramoIndex: i,
            tramoNombre: nombreTramo,
            etaHora: horaPasoStr,
            minutosAcumulados: Math.round(minutosAcumulados),
            horaPasoH,
            vientoSalidaKt,
            vientoTramoKt,
            incrementoKt,
            esAumentoCritico: incrementoKt >= 4.0
        };

        if (evaluacion.esAumentoCritico) {
            evaluacion.mensaje = `⚠️ Evolución Horaria: A tu hora estimada de paso por el ${nombreTramo} (${horaPasoStr}), el viento subirá de ${vientoSalidaKt} kt a ${vientoTramoKt} kt`;
            alertas.push(evaluacion);
        }

        tramosEvaluados.push(evaluacion);
        minutosAcumulados += duracionTramoMin;
    }

    return {
        hayAumentoCritico: alertas.length > 0,
        alertas,
        alertaPrincipal: alertas[0] || null,
        vientoSalidaKt,
        tramosEvaluados
    };
}


// ==============================================================================
// 60FPS INTERACTIVE ROUTE REPLAY ENGINE (UI 6.0)
// High-performance Leaflet marker & polyline interpolation via requestAnimationFrame
// Pre-computed O(N) Haversine distance cumulative array with O(1) lerp lookups
// ==============================================================================

/**
 * Calcula la distancia Haversine en km entre dos puntos
 */
function haversineDistKm(p1, p2) {
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcula el rumbo geodésico en grados (0-360) entre dos puntos
 */
function calcularRumboGrados(p1, p2) {
    const y = Math.sin((p2.lon - p1.lon) * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180);
    const x = Math.cos(p1.lat * Math.PI / 180) * Math.sin(p2.lat * Math.PI / 180) -
              Math.sin(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.cos((p2.lon - p1.lon) * Math.PI / 180);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

/**
 * Formatea segundos a MM:SS
 */
function formatearSegundosMMSS(totalSegundos) {
    const s = Math.max(0, Math.round(totalSegundos));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Pre-procesa una ruta e interpola su posición exacta dado un progreso de 0.0 a 1.0
 */
export function obtenerInterpolacionProgreso(progreso0a1) {
    const rData = mapRuntime.replayData;
    if (!rData || !rData.normCoords || rData.normCoords.length === 0) return null;

    const coords = rData.normCoords;
    const cum = rData.cumDistances;
    const totalDist = rData.totalDistKm;

    const p = Math.max(0, Math.min(1, Number(progreso0a1) || 0));

    if (coords.length === 1 || totalDist === 0) {
        return {
            lat: coords[0].lat,
            lon: coords[0].lon,
            bearing: 0,
            distKm: 0,
            index: 0,
            trailCoords: [[coords[0].lat, coords[0].lon]]
        };
    }

    const targetDist = p * totalDist;

    // Búsqueda binaria O(log N) del segmento correspondiente
    let low = 0;
    let high = cum.length - 1;
    let idx = 0;

    while (low <= high) {
        const mid = (low + high) >> 1;
        if (cum[mid] <= targetDist) {
            idx = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (idx >= coords.length - 1) {
        idx = coords.length - 2;
    }

    const p0 = coords[idx];
    const p1 = coords[idx + 1];
    const segDist = cum[idx + 1] - cum[idx];
    const t = segDist > 0 ? (targetDist - cum[idx]) / segDist : 0;

    // Linear coordinate interpolation (lerp)
    const lat = p0.lat + t * (p1.lat - p0.lat);
    const lon = p0.lon + t * (p1.lon - p0.lon);
    const bearing = calcularRumboGrados(p0, p1);

    // Construcción eficiente del trail previo + punto interpolado actual
    const trailCoords = [];
    for (let i = 0; i <= idx; i++) {
        trailCoords.push([coords[i].lat, coords[i].lon]);
    }
    trailCoords.push([lat, lon]);

    return {
        lat,
        lon,
        bearing,
        distKm: targetDist,
        index: idx,
        trailCoords,
        t
    };
}

/**
 * Inicializa y prepara el motor de Replay con las coordenadas dadas
 * @param {Array} coordenadas Array de [lat, lon] o {lat, lon/lng}
 * @param {Object} [metadata] Título, distancia, duración, etc.
 */
export function iniciarReplayRuta(coordenadas, metadata = {}) {
    detenerReplayRuta();

    if (!Array.isArray(coordenadas) || coordenadas.length === 0) return;

    // Normalizar coordenadas a { lat, lon }
    const normCoords = coordenadas.map(pt => {
        if (Array.isArray(pt)) return { lat: Number(pt[0]), lon: Number(pt[1]) };
        return { lat: Number(pt.lat ?? pt.latitude), lon: Number(pt.lon ?? pt.lng ?? pt.longitude) };
    }).filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));

    if (normCoords.length < 2) return;

    // Pre-cálculo O(N) acumulativo de distancias Haversine
    const cumDistances = [0];
    let totalDistKm = 0;
    for (let i = 1; i < normCoords.length; i++) {
        const d = haversineDistKm(normCoords[i - 1], normCoords[i]);
        totalDistKm += d;
        cumDistances.push(totalDistKm);
    }

    const totalSeconds = Number(metadata.durationSec || metadata.duration_seconds || (totalDistKm / 4.5 * 3600)) || 1800;
    const avgSpeed = Number(metadata.avgSpeedKm || metadata.avg_speed || (totalDistKm / (totalSeconds / 3600))) || 4.5;
    const title = metadata.title || metadata.nombre || 'Replay de Travesía';

    mapRuntime.replayData = {
        normCoords,
        cumDistances,
        totalDistKm,
        totalSeconds,
        avgSpeed,
        title,
        baseDurationSec: Math.max(15, Math.min(90, totalDistKm * 8)) // Duración visual de animación (15s a 90s a 1x)
    };

    mapRuntime.replayProgress = 0;
    mapRuntime.replayIsPlaying = false;
    mapRuntime.replaySpeed = 1;
    mapRuntime.replayFollowCamera = true;

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) return;

    // Creación ÚNICA del marcador Leaflet surfero y la polilínea trail
    if (typeof L !== 'undefined') {
        const surferIcon = L.divIcon({
            className: 'ps-replay-marker-wrapper',
            html: `
                <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                    <div class="absolute w-8 h-8 rounded-full bg-sky-400/40 animate-ping"></div>
                    <div class="w-8 h-8 rounded-full bg-slate-950/90 border-2 border-sky-400 flex items-center justify-center shadow-lg text-sm select-none">
                        <span id="replaySurferEmoji" style="display:inline-block; transform: rotate(0deg); transition: transform 0.1s linear;">🏄</span>
                    </div>
                </div>
            `,
            iconSize: [0, 0]
        });

        mapRuntime.replayMarker = L.marker([normCoords[0].lat, normCoords[0].lon], {
            icon: surferIcon,
            zIndexOffset: 3000
        }).addTo(currentMap);

        mapRuntime.replayTrailPolyline = L.polyline([], {
            color: '#38bdf8',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(currentMap);
    }

    // Configurar y mostrar el HUD
    const hud = document.getElementById('routeReplayHud');
    if (hud) {
        hud.classList.remove('hidden');
        if (typeof window !== 'undefined' && typeof window.deshabilitarPropagacionMapa === 'function') {
            window.deshabilitarPropagacionMapa(hud);
        }
    }
    document.getElementById('mapWindWaveHud')?.classList.add('hidden');

    const titleEl = document.getElementById('replayRouteTitle');
    if (titleEl) titleEl.textContent = title;

    const totalTimeEl = document.getElementById('replayTotalTime');
    if (totalTimeEl) totalTimeEl.textContent = formatearSegundosMMSS(totalSeconds);

    const speedBtn = document.getElementById('btnReplaySpeed');
    if (speedBtn) speedBtn.textContent = '1x';

    actualizarPosicionReplayProgreso(0, false);
}

/**
 * Alterna Reproducir / Pausar el Replay de la ruta
 * @param {boolean|null} [forzarEstado=null]
 */
export function togglePlayPauseReplayRuta(forzarEstado = null) {
    if (!mapRuntime.replayData) return;

    const reproducir = forzarEstado !== null ? Boolean(forzarEstado) : !mapRuntime.replayIsPlaying;

    if (reproducir) {
        if (mapRuntime.replayProgress >= 1.0) {
            mapRuntime.replayProgress = 0;
        }
        mapRuntime.replayIsPlaying = true;
        const iconEl = document.getElementById('replayToggleIcon');
        if (iconEl) iconEl.textContent = '⏸️';

        let lastTimestamp = performance.now();

        function replayLoop(now) {
            if (!mapRuntime.replayIsPlaying || !mapRuntime.replayData) return;

            const dt = (now - lastTimestamp) / 1000;
            lastTimestamp = now;

            const baseSec = mapRuntime.replayData.baseDurationSec || 30;
            const stepProgress = (dt * mapRuntime.replaySpeed) / baseSec;
            mapRuntime.replayProgress = Math.min(1.0, mapRuntime.replayProgress + stepProgress);

            actualizarPosicionReplayProgreso(mapRuntime.replayProgress, false);

            if (mapRuntime.replayProgress >= 1.0) {
                mapRuntime.replayIsPlaying = false;
                const ic = document.getElementById('replayToggleIcon');
                if (ic) ic.textContent = '▶️';
            } else {
                mapRuntime.replayAnimFrameId = requestAnimationFrame(replayLoop);
            }
        }

        mapRuntime.replayAnimFrameId = requestAnimationFrame(replayLoop);
    } else {
        mapRuntime.replayIsPlaying = false;
        if (mapRuntime.replayAnimFrameId) {
            cancelAnimationFrame(mapRuntime.replayAnimFrameId);
            mapRuntime.replayAnimFrameId = null;
        }
        const iconEl = document.getElementById('replayToggleIcon');
        if (iconEl) iconEl.textContent = '▶️';
    }
}

/**
 * Detiene y limpia completamente el motor de Replay
 */
export function detenerReplayRuta() {
    mapRuntime.replayIsPlaying = false;
    if (mapRuntime.replayAnimFrameId) {
        cancelAnimationFrame(mapRuntime.replayAnimFrameId);
        mapRuntime.replayAnimFrameId = null;
    }

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap) {
        if (mapRuntime.replayMarker) {
            try { currentMap.removeLayer(mapRuntime.replayMarker); } catch (_) {}
            mapRuntime.replayMarker = null;
        }
        if (mapRuntime.replayTrailPolyline) {
            try { currentMap.removeLayer(mapRuntime.replayTrailPolyline); } catch (_) {}
            mapRuntime.replayTrailPolyline = null;
        }
    }

    mapRuntime.replayData = null;
    mapRuntime.replayProgress = 0;

    const hud = document.getElementById('routeReplayHud');
    if (hud) hud.classList.add('hidden');
    if (mapRuntime.modoMultipuntoActivo) {
        document.getElementById('multipuntoToolbar')?.classList.replace('hidden', 'flex');
    }

    const scrubber = document.getElementById('replayScrubberInput');
    if (scrubber) scrubber.value = 0;

    const iconEl = document.getElementById('replayToggleIcon');
    if (iconEl) iconEl.textContent = '▶️';
}

/**
 * Actualiza la posición del remero en el Replay con suavidad a 60 FPS
 * @param {number} progreso0a1 Valor entre 0.0 y 1.0
 * @param {boolean} [desdeScrubber=false] Si proviene del slider de usuario
 */
export const actualizarPosicionReplayPorgreso = (...args) => actualizarPosicionReplayProgreso(...args);

export function actualizarPosicionReplayProgreso(progreso0a1, desdeScrubber = false) {
    const p = Math.max(0, Math.min(1, Number(progreso0a1) || 0));
    mapRuntime.replayProgress = p;

    const interp = obtenerInterpolacionProgreso(p);
    if (!interp) return;

    // 1. Mover el marcador Leaflet sin recrear elementos
    if (mapRuntime.replayMarker) {
        mapRuntime.replayMarker.setLatLng([interp.lat, interp.lon]);
        const emojiEl = document.getElementById('replaySurferEmoji');
        if (emojiEl) {
            emojiEl.style.transform = `rotate(${Math.round(interp.bearing)}deg)`;
        }
    }

    // 2. Actualizar polilínea de estela
    if (mapRuntime.replayTrailPolyline && interp.trailCoords) {
        mapRuntime.replayTrailPolyline.setLatLngs(interp.trailCoords);
    }

    // 3. Seguimiento de cámara opcional
    if (mapRuntime.replayFollowCamera) {
        const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
        if (currentMap) {
            currentMap.panTo([interp.lat, interp.lon], { animate: false });
        }
    }

    // 4. Actualizar métricas del HUD
    const rData = mapRuntime.replayData;
    const elapsedSecs = (rData?.totalSeconds || 0) * p;
    const speed = rData?.avgSpeed || 4.5;

    const distEl = document.getElementById('replayDistKm');
    const timeEl = document.getElementById('replayElapsedTime');
    const speedEl = document.getElementById('replayCurrentSpeed');
    const bearingEl = document.getElementById('replayBearingDeg');
    const pctEl = document.getElementById('replayProgressPct');
    const scrubberEl = document.getElementById('replayScrubberInput');

    if (distEl) distEl.textContent = `${interp.distKm.toFixed(2)} km`;
    if (timeEl) timeEl.textContent = formatearSegundosMMSS(elapsedSecs);
    if (speedEl) speedEl.textContent = `${speed.toFixed(1)} km/h`;
    if (bearingEl) bearingEl.textContent = `${Math.round(interp.bearing).toString().padStart(3, '0')}°`;
    if (pctEl) pctEl.textContent = `${Math.round(p * 100)}%`;

    if (!desdeScrubber && scrubberEl) {
        scrubberEl.value = Math.round(p * 1000);
    }
}

/**
 * Cambia la velocidad del Replay cíclicamente: 1x -> 2x -> 5x -> 10x
 */
export function cambiarVelocidadReplayRuta() {
    const velocidades = [1, 2, 5, 10];
    const actual = mapRuntime.replaySpeed || 1;
    const nextIdx = (velocidades.indexOf(actual) + 1) % velocidades.length;
    mapRuntime.replaySpeed = velocidades[nextIdx];

    const btn = document.getElementById('btnReplaySpeed');
    if (btn) btn.textContent = `${mapRuntime.replaySpeed}x`;
}

/**
 * Alterna el centrado de cámara suave en el remero
 */
export function toggleReplaySeguirCamara() {
    mapRuntime.replayFollowCamera = !mapRuntime.replayFollowCamera;
    const txt = document.getElementById('replayFollowText');
    const btn = document.getElementById('btnReplayFollow');
    if (txt) txt.textContent = mapRuntime.replayFollowCamera ? 'Seguir' : 'Libre';
    if (btn) {
        if (mapRuntime.replayFollowCamera) {
            btn.className = 'ps-chip ps-quick-pill text-[11px] font-bold text-sky-300 bg-sky-500/20 border-sky-400/50 hover:bg-sky-500/30 cursor-pointer active:scale-95';
        } else {
            btn.className = 'ps-chip ps-quick-pill text-[11px] font-bold text-slate-400 bg-slate-800 border-slate-700 hover:bg-slate-700 cursor-pointer active:scale-95';
        }
    }
}

if (typeof window !== 'undefined') {
    window.toggleRutaLibre = toggleRutaLibre;
    window.limpiarRuta = limpiarRuta;
    window.gestionarClicRuta = gestionarClicRuta;
    window.gestionarClicRutaLibre = gestionarClicRutaLibre;
    window.deshacerUltimoPunto = deshacerUltimoPunto;
    window.reiniciarRutaMultipunto = reiniciarRutaMultipunto;
    window.cerrarIdaYVueltaMultipunto = cerrarIdaYVueltaMultipunto;
    window.renderPreviewRuta = renderPreviewRuta;
    window.evaluarVientoRelativoInfo = evaluarVientoRelativoInfo;
    window.actualizarMetricasQuedada = actualizarMetricasQuedada;
    window.evaluarMeteoParaQuedada = evaluarMeteoParaQuedada;
    window.mostrarFormularioQuedada = mostrarFormularioQuedada;
    window.volverAlMapaQuedada = volverAlMapaQuedada;
    window.iniciarCreacionQuedadaClub = iniciarCreacionQuedadaClub;
    window.cancelarCreacionQuedadaClub = cancelarCreacionQuedadaClub;
    window.deshacerUltimoPuntoQuedada = deshacerUltimoPuntoQuedada;
    window.reiniciarPuntosQuedada = reiniciarPuntosQuedada;
    window.guardarQuedadaDesdeMapa = guardarQuedadaDesdeMapa;
    window.cargarRutaEnMapaGrande = cargarRutaEnMapaGrande;
    window.analizarVientoRutaClub = analizarVientoRutaClub;
    window.cargarRutaDeportivaEnMapa = cargarRutaDeportivaEnMapa;
    window.exportarRutaPlanificadaGPX = exportarRutaPlanificadaGPX;
    window.activarModoPlanificacionEvento = activarModoPlanificacionEvento;
    window.guardarEventoClub = guardarEventoClub;
    window.importarRutaGPXPro = importarRutaGPXPro;
    window.centrarTramoMapa = centrarTramoMapa;
    window.generarGraficoSvgPerfilRuta = generarGraficoSvgPerfilRuta;
    window.calcularMeteoProgresivaPorTramo = calcularMeteoProgresivaPorTramo;
    window.iniciarReplayRuta = iniciarReplayRuta;
    window.togglePlayPauseReplayRuta = togglePlayPauseReplayRuta;
    window.detenerReplayRuta = detenerReplayRuta;
    window.actualizarPosicionReplayProgreso = actualizarPosicionReplayProgreso;
    window.actualizarPosicionReplayPorgreso = actualizarPosicionReplayProgreso;
    window.cambiarVelocidadReplayRuta = cambiarVelocidadReplayRuta;
    window.toggleReplaySeguirCamara = toggleReplaySeguirCamara;
    window.obtenerInterpolacionProgreso = obtenerInterpolacionProgreso;
}
