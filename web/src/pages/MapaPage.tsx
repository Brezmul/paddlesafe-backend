import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SpotMap } from '@/components/SpotMap';
import { Aviso, Boton, Campo, inputCls, Tarjeta } from '@/components/ui';
import { PACKS_SPOTS } from '@/data/packs';
import { buscarLugares, cardinal, distanciaKm, formatoTiempo, idaYVuelta, precargarMapa, type Lugar } from '@/lib/geo';
import {
  evaluarHora,
  evaluarLugar,
  equipoTermico,
  leerGpx,
  pedirCoach,
  textoParteGuardado,
  xmlGpx,
  type HoraMarina,
  type Motor,
  type Nivel,
  type Pronostico
} from '@/lib/legacy';
import {
  actualizarNotasSpot,
  borrarSpot,
  cargarSpots,
  guardarRutaEnNube,
  guardarRutaPendiente,
  guardarSpot,
  textoError,
  type SpotGuardado
} from '@/lib/db';
import { guardarNivel, leerNivel, leerTelefonoEmergencia, guardarTelefonoEmergencia } from '@/lib/prefs';
import { medicionNumerica, prepararEntradaCoach } from '@/lib/medicion';
import { aplicarExito, aplicarFallo, aplicarHora, crearEstadoConsulta, iniciarEvaluacion } from '@/lib/consultaLugar';
import { dejarDeSeguir, leerPosicion, seguirPosicion } from '@/lib/gps';
import { supabase } from '@/lib/supabase';

type Modo = 'spot' | 'ruta' | 'vivo';

const INICIO: [number, number] = [38.8, 0.18];

export function MapaPage() {
  const { userId, guest, perfil, session } = useAuth();
  const [modo, setModo] = useState<Modo>('spot');
  const [lat, setLat] = useState(INICIO[0]);
  const [lon, setLon] = useState(INICIO[1]);
  const [nombre, setNombre] = useState('Jávea');
  const [consulta, setConsulta] = useState('');
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [foco, setFoco] = useState(0);
  const [nivel, setNivel] = useState<Nivel>(leerNivel());
  const [pronostico, setPronostico] = useState<Pronostico | null>(null);
  const [motor, setMotor] = useState<Motor | null>(null);
  const [horaIdx, setHoraIdx] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spots, setSpots] = useState<SpotGuardado[]>([]);
  const [puntos, setPuntos] = useState<Array<[number, number]>>([]);
  const [comparacion, setComparacion] = useState<Array<{ nombre: string; estado: string; score: number }>>([]);
  const [coach, setCoach] = useState<string | null>(null);
  const [reporte, setReporte] = useState('mar_plato');
  const [comentario, setComentario] = useState('');
  const [notas, setNotas] = useState({ notas_tacticas: '', acceso_parking: '', peligros_locales: '' });
  const [bitacora, setBitacora] = useState('');
  const [rating, setRating] = useState(5);
  const [sesionViva, setSesionViva] = useState(false);
  const [recorrido, setRecorrido] = useState<Array<[number, number]>>([]);
  const [inicioMs, setInicioMs] = useState<number | null>(null);
  const watchId = useRef<string | null>(null);
  const parteRef = useRef(crearEstadoConsulta());
  const [telefono, setTelefono] = useState(leerTelefonoEmergencia());
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [termicaAbierta, setTermicaAbierta] = useState(false);
  const [intensidad, setIntensidad] = useState<'paseo' | 'travesia' | 'race'>('paseo');
  const [frio, setFrio] = useState<'friolero' | 'normal' | 'caluroso'>('normal');

  const tabla = perfil?.sup_board_type || null;
  const crucero = Number(perfil?.sup_cruise_speed_kmh || 4.5);

  useEffect(() => {
    cargarSpots(userId).then(setSpots).catch(() => setSpots([]));
  }, [userId]);

  const horas = pronostico?.horasDiurnas || [];
  const kmRuta = useMemo(() => distanciaKm(puntos), [puntos]);
  const minutosRuta = crucero > 0 ? (kmRuta / crucero) * 60 : 0;

  function irA(nextLat: number, nextLon: number, nextNombre?: string) {
    setLat(nextLat);
    setLon(nextLon);
    if (nextNombre) setNombre(nextNombre);
    setFoco((n) => n + 1);
    setLugares([]);
  }

  async function buscar() {
    setError(null);
    try {
      setLugares(await buscarLugares(consulta));
    } catch (err) {
      setError(textoError(err));
    }
  }

  async function usarGps() {
    setError(null);
    try {
      const pos = await leerPosicion();
      irA(pos.lat, pos.lon, 'Mi posición');
    } catch {
      setError('No se ha podido leer el GPS. Revisa el permiso de ubicación.');
    }
  }

  async function evaluar(enLat = lat, enLon = lon, enNombre = nombre) {
    const iniciado = iniciarEvaluacion(parteRef.current);
    parteRef.current = iniciado.estado;
    setPronostico(null);
    setMotor(null);
    setHoraIdx(0);
    setCargando(true);
    setError(null);
    setCoach(null);
    try {
      const resultado = await evaluarLugar({ lat: enLat, lon: enLon, nombre: enNombre, nivel, boardType: tabla });
      const next = aplicarExito(parteRef.current, iniciado.id, resultado.pronostico, resultado.motor);
      parteRef.current = next;
      if (next.generacion !== iniciado.id) return;
      setPronostico(next.pronostico);
      setMotor(next.motor);
      setHoraIdx(0);
      const spot = spots.find((s) => s.nombre === enNombre);
      if (spot) {
        setNotas({
          notas_tacticas: spot.notas_tacticas || '',
          acceso_parking: spot.acceso_parking || '',
          peligros_locales: spot.peligros_locales || ''
        });
      }
    } catch (err) {
      const next = aplicarFallo(parteRef.current, iniciado.id, textoError(err));
      parteRef.current = next;
      if (next.generacion !== iniciado.id) return;
      setPronostico(null);
      setMotor(null);
      setError(next.error);
    } finally {
      if (parteRef.current.generacion === iniciado.id) setCargando(false);
    }
  }

  function elegirHora(indice: number) {
    const actual = parteRef.current.pronostico;
    const hora = actual?.horasDiurnas?.[indice];
    if (!actual || !hora) return;
    const motorHora = evaluarHora(actual, hora, nivel, tabla);
    parteRef.current = aplicarHora(parteRef.current, indice, motorHora);
    setHoraIdx(indice);
    setMotor(motorHora);
  }

  async function favorito() {
    const lista = await guardarSpot(userId, { nombre, lat, lon });
    setSpots(lista);
    setMensaje(userId ? 'Spot guardado en tu cuenta.' : 'Spot guardado en este dispositivo. Entra para sincronizarlo.');
  }

  async function comparar() {
    setCargando(true);
    setError(null);
    const muestra = spots.slice(0, 4);
    const filas: Array<{ nombre: string; estado: string; score: number }> = [];
    for (const spot of muestra) {
      try {
        const resultado = await evaluarLugar({
          lat: Number(spot.lat),
          lon: Number(spot.lon),
          nombre: spot.nombre,
          nivel,
          boardType: tabla
        });
        filas.push({
          nombre: spot.nombre,
          estado: resultado.motor.estado || 'Sin datos',
          score: Number(resultado.motor.score ?? 0)
        });
      } catch {
        filas.push({ nombre: spot.nombre, estado: 'Sin datos', score: 0 });
      }
    }
    setComparacion(filas);
    setCargando(false);
  }

  async function enviarReporte() {
    if (!session || !supabase) {
      setError('Entra con tu cuenta para publicar un reporte.');
      return;
    }
    const { error: err } = await supabase.from('spot_reports').insert([{
      user_id: session.user.id,
      autor_nombre: perfil?.nombre || 'Paddler',
      spot_nombre: nombre,
      lat,
      lon,
      tag: reporte,
      comentario: comentario || null
    }]);
    if (err) setError(err.message);
    else {
      setComentario('');
      setMensaje('Reporte publicado. Se muestra unas horas y luego caduca.');
    }
  }

  async function guardarBitacora() {
    const entrada = {
      spot_nombre: nombre,
      lat,
      lon,
      fecha: new Date().toISOString().slice(0, 10),
      viento_previsto_kt: motor?.detallesTecnicos?.vientoKt ?? null,
      viento_real_bias: 'exacto',
      olas_m: motor?.detallesTecnicos?.oleajeM ?? null,
      rating,
      notas: bitacora
    };
    const previas = JSON.parse(localStorage.getItem('ps_spot_logbook') || '[]');
    localStorage.setItem('ps_spot_logbook', JSON.stringify([entrada, ...previas].slice(0, 80)));
    if (supabase && userId) {
      const { error: err } = await supabase.from('spot_logbook').insert([{ ...entrada, user_id: userId }]);
      if (err) {
        setMensaje('Bitácora guardada en el dispositivo. La nube ha respondido: ' + err.message);
        return;
      }
    }
    setBitacora('');
    setMensaje('Entrada de bitácora guardada.');
  }

  async function coachAhora() {
    if (!motor) return;
    if (pronostico?._desdeSnapshot) {
      setCoach('El coach no se consulta con un parte guardado: no es una medición actual.');
      return;
    }
    const entrada = prepararEntradaCoach(motor);
    if (!entrada.consultar) {
      setCoach(entrada.motivo);
      return;
    }
    setCargando(true);
    try {
      const data = await pedirCoach({
        nivel,
        vientoKmh: entrada.vientoKt * 1.852,
        rachasKmh: entrada.rachasKt * 1.852,
        direccion: medicionNumerica(pronostico?.windDirection) ?? 0,
        oleaje: entrada.oleajeM,
        periodo: entrada.periodoS,
        tempAire: motor.detallesTecnicos?.tempAireC ?? 'N/D',
        tempAgua: motor.detallesTecnicos?.tempAguaC ?? 'N/D',
        lat,
        lon,
        ubicacion: nombre,
        distanciaKm: Number(kmRuta.toFixed(2)),
        duracionMin: Math.round(minutosRuta || 60)
      });
      const c = data.coach;
      const lineas = [
        c?.veredicto,
        c?.resumen,
        c?.regla_oro ? `Regla de oro: ${c.regla_oro}` : '',
        ...(c?.consejos_nivel || []),
        ...(c?.seguridad_estrategia || [])
      ].filter(Boolean);
      setCoach(lineas.join('\n\n') || 'El coach no ha devuelto un texto.');
    } catch (err) {
      setError(textoError(err));
    } finally {
      setCargando(false);
    }
  }

  function alPulsarMapa(nextLat: number, nextLon: number) {
    if (modo === 'ruta') {
      setPuntos((lista) => [...lista, [Number(nextLat.toFixed(5)), Number(nextLon.toFixed(5))]]);
      return;
    }
    irA(nextLat, nextLon, modo === 'spot' ? 'Punto del mapa' : nombre);
  }

  function exportarGpx(coords: Array<[number, number]>, titulo: string) {
    const xml = xmlGpx(coords, titulo);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo.replace(/\s+/g, '_').slice(0, 40)}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importarGpx(file: File) {
    try {
      const texto = await file.text();
      const parsed = leerGpx(texto);
      if (!parsed.coordinates?.length) throw new Error('El archivo no tiene recorrido.');
      setPuntos(parsed.coordinates);
      setModo('ruta');
      irA(parsed.coordinates[0][0], parsed.coordinates[0][1], file.name.replace(/\.gpx$/i, ''));
      setMensaje(`GPX importado: ${parsed.total_distance_km} km.`);
    } catch (err) {
      setError(textoError(err));
    }
  }

  async function guardarRuta(coords: Array<[number, number]>, minutos: number, titulo: string) {
    const km = distanciaKm(coords);
    if (coords.length < 2 || km < 0.05) {
      setError('Hacen falta al menos dos puntos y un recorrido real.');
      return;
    }
    const puntosXp = Math.round(km * 100);
    if (!userId) {
      guardarRutaPendiente({
        user_id: guest ? `guest_${localStorage.getItem('ps_guest_uid') || 'local'}` : 'guest_local',
        km,
        min: minutos,
        coords,
        ubicacion: titulo,
        points_earned: puntosXp
      });
      if (!localStorage.getItem('ps_guest_uid')) localStorage.setItem('ps_guest_uid', crypto.randomUUID());
      setMensaje('Ruta guardada en el dispositivo. Al entrar con tu cuenta se intentará sincronizar.');
      return;
    }
    try {
      await guardarRutaEnNube({
        userId,
        distanciaKm: km,
        tiempoMinutos: minutos,
        coords,
        ubicacion: titulo,
        pointsEarned: puntosXp,
        avgSpeed: minutos > 0 ? km / (minutos / 60) : undefined
      });
      setMensaje('Ruta guardada en tu cuenta.');
    } catch (err) {
      setError(textoError(err));
    }
  }

  async function empezarVivo() {
    setError(null);
    try {
      await leerPosicion();
    } catch {
      setError('No se ha podido leer el GPS. Revisa el permiso de ubicación.');
      return;
    }
    setRecorrido([]);
    setInicioMs(Date.now());
    setSesionViva(true);
    setModo('vivo');
    watchId.current = await seguirPosicion(
      (latitud, longitud) => {
        const punto: [number, number] = [Number(latitud.toFixed(6)), Number(longitud.toFixed(6))];
        setLat(punto[0]);
        setLon(punto[1]);
        setRecorrido((lista) => {
          const ultimo = lista[lista.length - 1];
          if (ultimo && distanciaKm([ultimo, punto]) < 0.008) return lista;
          return [...lista, punto];
        });
      },
      () => setError('Se ha perdido la señal GPS.')
    );
  }

  async function terminarVivo() {
    if (watchId.current) await dejarDeSeguir(watchId.current);
    watchId.current = null;
    setSesionViva(false);
    const minutos = inicioMs ? Math.max(1, (Date.now() - inicioMs) / 60000) : 1;
    await guardarRuta(recorrido, minutos, `Travesía en vivo · ${nombre}`);
    if (supabase && userId && checkinId) {
      await supabase.from('safety_checkins').update({
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
        last_lat: lat,
        last_lon: lon
      }).eq('id', checkinId);
      setCheckinId(null);
    }
  }

  async function abrirCheckin() {
    if (!supabase || !userId) {
      setError('El check-in de seguridad necesita una cuenta.');
      return;
    }
    const eta = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data, error: err } = await supabase.from('safety_checkins').insert([{
      user_id: userId,
      status: 'active',
      planned_eta: eta,
      last_lat: lat,
      last_lon: lon,
      client_sync_id: crypto.randomUUID()
    }]).select('id').maybeSingle();
    if (err) setError(err.message);
    else {
      setCheckinId(data?.id || null);
      setMensaje('Check-in activo. Avisa a tu contacto y cierra la sesión al volver.');
    }
  }

  function dibujarPoster() {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1080;
    lienzo.height = 1350;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    const fondo = ctx.createLinearGradient(0, 0, 1080, 1350);
    fondo.addColorStop(0, '#041e30');
    fondo.addColorStop(1, '#0f766e');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '700 72px sans-serif';
    ctx.fillText('PaddleSafe', 80, 180);
    ctx.font = '800 120px sans-serif';
    ctx.fillText(`${distanciaKm(recorrido.length ? recorrido : puntos).toFixed(2)} km`, 80, 420);
    ctx.font = '600 48px sans-serif';
    ctx.fillText(motor?.estado || 'Sesión SUP', 80, 540);
    ctx.fillText(nombre, 80, 620);
    lienzo.toBlob((blob) => {
      if (!blob) return;
      const archivo = new File([blob], 'paddlesafe-poster.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [archivo] })) {
        navigator.share({ files: [archivo], title: 'PaddleSafe', text: 'Mi sesión de paddle surf' }).catch(() => undefined);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paddlesafe-poster.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  const termica = useMemo(() => {
    if (!termicaAbierta) return null;
    return equipoTermico({
      tempAguaC: motor?.detallesTecnicos?.tempAguaC ?? pronostico?.tempAgua,
      tempAireC: motor?.detallesTecnicos?.tempAireC ?? pronostico?.tempAire,
      vientoKt: motor?.detallesTecnicos?.vientoKt,
      intensidad,
      toleranciaFrio: frio
    });
  }, [frio, intensidad, motor, pronostico, termicaAbierta]);

  return (
    <div className="space-y-3">
      <SpotMap
        lat={lat}
        lon={lon}
        focusToken={foco}
        marca={[lat, lon]}
        puntos={modo === 'ruta' ? puntos : []}
        recorrido={modo === 'vivo' ? recorrido : modo === 'ruta' ? puntos : []}
        onMapClick={alPulsarMapa}
      />

      <div className="grid grid-cols-3 gap-2">
        {([['spot', 'Evaluar'], ['ruta', 'Ruta'], ['vivo', 'En vivo']] as Array<[Modo, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setModo(id)} className={`min-h-11 rounded-2xl text-sm font-black ${modo === id ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      <Tarjeta className="space-y-3">
        <div className="flex gap-2">
          <input className={inputCls} value={consulta} placeholder="Buscar playa, cala o pueblo" onChange={(e) => setConsulta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
          <Boton onClick={buscar}>Buscar</Boton>
        </div>
        {lugares.length > 0 && (
          <ul className="space-y-1">
            {lugares.map((lugar) => (
              <li key={`${lugar.lat}-${lugar.lon}`}>
                <button type="button" className="min-h-11 w-full rounded-2xl bg-white/5 px-3 text-left text-sm" onClick={() => irA(lugar.lat, lugar.lon, lugar.nombre)}>
                  <span className="font-bold">{lugar.nombre}</span>
                  <span className="block text-xs text-slate-400">{lugar.detalle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Boton variante="suave" onClick={usarGps}>Mi GPS</Boton>
          <Campo etiqueta="Nivel">
            <select className={inputCls} value={nivel} onChange={(e) => { const n = e.target.value as Nivel; setNivel(n); guardarNivel(n); }}>
              <option>Principiante</option>
              <option>Intermedio</option>
              <option>Avanzado</option>
              <option>Competicion</option>
            </select>
          </Campo>
        </div>
        <p className="text-sm text-slate-300">{nombre} · {lat.toFixed(4)}, {lon.toFixed(4)}</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      </Tarjeta>

      {modo === 'spot' && (
        <>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={() => evaluar()} disabled={cargando}>{cargando ? 'Consultando…' : 'Evaluar spot'}</Boton>
            <Boton variante="suave" onClick={favorito}>Guardar spot</Boton>
            <Boton variante="suave" onClick={comparar} disabled={spots.length < 2 || cargando}>Comparar favoritos</Boton>
            <Boton variante="suave" onClick={() => setTermicaAbierta((v) => !v)}>Neopreno</Boton>
            <Boton variante="suave" onClick={coachAhora} disabled={!motor || cargando}>Coach</Boton>
          </div>
          {motor && <Veredicto motor={motor} pronostico={pronostico} horas={horas} horaIdx={horaIdx} onHora={elegirHora} />}
          {coach && <Tarjeta><p className="whitespace-pre-wrap text-sm leading-relaxed">{coach}</p><p className="mt-2 text-[11px] text-slate-500">El coach usa el motor gratuito del servidor. No sustituye tu criterio ni un aviso oficial.</p></Tarjeta>}
          {termica && (
            <Tarjeta className="space-y-2">
              <p className="text-lg font-black">{termica.trajePrincipal.icono} {termica.trajePrincipal.titulo}</p>
              <p className="text-sm text-slate-300">{termica.trajePrincipal.explicacion}</p>
              <p className="text-sm">Confort: {termica.nivelConfort}. Sensación {termica.sensacionTermicaC}°C.</p>
              {termica.alertaRegla30 && <Aviso tipo="error">{termica.alertaRegla30}</Aviso>}
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={intensidad} onChange={(e) => setIntensidad(e.target.value as typeof intensidad)}>
                  <option value="paseo">Paseo</option>
                  <option value="travesia">Travesía</option>
                  <option value="race">Race</option>
                </select>
                <select className={inputCls} value={frio} onChange={(e) => setFrio(e.target.value as typeof frio)}>
                  <option value="friolero">Friolero</option>
                  <option value="normal">Normal</option>
                  <option value="caluroso">Caluroso</option>
                </select>
              </div>
              <p className="text-sm text-slate-400">Calzado: {termica.calzado}</p>
              <ul className="list-disc pl-5 text-sm text-slate-300">{termica.accesorios.map((item) => <li key={item}>{item}</li>)}</ul>
            </Tarjeta>
          )}
          {comparacion.length > 0 && (
            <Tarjeta>
              <h2 className="mb-2 font-black">Comparación</h2>
              <ul className="space-y-2">
                {comparacion.map((fila) => (
                  <li key={fila.nombre} className="flex items-center justify-between gap-2 text-sm">
                    <span>{fila.nombre}</span>
                    <span className="font-bold">{fila.estado} · {fila.score}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          <Tarjeta className="space-y-2">
            <h2 className="font-black">Spots guardados</h2>
            {spots.length === 0 && <p className="text-sm text-slate-400">Todavía no hay favoritos. Puedes cargar un pack de calas.</p>}
            <ul className="space-y-2">
              {spots.map((spot) => (
                <li key={spot.id} className="flex items-center gap-2">
                  <button type="button" className="min-h-11 flex-1 rounded-2xl bg-white/5 px-3 text-left text-sm font-bold" onClick={() => { irA(Number(spot.lat), Number(spot.lon), spot.nombre); evaluar(Number(spot.lat), Number(spot.lon), spot.nombre); }}>
                    {spot.nombre}
                  </button>
                  <Boton variante="peligro" onClick={async () => setSpots(await borrarSpot(userId, spot))}>Quitar</Boton>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {PACKS_SPOTS.map((pack) => (
                <Boton key={pack.id} variante="suave" onClick={async () => {
                  let lista = spots;
                  for (const spot of pack.spots) lista = await guardarSpot(userId, spot);
                  setSpots(lista);
                  setMensaje(pack.descripcion);
                }}>{pack.nombre}</Boton>
              ))}
            </div>
          </Tarjeta>
          <Tarjeta className="space-y-2">
            <h2 className="font-black">Notas del spot</h2>
            <textarea className={inputCls} rows={2} placeholder="Notas tácticas" value={notas.notas_tacticas} onChange={(e) => setNotas({ ...notas, notas_tacticas: e.target.value })} />
            <input className={inputCls} placeholder="Acceso y parking" value={notas.acceso_parking} onChange={(e) => setNotas({ ...notas, acceso_parking: e.target.value })} />
            <textarea className={inputCls} rows={2} placeholder="Peligros locales" value={notas.peligros_locales} onChange={(e) => setNotas({ ...notas, peligros_locales: e.target.value })} />
            <Boton variante="suave" onClick={async () => {
              const spot = spots.find((s) => s.nombre === nombre) || spots.find((s) => Math.abs(Number(s.lat) - lat) < 0.01);
              if (!spot) {
                setError('Guarda el spot antes de asociarle notas.');
                return;
              }
              setSpots(await actualizarNotasSpot(userId, spot, notas));
              setMensaje('Notas guardadas.');
            }}>Guardar notas</Boton>
          </Tarjeta>
          <Tarjeta className="space-y-2">
            <h2 className="font-black">Reporte en el agua</h2>
            <select className={inputCls} value={reporte} onChange={(e) => setReporte(e.target.value)}>
              <option value="mar_plato">Mar en calma</option>
              <option value="chop">Chop incómodo</option>
              <option value="viento_sube">El viento está subiendo</option>
              <option value="corriente">Corriente notable</option>
              <option value="peligro">No recomiendo salir</option>
            </select>
            <input className={inputCls} placeholder="Comentario breve" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <Boton variante="suave" onClick={enviarReporte}>Publicar reporte</Boton>
          </Tarjeta>
          <Tarjeta className="space-y-2">
            <h2 className="font-black">Bitácora</h2>
            <Campo etiqueta="Sensación (1-5)">
              <input className={inputCls} type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
            </Campo>
            <textarea className={inputCls} rows={2} placeholder="Qué has notado respecto al parte" value={bitacora} onChange={(e) => setBitacora(e.target.value)} />
            <Boton variante="suave" onClick={guardarBitacora}>Guardar en bitácora</Boton>
          </Tarjeta>
        </>
      )}

      {modo === 'ruta' && (
        <Tarjeta className="space-y-2">
          <h2 className="font-black">Planificador</h2>
          <p className="text-sm text-slate-300">Toca el mapa para añadir puntos. Ritmo de crucero: {crucero} km/h (se cambia en Perfil).</p>
          <p className="text-2xl font-black">{kmRuta.toFixed(2)} km · {formatoTiempo(minutosRuta)}</p>
          <div className="flex flex-wrap gap-2">
            <Boton variante="suave" onClick={() => setPuntos((lista) => lista.slice(0, -1))}>Deshacer</Boton>
            <Boton variante="suave" onClick={() => setPuntos([])}>Limpiar</Boton>
            <Boton variante="suave" onClick={() => setPuntos((lista) => idaYVuelta(lista))}>Ida y vuelta</Boton>
            <Boton variante="suave" onClick={() => exportarGpx(puntos, nombre)} disabled={puntos.length < 2}>Exportar GPX</Boton>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-white/15 bg-white/5 px-3 text-sm font-black">
              Importar GPX
              <input type="file" accept=".gpx,.xml,text/xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarGpx(f); e.target.value = ''; }} />
            </label>
            <Boton onClick={() => guardarRuta(puntos, minutosRuta, `Ruta planificada · ${nombre}`)} disabled={puntos.length < 2}>Guardar ruta</Boton>
            <Boton variante="suave" onClick={async () => setMensaje(`Mapa de la zona: ${await precargarMapa(lat, lon)} teselas listas sin red.`)}>Mapa sin conexión</Boton>
          </div>
          <Aviso>El tiempo es una estimación con tu ritmo de crucero, no un ETA garantizado.</Aviso>
        </Tarjeta>
      )}

      {modo === 'vivo' && (
        <Tarjeta className="space-y-2">
          <h2 className="font-black">Sesión en vivo</h2>
          <p className="text-2xl font-black">{distanciaKm(recorrido).toFixed(2)} km · {recorrido.length} puntos</p>
          <Campo etiqueta="Teléfono de emergencia (solo en este dispositivo)">
            <input className={inputCls} value={telefono} placeholder="+34…" onChange={(e) => { setTelefono(e.target.value); guardarTelefonoEmergencia(e.target.value); }} />
          </Campo>
          {telefono && <a className="inline-flex min-h-11 items-center font-black text-rose-300" href={`tel:${telefono}`}>Llamar al contacto</a>}
          <div className="flex flex-wrap gap-2">
            {!sesionViva && <Boton onClick={empezarVivo}>Empezar GPS</Boton>}
            {sesionViva && <Boton variante="peligro" onClick={terminarVivo}>Terminar y guardar</Boton>}
            <Boton variante="suave" onClick={abrirCheckin}>Check-in de seguridad</Boton>
            <Boton variante="suave" onClick={dibujarPoster} disabled={recorrido.length < 2 && puntos.length < 2}>Póster</Boton>
          </div>
          <Aviso>Mantén la pantalla encendida si el sistema suspende el GPS en segundo plano. En Android, el seguimiento continuo en segundo plano exige un permiso extra que debes declarar en Play Console.</Aviso>
        </Tarjeta>
      )}
    </div>
  );
}

function Veredicto({ motor, pronostico, horas, horaIdx, onHora }: {
  motor: Motor;
  pronostico: Pronostico | null;
  horas: HoraMarina[];
  horaIdx: number;
  onHora: (indice: number) => void;
}) {
  const tec = motor.detallesTecnicos || {};
  const ventanas = pronostico?.ventanasOptimas;
  const parteGuardado = textoParteGuardado(pronostico, { horaParte: horas[horaIdx]?.hora || null });
  return (
    <Tarjeta className="space-y-3">
      {parteGuardado && <Aviso>{parteGuardado}</Aviso>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Veredicto</p>
          <h2 className="text-2xl font-black">{motor.icono} {motor.estado}</h2>
        </div>
        <p className="text-right text-3xl font-black text-emerald-300">{motor.score ?? '—'}</p>
      </div>
      <p className="text-sm leading-relaxed text-slate-200">{motor.justificacion}</p>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Dato etiqueta="Viento" valor={tec.vientoKt == null ? 'Sin dato' : `${tec.vientoKt} kt ${cardinal(pronostico?.windDirection)}`} />
        <Dato etiqueta="Rachas" valor={tec.rachasKt == null ? 'Sin dato' : `${tec.rachasKt} kt`} />
        <Dato etiqueta="Oleaje" valor={tec.oleajeM != null ? `${Number(tec.oleajeM).toFixed(1)} m` : (motor.oleajeAplica === false ? 'No aplica' : 'Sin dato')} />
        <Dato etiqueta="Agua / aire" valor={`${tec.tempAguaC ?? '—'}° / ${tec.tempAireC ?? '—'}°`} />
      </div>
      {motor.componenteCostera?.componente && <p className="text-sm text-slate-300">Componente: {motor.componenteCostera.componente}. Deriva: {motor.riesgoDeriva?.nivel || '—'}.</p>}
      {ventanas?.textoResumen && motor.vientoConocido !== false && (motor.oleajeAplica !== true || motor.oleajeConocido !== false) && <Aviso>{ventanas.textoResumen}</Aviso>}
      {ventanas?.evolucionAviso && <Aviso tipo="error">{ventanas.evolucionAviso}</Aviso>}
      {(motor.factoresCriticos || []).length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
          {motor.factoresCriticos!.map((factor) => <li key={factor}>{factor}</li>)}
        </ul>
      )}
      {horas.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">Jornada</p>
          <input className="w-full" type="range" min={0} max={horas.length - 1} value={Math.min(horaIdx, horas.length - 1)} onChange={(e) => onHora(Number(e.target.value))} />
          <div className="mt-2 flex gap-2 overflow-auto ps-scroll">
            {horas.map((hora, indice) => (
              <button key={`${hora.hora}-${indice}`} type="button" onClick={() => onHora(indice)} className={`min-w-16 rounded-2xl px-2 py-2 text-center text-[11px] font-bold ${indice === horaIdx ? 'bg-sky-400 text-slate-950' : 'bg-white/5'}`}>
                <span className="block">{hora.hora}</span>
                <span className="block">{hora.vientoKt ?? '—'} kt</span>
                <span className="block">{hora.oleajeM != null ? `${Number(hora.oleajeM).toFixed(1)} m` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500">Orientación basada en Open-Meteo y el motor de PaddleSafe. Confianza del análisis: {motor.analysisConfidence ?? '—'}%. No sustituye avisos de AEMET, Protección Civil o 112.</p>
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-black/20 px-3 py-2">
      <p className="text-[10px] font-bold uppercase text-slate-400">{etiqueta}</p>
      <p className="font-black">{valor}</p>
    </div>
  );
}
