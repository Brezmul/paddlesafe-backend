import { supabaseClient, appState } from '../config.js';
import {
    esc,
    safeUrl,
    IMG_FALLBACK,
    kmhANudos,
    calcularMotorExpertoPaddleSafe
} from '../utils.js';

// Cache ligero en memoria para no saturar APIs meteorológicas en la misma sesión
const weatherCache = new Map();
const ICONOS_SEGURIDAD = {
    'SEGURO': '🟢',
    'PRECAUCIÓN': '🟡',
    'RIESGO ELEVADO': '🟠',
    'PELIGROSO': '🔴',
    'RIESGO EXTREMO': '⛔'
};
const ICONOS_DERIVA = {
    'BAJO': '🟢',
    'MODERADO': '🟡',
    'ALTO': '🟠',
    'MUY ALTO': '🔴',
    'EXTREMO': '⛔'
};

export const ClubEvents = {
    async render(container, clubId, isMember = true, isAdmin = false) {
        if (!container) return;

        container.innerHTML = `
            <div class="space-y-4">
                <!-- Barra de Acciones del Club -->
                <div class="bg-gradient-to-r from-marine to-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div class="text-center sm:text-left">
                        <h4 class="text-xs font-black uppercase tracking-wider text-water flex items-center gap-1.5 justify-center sm:justify-start">
                            <span>📅</span> Quedadas y Rutas del Club
                        </h4>
                        <p class="text-[11px] text-slate-300 mt-0.5">Organiza salidas con fecha, hora y previsión marina en tiempo real.</p>
                    </div>
                    <button type="button" onclick="if(window.iniciarCreacionQuedadaClub) window.iniciarCreacionQuedadaClub('${esc(clubId)}')" class="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-water to-sky-600 hover:from-sky-500 hover:to-sky-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0">
                        <span>➕ Planificar en el Mapa</span>
                    </button>
                </div>

                <!-- Lista de Quedadas -->
                <div id="clubEventsList" class="space-y-4">
                    <p class="text-center text-slate-400 py-8 text-xs font-bold animate-pulse">Cargando quedadas del club...</p>
                </div>
            </div>`;

        await this.cargarEventos(clubId, isAdmin);
    },

    async cargarEventos(clubId, isAdmin) {
        const list = document.getElementById('clubEventsList');
        if (!list) return;

        try {
            // Consultar eventos del club ordenados por fecha_evento
            const { data: eventos, error } = await supabaseClient
                .from('club_eventos')
                .select('*')
                .eq('club_id', clubId)
                .order('fecha_evento', { ascending: true });

            if (error) {
                console.error('[club.events] error cargar eventos:', error);
                list.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar quedadas: ${esc(error.message)}</p>`;
                return;
            }

            if (!eventos || eventos.length === 0) {
                list.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-10 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                        <span class="text-4xl mb-2 opacity-60">🧭</span>
                        <p class="text-xs font-black text-marine dark:text-white uppercase tracking-wider">No hay quedadas programadas</p>
                        <p class="text-[11px] text-slate-400 mt-1 max-w-[280px]">Utiliza el mapa interactivo de abajo para diseñar una ruta y convocar a tu club.</p>
                        <button type="button" onclick="if(window.iniciarCreacionQuedadaClub) window.iniciarCreacionQuedadaClub('${esc(clubId)}')" class="mt-4 px-4 py-2 bg-water text-white font-bold text-xs rounded-xl shadow active:scale-95 transition-transform cursor-pointer">
                            📍 Crear Primera Quedada
                        </button>
                    </div>`;
                return;
            }

            const myId = appState.sesionActual?.user?.id;
            const eventIds = eventos.map(e => e.id);

            // Consultar asistentes de estos eventos
            let asistentesPorEvento = {};
            try {
                const { data: asist } = await supabaseClient
                    .from('club_eventos_asistentes')
                    .select('evento_id, user_id')
                    .in('evento_id', eventIds);

                if (asist) {
                    asist.forEach(a => {
                        if (!asistentesPorEvento[a.evento_id]) asistentesPorEvento[a.evento_id] = [];
                        asistentesPorEvento[a.evento_id].push(a.user_id);
                    });
                }
            } catch (err) {
                console.warn('[club.events] aviso asistentes:', err);
            }

            // Consultar perfiles de creadores
            const creatorIds = [...new Set(eventos.map(e => e.creador_id).filter(Boolean))];
            let creadoresMap = {};
            if (creatorIds.length > 0) {
                try {
                    const { data: perfiles } = await supabaseClient
                        .from('perfiles')
                        .select('id, nombre, avatar_url')
                        .in('id', creatorIds);
                    if (perfiles) perfiles.forEach(p => { creadoresMap[p.id] = p; });
                } catch (_) {}
            }

            list.innerHTML = eventos.map(ev => {
                const creador = creadoresMap[ev.creador_id] || { nombre: 'Paddler', avatar_url: IMG_FALLBACK };
                const asistentes = asistentesPorEvento[ev.id] || [];
                const esAsistente = myId ? asistentes.includes(myId) : false;
                const puedeEliminar = isAdmin || (myId && ev.creador_id === myId);

                return this.renderTarjetaEvento(ev, creador, asistentes.length, esAsistente, puedeEliminar, clubId);
            }).join('');

            // Inicializar mini-mapas Leaflet para cada tarjeta
            eventos.forEach(ev => {
                this.inicializarMiniMapa(ev);
                this.cargarPrevisionEvento(ev);
            });

        } catch (err) {
            console.error('[club.events] error inesperado:', err);
            list.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error de conexión al cargar quedadas.</p>`;
        }
    },

    renderTarjetaEvento(ev, creador, totalAsistentes, esAsistente, puedeEliminar, clubId) {
        const fecha = new Date(ev.fecha_evento);
        const ahora = new Date();
        const diffMs = fecha.getTime() - ahora.getTime();
        const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const esPasado = diffMs < 0;

        let badgeTiempo = '';
        if (esPasado) {
            badgeTiempo = '<span class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 text-[10px] font-bold rounded-lg uppercase tracking-wider">🏁 Finalizada</span>';
        } else if (diffDias <= 0) {
            badgeTiempo = '<span class="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider animate-pulse">🔥 ¡Hoy!</span>';
        } else if (diffDias === 1) {
            badgeTiempo = '<span class="px-2.5 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider">⏰ Mañana</span>';
        } else {
            badgeTiempo = `<span class="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-bold rounded-lg uppercase tracking-wider">📅 En ${diffDias} días</span>`;
        }

        const fechaLabel = fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const horaLabel = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        return `
            <div id="card-evento-${ev.id}" class="ps-bento-card bg-slate-900/90 rounded-2xl border border-slate-700/80 shadow-md overflow-hidden transition-all hover:shadow-lg">
                <!-- Cabecera de la Tarjeta -->
                <div class="p-4 border-b border-slate-100 dark:border-slate-700/60">
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap mb-1">
                                ${badgeTiempo}
                                <span class="text-xs font-black text-slate-300 capitalize ps-tabular">${fechaLabel} • ${horaLabel} h</span>
                            </div>
                            <h4 class="text-base font-black text-marine dark:text-white truncate">${esc(ev.nombre)}</h4>
                        </div>
                        ${puedeEliminar ? `
                            <button type="button" onclick="window.Club.eliminarEventoClub('${esc(ev.id)}', '${esc(clubId)}')" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer" title="Eliminar quedada">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>` : ''}
                    </div>

                    ${ev.descripcion ? `<p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">${esc(ev.descripcion)}</p>` : ''}

                    <!-- Métricas del Recorrido -->
                    <div class="flex items-center gap-3 text-xs font-bold">
                        <span class="px-2.5 py-1 bg-water/10 text-water dark:bg-sky-500/20 dark:text-sky-300 rounded-lg">
                            📏 ${Number(ev.distancia_km || 0).toFixed(2)} km
                        </span>
                        <span class="px-2.5 py-1 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg">
                            ⏱️ ~${ev.tiempo_minutos || 0} min
                        </span>
                        <div class="flex items-center gap-1.5 ml-auto text-[11px] text-slate-400">
                            <img src="${esc(safeUrl(creador.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-4 h-4 rounded-full object-cover">
                            <span class="truncate max-w-[100px]">${esc(creador.nombre)}</span>
                        </div>
                    </div>
                </div>

                <!-- 'Captura' / Previsualización de la Ruta en Mapa -->
                <div class="relative w-full h-36 bg-slate-200 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                    <div id="minimap-event-${ev.id}" class="w-full h-full"></div>
                    <button type="button" onclick="window.Club.abrirRutaEnMapaGrande('${esc(JSON.stringify(ev.ruta_json))}', '${esc(ev.nombre)}')" class="absolute bottom-2 right-2 z-[400] px-3 py-1 bg-slate-900/80 hover:bg-slate-900 text-white font-bold text-[10px] rounded-lg shadow-md backdrop-blur-xs flex items-center gap-1 cursor-pointer transition-colors">
                        <span>🔍 Abrir en mapa</span>
                    </button>
                </div>

                <!-- Previsión Meteorológica y Marina en Tiempo Real -->
                <div id="weather-event-${ev.id}" class="p-3 bg-slate-50/70 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 text-xs">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider animate-pulse">📡 Obteniendo previsión marina en tiempo real...</p>
                </div>

                <!-- Pie de Tarjeta: Asistentes y Botón Apuntarse -->
                <div class="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-800">
                    <div class="flex items-center gap-1.5">
                        <span class="text-base">👥</span>
                        <span id="evento-count-${esc(ev.id)}" class="text-xs font-bold text-slate-200 ps-tabular">${totalAsistentes} palistas confirmados</span>
                    </div>

                    ${!esPasado ? `
                        <button id="btn-asistir-${esc(ev.id)}" type="button" onclick="window.Club.toggleAsistenciaEvento('${esc(ev.id)}', '${esc(clubId)}')" class="px-4 py-2 ${esAsistente ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300' : 'bg-water hover:bg-sky-600 text-white shadow-sm'} font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer">
                            ${esAsistente ? '✅ Asistiré' : '🙋‍♂️ Me apunto'}
                        </button>` : `
                        <span class="text-[11px] font-bold text-slate-400">Ruta celebrada</span>`}
                </div>
            </div>`;
    },

    inicializarMiniMapa(ev) {
        const mapId = `minimap-event-${ev.id}`;
        const container = document.getElementById(mapId);
        if (!container || !window.L || !ev.ruta_json || !Array.isArray(ev.ruta_json) || ev.ruta_json.length === 0) return;

        try {
            const coords = ev.ruta_json.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
            const miniMap = window.L.map(mapId, {
                zoomControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                attributionControl: false
            });

            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_4qv5_1_683638fb471571b180e5b9e6', { maxZoom: 18, subdomains: 'abcd', crossOrigin: true, attribution: '&copy; CARTO' }).addTo(miniMap);

            const poly = window.L.polyline(coords, {
                color: '#0284c7',
                weight: 4,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(miniMap);

            // Marcador de inicio (verde)
            window.L.circleMarker(coords[0], {
                radius: 5,
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 1
            }).addTo(miniMap);

            // Marcador de fin (rojo)
            if (coords.length > 1) {
                window.L.circleMarker(coords[coords.length - 1], {
                    radius: 5,
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 1
                }).addTo(miniMap);
            }

            miniMap.fitBounds(poly.getBounds(), { padding: [15, 15] });
        } catch (e) {
            console.warn('[club.events] aviso mini-mapa:', e);
        }
    },

    async cargarPrevisionEvento(ev) {
        const weatherEl = document.getElementById(`weather-event-${ev.id}`);
        if (!weatherEl) return;

        if (!ev.ruta_json || !ev.ruta_json.length) {
            weatherEl.innerHTML = `<span class="text-[10px] text-slate-400 font-bold">Sin coordenadas para meteorología.</span>`;
            return;
        }

        const pt0 = ev.ruta_json[0];
        const lat = Array.isArray(pt0) ? pt0[0] : pt0.lat;
        const lon = Array.isArray(pt0) ? pt0[1] : pt0.lng;
        const fecha = new Date(ev.fecha_evento);
        const ahora = new Date();

        // Si ya pasó
        if (fecha.getTime() < ahora.getTime()) {
            weatherEl.innerHTML = `<span class="text-[10px] text-slate-400 font-bold">Ruta finalizada. Registros archivados.</span>`;
            return;
        }

        // Si es a más de 7 días, mostrar aviso
        const diffMs = fecha.getTime() - ahora.getTime();
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        if (diffDias > 7) {
            weatherEl.innerHTML = `<span class="text-[10px] text-amber-500 font-bold">📡 Previsión disponible 7 días antes de la fecha.</span>`;
            return;
        }

        try {
            const data = await this.obtenerPrevisionOpenMeteo(lat, lon, fecha);
            if (!data) {
                weatherEl.innerHTML = `<span class="text-[10px] text-slate-400 font-bold">Previsión no disponible actualmente.</span>`;
                return;
            }

            const verdictClass = {
                'SEGURO': 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
                'PRECAUCIÓN': 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
                'RIESGO ELEVADO': 'text-orange-500 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
                'PELIGROSO': 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
                'RIESGO EXTREMO': 'text-red-700 bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800'
            }[data.veredictoNivel];
            const vientoNudos = kmhANudos(data.viento);

            weatherEl.innerHTML = `
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <span class="text-base">${data.iconoClima}</span>
                        <span class="font-black text-slate-700 dark:text-slate-200">${data.temp}°C</span>
                        <span class="text-slate-300 dark:text-slate-600">•</span>
                        <span class="font-bold text-slate-600 dark:text-slate-300">🌬️ ${vientoNudos === null ? 'N/D' : `${vientoNudos.toFixed(1)} kt`} (${data.dirViento})</span>
                        ${data.rachasNudos !== null ? `<span class="font-bold text-rose-500">Rachas ${data.rachasNudos.toFixed(1)} kt</span>` : ''}
                        ${data.oleaje ? `<span class="text-slate-300 dark:text-slate-600">•</span><span class="font-bold text-sky-500">🌊 ${data.oleaje} m</span>` : ''}
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${verdictClass}">
                        ${data.veredictoTexto}
                    </span>
                </div>
                <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    ${ICONOS_DERIVA[data.riesgoDeriva.nivel]} Deriva ${esc(data.riesgoDeriva.nivel)} (${data.riesgoDeriva.score}/100): ${esc(data.riesgoDeriva.descripcion)}
                </p>`;
        } catch (err) {
            console.warn('[club.events] fallo previsão:', err);
            weatherEl.innerHTML = `<span class="text-[10px] text-slate-400 font-bold">Previsión marina temporalmente fuera de cobertura.</span>`;
        }
    },

    async obtenerPrevisionOpenMeteo(lat, lon, fecha) {
        const diaStr = fecha.toISOString().slice(0, 10);
        const horaBuscada = fecha.getHours();
        const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${diaStr}_${horaBuscada}`;

        if (weatherCache.has(cacheKey)) {
            return weatherCache.get(cacheKey);
        }

        const pos = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=auto`;
        const wxUrl = `https://api.open-meteo.com/v1/forecast?${pos}&hourly=windspeed_10m,winddirection_10m,windgusts_10m,temperature_2m,precipitation_probability,weathercode&start_date=${diaStr}&end_date=${diaStr}`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${pos}&hourly=wave_height&start_date=${diaStr}&end_date=${diaStr}`;

        const [wxRes, marineRes] = await Promise.allSettled([
            fetch(wxUrl).then(r => r.ok ? r.json() : null),
            fetch(marineUrl).then(r => r.ok ? r.json() : null)
        ]);

        const wxData = wxRes.status === 'fulfilled' ? wxRes.value : null;
        const marineData = marineRes.status === 'fulfilled' ? marineRes.value : null;

        if (!wxData || !wxData.hourly || !wxData.hourly.time) return null;

        // Buscar el índice más cercano a la hora del evento
        let idx = 0;
        let minDiff = 999;
        wxData.hourly.time.forEach((t, i) => {
            const h = new Date(t).getHours();
            const diff = Math.abs(h - horaBuscada);
            if (diff < minDiff) {
                minDiff = diff;
                idx = i;
            }
        });

        const wind = Number(wxData.hourly.windspeed_10m[idx] || 0);
        const gustRaw = wxData.hourly.windgusts_10m[idx];
        const gusts = gustRaw === null || gustRaw === undefined ? null : Number(gustRaw);
        const windDirDeg = Number(wxData.hourly.winddirection_10m[idx] || 0);
        const temp = Math.round(Number(wxData.hourly.temperature_2m[idx] || 20));
        const code = Number(wxData.hourly.weathercode[idx] || 0);

        let wave = null;
        if (marineData && marineData.hourly && marineData.hourly.wave_height) {
            const val = marineData.hourly.wave_height[idx];
            if (val != null) wave = Number(val).toFixed(1);
        }

        // Dirección del viento en rosa de los vientos
        const direcciones = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        const dirIndex = Math.round(windDirDeg / 45) % 8;
        const dirViento = direcciones[dirIndex];

        // Icono de clima
        let iconoClima = '☀️';
        if ([1, 2, 3].includes(code)) iconoClima = '⛅';
        else if ([45, 48].includes(code)) iconoClima = '🌫️';
        else if ([51, 53, 55, 61, 63, 65].includes(code)) iconoClima = '🌧️';
        else if ([80, 81, 82].includes(code)) iconoClima = '🌦️';
        else if ([95, 96, 99].includes(code)) iconoClima = '⛈️';

        const motor = calcularMotorExpertoPaddleSafe({
            vientoKmh: wind,
            rachasKmh: gusts,
            olaM: wave === null ? null : Number(wave),
            direccionViento: windDirDeg,
            tormenta: [95, 96, 99].includes(code) ? 'posible' : null
        });

        const res = {
            viento: wind.toFixed(0),
            rachasNudos: kmhANudos(gusts),
            dirViento,
            temp,
            oleaje: wave,
            iconoClima,
            veredictoNivel: motor.seguridad.nivel,
            veredictoTexto: `${ICONOS_SEGURIDAD[motor.seguridad.nivel]} ${motor.seguridad.nivel} · ${motor.seguridad.score}/100`,
            seguridad: motor.seguridad,
            riesgoDeriva: motor.riesgoDeriva
        };

        weatherCache.set(cacheKey, res);
        return res;
    },

    async toggleAsistencia(eventoId, clubId) {
        if (!appState.sesionActual || appState.esInvitado) {
            alert("Debes iniciar sesión para apuntarte a una quedada.");
            if (window.abrirModalAuth) window.abrirModalAuth();
            return;
        }

        const myId = appState.sesionActual.user.id;
        const btn = document.getElementById(`btn-asistir-${eventoId}`);
        const countSpan = document.getElementById(`evento-count-${eventoId}`);

        try {
            // Comprobar si ya está inscrito
            const { data: existente } = await supabaseClient
                .from('club_eventos_asistentes')
                .select('evento_id')
                .eq('evento_id', eventoId)
                .eq('user_id', myId)
                .maybeSingle();

            if (existente) {
                // Cancelar asistencia
                const { error } = await supabaseClient
                    .from('club_eventos_asistentes')
                    .delete()
                    .eq('evento_id', eventoId)
                    .eq('user_id', myId);
                if (error) throw error;

                // Actualizar UI inmediatamente
                if (btn) {
                    btn.className = "px-4 py-2 bg-water hover:bg-sky-600 text-white shadow-sm font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer";
                    btn.innerHTML = '🙋‍♂️ Me apunto';
                }
                if (countSpan) {
                    const c = Math.max(0, parseInt(countSpan.textContent || '0', 10) - 1);
                    countSpan.textContent = `${c} palistas confirmados`;
                }
            } else {
                // Apuntarse
                const { error } = await supabaseClient
                    .from('club_eventos_asistentes')
                    .insert([{
                        evento_id: eventoId,
                        user_id: myId
                    }]);
                if (error) throw error;

                // Actualizar UI inmediatamente
                if (btn) {
                    btn.className = "px-4 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer";
                    btn.innerHTML = '✅ Asistiré';
                }
                if (countSpan) {
                    const c = parseInt(countSpan.textContent || '0', 10) + 1;
                    countSpan.textContent = `${c} palistas confirmados`;
                }
            }
        } catch (err) {
            console.error('[club.events] error toggle asistencia:', err);
            alert("Error al actualizar asistencia: " + (err.message || err));
            await this.cargarEventos(clubId, false);
        }
    },

    async eliminarEvento(eventoId, clubId) {
        if (!confirm("¿Deseas cancelar y eliminar esta quedada para todo el club?")) return;

        try {
            // Eliminar asistentes primero para evitar conflicto de clave foránea
            try {
                await supabaseClient.from('club_eventos_asistentes').delete().eq('evento_id', eventoId);
            } catch (_) {}

            const { error } = await supabaseClient.from('club_eventos').delete().eq('id', eventoId);
            if (error) throw error;

            alert("Quedada cancelada y eliminada.");
            await this.cargarEventos(clubId, false);
        } catch (err) {
            console.error('[club.events] error al eliminar quedada:', err);
            alert("Error al eliminar la quedada: " + (err.message || err));
        }
    }
};
