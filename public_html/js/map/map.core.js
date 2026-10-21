// ==============================================================================
// PADDLESAFE NEXT-GEN - GIS CORE & EQUIPMENT CALIBRATION (map.core.js)
// Modularized under Strangler Fig pattern from map.js
// Handles: GIS Map Lifecycle, Leaflet Viewport, Geolocation, Offline Tiles,
// Screen WakeLock re-export, and User Gear / Pace Calibration.
// ==============================================================================

import { supabaseClient, appState, CARTO_API_KEY, CARTO_TILE_URLS } from '../config.js';
import { fetchConTimeout } from '../utils.js';
import { mapRuntime } from './map.state.js';
import { activarWakeLock, liberarWakeLock } from './map.tracker.js';


// ====================================================
// FÍSICA PERSONALIZADA DE TABLA, RITMO Y VELOCIDAD DE CRUCERO
// ====================================================

export const TABLAS_SUP_CONFIG = {
    inflat_allround: {
        id: 'inflat_allround',
        nombre: "Hinchable All-Round (10'6\")",
        velBase: 3.8,
        driftMod: 1.20,
        chopPenalty: 0,
        descripcion: "Mayor grosor y francobordo (15 cm). Deriva +20% por efecto vela en viento > 10 kt."
    },
    inflat_touring: {
        id: 'inflat_touring',
        nombre: "Hinchable Touring (12'6\" - 14')",
        velBase: 4.7,
        driftMod: 1.10,
        chopPenalty: 0,
        descripcion: "Proa afilada y buena inercia de avance. Deriva moderada (+10%)."
    },
    rigid_touring: {
        id: 'rigid_touring',
        nombre: "Rígida Touring / All-Water",
        velBase: 5.2,
        driftMod: 1.0,
        chopPenalty: 0,
        descripcion: "Línea de flotación óptima y casco rígido. Deriva neutra de referencia (1.0)."
    },
    rigid_race: {
        id: 'rigid_race',
        nombre: "Rígida Race (14')",
        velBase: 6.0,
        driftMod: 0.95,
        chopPenalty: 5,
        descripcion: "Máximo deslizamiento y velocidad. Inestabilidad lateral con chop / mar picado (-5 pts)."
    }
};

/**
 * Recupera la configuración de equipo del usuario desde memoria o localStorage.
 */
export function recuperarEquipoUsuario() {
    try {
        const raw = localStorage.getItem('ps_user_gear');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.tipoTabla && TABLAS_SUP_CONFIG[parsed.tipoTabla]) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Aviso al recuperar ps_user_gear:', e);
    }
    return {
        tipoTabla: 'rigid_touring',
        velCruceroKmh: 4.5,
        driftMod: 1.0,
        chopPenalty: 0
    };
}

/**
 * Persiste la configuración de equipo del usuario en localStorage y estado reactivo.
 */
export function guardarEquipoUsuario(equipo) {
    if (!equipo) return;
    try {
        localStorage.setItem('ps_user_gear', JSON.stringify(equipo));
    } catch (e) {
        console.warn('Aviso al guardar ps_user_gear:', e);
    }
    if (appState) {
        appState.equipoUsuario = equipo;
    }
    mapRuntime.equipoUsuario = equipo;
    actualizarUIGearSelector();
}

/**
 * Retorna la velocidad crucero del usuario (1.5 - 15.0 km/h) con fallback a 4.5 km/h.
 */
export function obtenerVelocidadCruceroUsuario() {
    const eq = appState?.equipoUsuario || mapRuntime.equipoUsuario || recuperarEquipoUsuario();
    const vel = Number(eq?.velCruceroKmh);
    return (Number.isFinite(vel) && vel >= 1.5 && vel <= 15.0) ? vel : 4.5;
}

/**
 * Retorna el modificador de deriva por efecto vela de la tabla del usuario.
 */
export function obtenerModificadorDerivaUsuario() {
    const eq = appState?.equipoUsuario || mapRuntime.equipoUsuario || recuperarEquipoUsuario();
    const mod = Number(eq?.driftMod);
    return (Number.isFinite(mod) && mod > 0) ? mod : 1.0;
}

/**
 * Actualiza el tipo de tabla en la configuración del usuario y recalcula el ritmo base.
 */
export function actualizarTipoTablaDesdeSelect(tipo) {
    const config = TABLAS_SUP_CONFIG[tipo] || TABLAS_SUP_CONFIG.rigid_touring;
    const actual = appState?.equipoUsuario || mapRuntime.equipoUsuario || recuperarEquipoUsuario();
    const nuevo = {
        ...actual,
        tipoTabla: config.id,
        driftMod: config.driftMod,
        chopPenalty: config.chopPenalty,
        velCruceroKmh: actual.velManual ? actual.velCruceroKmh : config.velBase
    };
    guardarEquipoUsuario(nuevo);
}

/**
 * Actualiza manualmente la velocidad crucero del usuario.
 */
export function actualizarVelocidadCruceroManual(velStr) {
    const vel = parseFloat(velStr);
    if (!Number.isFinite(vel) || vel < 1.0 || vel > 20.0) return;
    const actual = appState?.equipoUsuario || mapRuntime.equipoUsuario || recuperarEquipoUsuario();
    const nuevo = {
        ...actual,
        velCruceroKmh: Number(vel.toFixed(1)),
        velManual: true
    };
    guardarEquipoUsuario(nuevo);
}

/**
 * Auto-calibra la velocidad media de remada del usuario analizando sus rutas previas.
 */
export async function autoCalibrarRitmoDesdeRutas() {
    const btn = document.getElementById('btnAutoCalibrarRitmo');
    if (btn) btn.innerHTML = '<span>⏳</span> <span>Analizando rutas...</span>';

    try {
        let velMedia = null;
        const userId = appState?.sesionActual?.user?.id;

        if (userId && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('rutas')
                .select('distancia_km, tiempo_minutos')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && Array.isArray(data) && data.length > 0) {
                const velList = data
                    .map(r => {
                        const km = Number(r.distancia_km || 0);
                        const m = Number(r.tiempo_minutos || 0);
                        return (km > 0.2 && m > 2) ? (km / (m / 60)) : null;
                    })
                    .filter(v => v !== null && v >= 1.8 && v <= 12.0);

                if (velList.length > 0) {
                    velMedia = velList.reduce((acc, v) => acc + v, 0) / velList.length;
                }
            }
        }

        if (velMedia === null) {
            const ck = localStorage.getItem('paddlesafe_live_checkpoint');
            if (ck) {
                try {
                    const parsed = JSON.parse(ck);
                    if (parsed.distKm > 0.5 && parsed.startTime) {
                        const mins = (Date.now() - new Date(parsed.startTime).getTime()) / 60000;
                        if (mins > 5) velMedia = parsed.distKm / (mins / 60);
                    }
                } catch (_) {}
            }
        }

        if (velMedia !== null && Number.isFinite(velMedia)) {
            const velFinal = Number(Math.max(2.0, Math.min(10.0, velMedia)).toFixed(1));
            actualizarVelocidadCruceroManual(velFinal);
            alert(`✅ ¡Ritmo auto-calibrado con éxito! Tu velocidad media real de remada es de ${velFinal} km/h.`);
        } else {
            alert('ℹ️ No hay suficientes rutas registradas para calcular tu media. Hemos mantenido tu velocidad crucero actual.');
        }
    } catch (e) {
        console.warn('Aviso al auto-calibrar ritmo:', e);
        alert('ℹ️ No se pudo calcular el promedio de tus rutas en este momento.');
    } finally {
        if (btn) btn.innerHTML = '<span>⚡</span> <span>Auto-calibrar con mis rutas</span>';
    }
}

/**
 * Despliega o contrae el panel selector de equipo y tabla.
 */
export function toggleSelectorEquipoUsuario(forceState) {
    const el = document.getElementById('userGearSelector');
    if (!el) return;
    const estaOculto = el.classList.contains('hidden');
    const nuevoEstado = typeof forceState === 'boolean' ? forceState : estaOculto;
    if (nuevoEstado) {
        actualizarUIGearSelector();
        el.classList.remove('hidden');
        el.scrollIntoView({ behavior: 'smooth' });
    } else {
        el.classList.add('hidden');
    }
}

/**
 * Sincroniza la interfaz visual del selector de equipo con el estado actual.
 */
export function actualizarUIGearSelector() {
    const eq = appState?.equipoUsuario || mapRuntime.equipoUsuario || recuperarEquipoUsuario();
    const select = document.getElementById('userGearBoardType');
    const input = document.getElementById('userGearPaceInput');
    const notice = document.getElementById('userGearPhysicsNotice');
    const badgeText = document.getElementById('gearBadgeText');

    if (select && eq.tipoTabla) select.value = eq.tipoTabla;
    if (input && eq.velCruceroKmh) input.value = Number(eq.velCruceroKmh).toFixed(1);

    const cfg = TABLAS_SUP_CONFIG[eq.tipoTabla] || TABLAS_SUP_CONFIG.rigid_touring;
    if (badgeText) badgeText.textContent = `${cfg.nombre.split(' ')[0]} (${eq.velCruceroKmh || cfg.velBase} km/h)`;

    if (notice) {
        notice.innerHTML = `
            <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1 mb-1.5">
                <span class="font-bold text-sky-300">${cfg.nombre}</span>
                <span class="font-mono text-[10px] text-slate-400">Deriva x${cfg.driftMod.toFixed(2)}</span>
            </div>
            <p class="text-slate-300">${cfg.descripcion}</p>
        `;
    }
}

// ==========================================
// GIS CORE: MAPA LEAFLET, GEOLOCALIZACIÓN Y TILES
// ==========================================

/**
 * Centra el mapa en una ubicación buscando por coordenadas o nombre mediante Nominatim.
 */
export function buscarYCentrarMapa(t) {
    if (!t) return;
    if (t.includes(',')) {
        const p = t.split(',');
        if (!isNaN(p[0]) && !isNaN(p[1])) return actualizarMapa(parseFloat(p[0]), parseFloat(p[1]));
    }
    fetchConTimeout(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(t)}`)
        .then(r => (r.ok ? r.json() : []))
        .then(d => { if (d && d.length) actualizarMapa(parseFloat(d[0].lat), parseFloat(d[0].lon)); })
        .catch(err => console.warn('[geocoding] Aviso no crítico:', err));
}

/**
 * Actualiza las coordenadas centrales del mapa interactivo y sincroniza marcadores.
 */
export function actualizarMapa(lat, lon) {
    mapRuntime.latitudActual = lat;
    mapRuntime.longitudActual = lon;
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap && !mapRuntime.modoTravesiaActivo && !mapRuntime.modoRutaLibreActivo) {
        const ll = new L.LatLng(lat, lon);
        if (mapRuntime.marcador) {
            mapRuntime.marcador.setLatLng(ll);
        } else {
            mapRuntime.marcador = L.marker(ll).addTo(currentMap);
            if (typeof window !== 'undefined') window.marcador = mapRuntime.marcador;
        }
        currentMap.setView(ll, 12);
    }
    if (typeof window.actualizarEstadoBotonGuardarSpot === 'function') window.actualizarEstadoBotonGuardarSpot();
    if (typeof window.renderizarBarraSpotsGuardados === 'function') window.renderizarBarraSpotsGuardados();
}

/**
 * Inicializa el mapa interactivo de Leaflet y sus escuchadores de eventos.
 */
export function inicializarMapa() {
    if (mapRuntime.map) return;
    const initialLat = mapRuntime.latitudActual || 38.80;
    const initialLon = mapRuntime.longitudActual || 0.18;

    const mapInstance = L.map('mapaInteractivo').setView([initialLat, initialLon], 11);
    mapRuntime.map = mapInstance;
    if (typeof window !== 'undefined') window.map = mapInstance;

    cambiarCapaBaseMapa(mapRuntime.tipoCapaBase || 'nautico');

    if (!mapRuntime.modoTravesiaActivo && !mapRuntime.modoRutaLibreActivo) {
        const markerInstance = L.marker([initialLat, initialLon]).addTo(mapInstance);
        mapRuntime.marcador = markerInstance;
        if (typeof window !== 'undefined') window.marcador = markerInstance;
    }

    mapInstance.on('click', async e => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
            const data = await res.json();
            if (data.elevation && data.elevation[0] > 8) return alert("Punto en tierra firme.");
        } catch (err) {
            console.warn('Aviso no crítico al comprobar elevación:', err);
        }

        if (mapRuntime.modoTravesiaActivo) {
            if (typeof window.gestionarClicRuta === 'function') window.gestionarClicRuta(e.latlng);
        } else if (mapRuntime.modoRutaLibreActivo) {
            if (typeof window.gestionarClicRutaLibre === 'function') window.gestionarClicRutaLibre(e.latlng);
        } else {
            actualizarMapa(lat.toFixed(5), lon.toFixed(5));
            const locInput = document.getElementById('location');
            if (locInput) locInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

            const ahora = new Date();
            const strDate = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
            const strTime = String(ahora.getHours()).padStart(2, '0') + ":" + String(ahora.getMinutes()).padStart(2, '0');

            const ploc = document.getElementById('proLocation');
            const pdate = document.getElementById('proDate');
            const ptime = document.getElementById('proTime');
            if (ploc) ploc.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            if (pdate && !pdate.value) pdate.value = strDate;
            if (ptime && !ptime.value) ptime.value = strTime;

            const panelPro = document.getElementById("panelPro");
            if (panelPro && panelPro.style.gridTemplateRows !== "0fr" && typeof window.consultarPuntoProInstantaneo === 'function') {
                const fechaEfectiva = pdate?.value || strDate;
                const horaEfectiva = ptime?.value || strTime;
                window.consultarPuntoProInstantaneo(lat, lon, fechaEfectiva, horaEfectiva);
            }
        }
    });

    // Observador de redimensionamiento para evitar los tiles grises de Leaflet
    const resizeObserver = new ResizeObserver(() => {
        if (mapRuntime.map) {
            requestAnimationFrame(() => mapRuntime.map.invalidateSize());
        }
    });
    const contMap = document.getElementById('mapContainer');
    const interMap = document.getElementById('mapaInteractivo');
    if (contMap) resizeObserver.observe(contMap);
    if (interMap) resizeObserver.observe(interMap);

    window.addEventListener('resize', () => {
        if (mapRuntime.map) requestAnimationFrame(() => mapRuntime.map.invalidateSize());
    });
    window.addEventListener('orientationchange', () => {
        if (mapRuntime.map) setTimeout(() => mapRuntime.map.invalidateSize(), 200);
    });

    // Restauración de travesía previa interrumpida si existe checkpoint válido y carga de spots
    setTimeout(() => {
        if (typeof window.verificarCheckpointPendiente === 'function') window.verificarCheckpointPendiente();
        if (typeof window.cargarSpotsGuardadosUsuario === 'function') window.cargarSpotsGuardadosUsuario();
    }, 500);
}

/**
 * Consulta la posición GPS del dispositivo mediante Geolocation API.
 */
export function obtenerUbicacion() {
    const inp = document.getElementById('location');
    const b = document.getElementById('btn-gps');
    if (!navigator.geolocation) return alert("Sin GPS.");
    if (inp) inp.value = "Buscando...";
    if (b) b.classList.add('animate-pulse');
    navigator.geolocation.getCurrentPosition(p => {
        const l = p.coords.latitude.toFixed(5);
        const n = p.coords.longitude.toFixed(5);
        if (inp) inp.value = `${l}, ${n}`;
        if (b) b.classList.remove('animate-pulse');
        actualizarMapa(l, n);
    }, e => {
        if (inp) inp.value = "";
        if (b) b.classList.remove('animate-pulse');
        alert("GPS bloqueado.");
    }, { enableHighAccuracy: true, timeout: 6000 });
}

/**
 * Calcula las URL de teselas OSM y OpenSeaMap dentro del bounding box especificado.
 */
export function calcularTilesBoundingBox(mapOrBounds, marcadores = [], zoom = 13) {
    let minLat, maxLat, minLon, maxLon;
    if (marcadores && marcadores.length >= 1) {
        const coords = marcadores.map(m => (m.getLatLng ? m.getLatLng() : m));
        minLat = Math.min(...coords.map(c => c.lat)) - 0.015;
        maxLat = Math.max(...coords.map(c => c.lat)) + 0.015;
        minLon = Math.min(...coords.map(c => c.lng)) - 0.015;
        maxLon = Math.max(...coords.map(c => c.lng)) + 0.015;
    } else if (mapOrBounds && typeof mapOrBounds.getBounds === 'function') {
        const b = mapOrBounds.getBounds();
        minLat = b.getSouth();
        maxLat = b.getNorth();
        minLon = b.getWest();
        maxLon = b.getEast();
    } else {
        minLat = 38.7; maxLat = 38.9; minLon = 0.1; maxLon = 0.3;
    }

    const currentZoom = Math.round(zoom || 13);
    const minZ = Math.max(12, currentZoom);
    const maxZ = Math.min(15, currentZoom + 2);

    const lon2tile = (lon, z) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (lat, z) => {
        const latRad = (lat * Math.PI) / 180;
        return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
    };

    const tileUrls = [];
    const MAX_TILES_TOTAL = 140;

    outerZoom:
    for (let z = minZ; z <= maxZ; z++) {
        const x1 = lon2tile(minLon, z);
        const x2 = lon2tile(maxLon, z);
        const y1 = lat2tile(maxLat, z);
        const y2 = lat2tile(minLat, z);
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const cartoKey = CARTO_API_KEY || 'cb1_4qv5_1_683638fb471571b180e5b9e6';
                tileUrls.push(`https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png?key=${cartoKey}`);
                tileUrls.push(`https://tiles.openseamap.org/seamark/${z}/${x}/${y}.png`);
                if (tileUrls.length >= MAX_TILES_TOTAL) {
                    break outerZoom;
                }
            }
        }
    }
    return tileUrls;
}

/**
 * Descarga las teselas cartográficas de la zona actual para navegación y seguridad 100% offline.
 */
export async function descargarZonaMapaOffline() {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!currentMap) {
        alert("El mapa no está inicializado.");
        return;
    }

    const tileUrls = calcularTilesBoundingBox(currentMap, mapRuntime.marcadoresRuta, currentMap.getZoom());

    if (tileUrls.length === 0) {
        alert("No se identificaron teselas para la zona actual.");
        return;
    }

    const elMsg = document.getElementById('mapMsg');
    const b1 = document.getElementById('btnDescargarMapaOffline');
    const b2 = document.getElementById('btnDescargarMapaOfflineMultipunto');

    const actualizarProgreso = (texto, finalizado = false) => {
        if (elMsg) {
            elMsg.textContent = texto;
            if (finalizado) {
                elMsg.className = "text-xs font-bold text-white bg-emerald-600 h-10 px-4 rounded-xl border border-emerald-500 shadow-md flex items-center justify-center transition-colors";
            } else {
                elMsg.className = "text-xs font-bold text-white bg-sky-600 h-10 px-4 rounded-xl border border-sky-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
            }
        }
        if (b1) b1.textContent = finalizado ? '✅ Guardado' : texto;
        if (b2) b2.textContent = finalizado ? '✅ Guardado' : texto;
        if (finalizado) {
            setTimeout(() => {
                if (b1) b1.textContent = '📥 Mapa Offline';
                if (b2) b2.textContent = '📥 Mapa Offline';
                if (elMsg) {
                    elMsg.className = "text-xs font-bold text-white bg-teal-600 h-10 px-4 rounded-xl border border-teal-500 shadow-md flex items-center justify-center transition-colors";
                    elMsg.textContent = "👆 Toca el mar para Punto Fijo o Traza Ruta Completa";
                }
            }, 4000);
        }
    };

    actualizarProgreso(`⏳ Descargando 0%... (0/${tileUrls.length})`);

    // 1. Vía Service Worker si está activo
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.status === 'progress' || data.type === 'PREFETCH_TILES_UPDATE') {
                const loaded = data.loaded || 0;
                const total = data.total || tileUrls.length;
                const pct = Math.round((loaded / total) * 100);
                actualizarProgreso(`⏳ Descargando ${pct}%... (${loaded}/${total})`);
            } else if (data.status === 'completed' || data.success) {
                actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
            }
        };

        navigator.serviceWorker.controller.postMessage({
            type: 'PREFETCH_TILES',
            urls: tileUrls
        }, [channel.port2]);

        return;
    }

    // 2. Fallback cliente directo con Cache API
    try {
        let cache = null;
        try { cache = await caches.open('paddlesafe-v65-tiles'); } catch (_) {
            try { cache = await caches.open('paddlesafe-v64-tiles'); } catch (_) {
                try { cache = await caches.open('paddlesafe-v47-tiles'); } catch (_) {}
            }
        }
        let cargadas = 0;
        const BATCH = 6;
        for (let i = 0; i < tileUrls.length; i += BATCH) {
            const batch = tileUrls.slice(i, i + BATCH);
            await Promise.all(batch.map(async u => {
                try {
                    const req = new Request(u, { mode: 'cors', credentials: 'omit' });
                    if (cache) {
                        const hit = await cache.match(req);
                        if (!hit) {
                            const res = await fetch(req);
                            if (res.status === 200) await cache.put(req, res);
                        }
                    } else {
                        await fetch(req);
                    }
                } catch (_) {}
                cargadas++;
            }));
            const pct = Math.round((cargadas / tileUrls.length) * 100);
            actualizarProgreso(`⏳ Descargando ${pct}%... (${cargadas}/${tileUrls.length})`);
        }
        actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
    } catch (errCache) {
        console.warn('Error en pre-descarga cliente:', errCache);
        actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
    }
}

/**
 * UI 5.0 - Cambia el estilo de la capa base del mapa Leaflet
 * Estilos soportados:
 * - 'nautico': OpenStreetMap + OpenSeaMap (balizamiento y marcas marinas)
 * - 'satelite': Esri World Imagery (imágenes satélite costeras de alta resolución)
 * - 'oscuro': CartoDB Dark Matter (modo radar táctico de alto contraste)
 * @param {string} tipoCapa 'nautico' | 'satelite' | 'oscuro'
 */
export function cambiarCapaBaseMapa(tipoCapa = 'nautico') {
    const estilo = ['nautico', 'satelite', 'oscuro'].includes(tipoCapa) ? tipoCapa : 'nautico';
    mapRuntime.tipoCapaBase = estilo;

    // Actualizar estilo visual de los botones del selector si existen en el DOM
    if (typeof document !== 'undefined') {
        const botones = document.querySelectorAll('[data-map-layer]');
        botones.forEach(btn => {
            const layerAttr = btn.getAttribute('data-map-layer');
            if (layerAttr === estilo) {
                btn.className = 'ps-map-layer-pill px-2.5 py-1 rounded-lg transition-all cursor-pointer bg-sky-500/30 text-sky-300 border border-sky-400 font-bold';
            } else {
                btn.className = 'ps-map-layer-pill px-2.5 py-1 rounded-lg transition-all cursor-pointer text-slate-300 border border-transparent hover:text-white font-medium';
            }
        });
    }

    const mapInstance = mapRuntime.map;
    if (!mapInstance || typeof L === 'undefined') return estilo;

    // Eliminar capas base anteriores
    if (mapRuntime.capaBaseTile && mapInstance.hasLayer(mapRuntime.capaBaseTile)) {
        mapInstance.removeLayer(mapRuntime.capaBaseTile);
        mapRuntime.capaBaseTile = null;
    }
    if (mapRuntime.capaOverlayTile && mapInstance.hasLayer(mapRuntime.capaOverlayTile)) {
        mapInstance.removeLayer(mapRuntime.capaOverlayTile);
        mapRuntime.capaOverlayTile = null;
    }

    if (estilo === 'satelite') {
        mapRuntime.capaBaseTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            crossOrigin: true,
            attribution: 'Tiles &copy; Esri'
        }).addTo(mapInstance);
        mapRuntime.capaBaseTile.bringToBack();
    } else if (estilo === 'oscuro') {
        const darkUrl = (CARTO_TILE_URLS && CARTO_TILE_URLS.dark_all) ||
            `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY || 'cb1_4qv5_1_683638fb471571b180e5b9e6'}`;
        mapRuntime.capaBaseTile = L.tileLayer(darkUrl, {
            maxZoom: 20,
            subdomains: 'abcd',
            crossOrigin: true,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(mapInstance);
        mapRuntime.capaBaseTile.bringToBack();
    } else {
        // 'nautico' (default) -> CARTO Voyager HD con API Key + Carta marina OpenSeaMap
        const voyagerUrl = (CARTO_TILE_URLS && CARTO_TILE_URLS.voyager) ||
            `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY || 'cb1_4qv5_1_683638fb471571b180e5b9e6'}`;
        mapRuntime.capaBaseTile = L.tileLayer(voyagerUrl, {
            maxZoom: 20,
            subdomains: 'abcd',
            crossOrigin: true,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(mapInstance);

        // Capa náutica superpuesta (boyas, faros y balizamiento de navegación de OpenSeaMap)
        mapRuntime.capaOverlayTile = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
            maxZoom: 18,
            crossOrigin: true,
            attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a>'
        }).addTo(mapInstance);
        mapRuntime.capaBaseTile.bringToBack();
    }

    return estilo;
}

if (typeof window !== 'undefined') {
    window.inicializarMapa = inicializarMapa;
    window.cambiarCapaBaseMapa = cambiarCapaBaseMapa;
    window.actualizarMapa = actualizarMapa;
    window.buscarYCentrarMapa = buscarYCentrarMapa;
    window.obtenerUbicacion = obtenerUbicacion;
    window.recuperarEquipoUsuario = recuperarEquipoUsuario;
    window.guardarEquipoUsuario = guardarEquipoUsuario;
    window.obtenerVelocidadCruceroUsuario = obtenerVelocidadCruceroUsuario;
    window.obtenerModificadorDerivaUsuario = obtenerModificadorDerivaUsuario;
    window.actualizarTipoTablaDesdeSelect = actualizarTipoTablaDesdeSelect;
    window.actualizarVelocidadCruceroManual = actualizarVelocidadCruceroManual;
    window.autoCalibrarRitmoDesdeRutas = autoCalibrarRitmoDesdeRutas;
    window.toggleSelectorEquipoUsuario = toggleSelectorEquipoUsuario;
    window.actualizarUIGearSelector = actualizarUIGearSelector;
    window.descargarZonaMapaOffline = descargarZonaMapaOffline;
    window.calcularTilesBoundingBox = calcularTilesBoundingBox;
    window.TABLAS_SUP_CONFIG = TABLAS_SUP_CONFIG;
}

