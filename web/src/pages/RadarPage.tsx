import { useEffect, useState } from 'react';
import { CircleMarker, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { SpotMap } from '@/components/SpotMap';
import { CampoParticulas } from '@/components/CampoParticulas';
import { Aviso, Boton, Tarjeta } from '@/components/ui';
import { cardinal } from '@/lib/geo';
import { leerPosicion } from '@/lib/gps';
import { evaluarLugar, type Motor } from '@/lib/legacy';
import { leerNivel } from '@/lib/prefs';
import { textoError } from '@/lib/db';
import { ZOOM_MAX_LLUVIA, ZOOM_NATIVO_LLUVIA } from '@/lib/lluvia';
import { medicionNumerica, magnitudNoNegativa } from '@/lib/medicion';

type Flecha = { lat: number; lon: number; kt: number | null; dir: number | null };

function iconoViento(dir: number, kt: number) {
  const color = kt >= 18 ? '#fb7185' : kt >= 12 ? '#fbbf24' : '#7dd3fc';
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="transform:rotate(${dir}deg);color:${color};font-size:22px;text-align:center;text-shadow:0 1px 2px #000">➤</div>`
  });
}

export function RadarPage() {
  const [lat, setLat] = useState(38.8);
  const [lon, setLon] = useState(0.18);
  const [foco, setFoco] = useState(0);
  const [viento, setViento] = useState(true);
  const [lluvia, setLluvia] = useState(true);
  const [oleaje, setOleaje] = useState(true);
  const [deriva, setDeriva] = useState(true);
  const [particulas, setParticulas] = useState(true);
  const [flechas, setFlechas] = useState<Flecha[]>([]);
  const [lluviaUrl, setLluviaUrl] = useState<string | null>(null);
  const [motor, setMotor] = useState<Motor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => r.json())
      .then((data) => {
        const pasado = data?.radar?.past;
        const frame = Array.isArray(pasado) ? pasado[pasado.length - 1] : null;
        if (vivo && data?.host && frame?.path) {
          setLluviaUrl(`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`);
        }
      })
      .catch(() => setLluviaUrl(null));
    return () => { vivo = false; };
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const offsets = [-0.18, 0, 0.18];
      const puntos = offsets.flatMap((dy) => offsets.map((dx) => ({ lat: lat + dy, lon: lon + dx })));
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', puntos.map((p) => p.lat.toFixed(3)).join(','));
      url.searchParams.set('longitude', puntos.map((p) => p.lon.toFixed(3)).join(','));
      url.searchParams.set('current', 'wind_speed_10m,wind_direction_10m');
      url.searchParams.set('wind_speed_unit', 'kn');
      const res = await fetch(url);
      if (!res.ok) throw new Error('No hay datos de viento.');
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [data];
      setFlechas(lista.map((item: { latitude: number; longitude: number; current?: { wind_speed_10m?: number; wind_direction_10m?: number } }, i: number) => ({
        lat: item.latitude ?? puntos[i].lat,
        lon: item.longitude ?? puntos[i].lon,
        kt: magnitudNoNegativa(item.current?.wind_speed_10m),
        dir: medicionNumerica(item.current?.wind_direction_10m)
      })));
      const evaluado = await evaluarLugar({ lat, lon, nombre: 'Radar', nivel: leerNivel() });
      setMotor(evaluado.motor);
    } catch (err) {
      setError(textoError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const ola = motor?.detallesTecnicos?.oleajeM;
  const centro = flechas.find((f) => f.kt != null && f.dir != null) ?? null;

  return (
    <div className="space-y-3">
      <SpotMap lat={lat} lon={lon} focusToken={foco} marca={[lat, lon]} altura="h-[52vh] min-h-[300px]" onMapClick={(a, b) => { setLat(a); setLon(b); setFoco((n) => n + 1); }}>
        {lluvia && lluviaUrl && (
          <TileLayer
            url={lluviaUrl}
            opacity={0.55}
            attribution="RainViewer"
            maxNativeZoom={ZOOM_NATIVO_LLUVIA}
            maxZoom={ZOOM_MAX_LLUVIA}
          />
        )}
        {viento && flechas.filter((f) => f.kt != null && f.dir != null).map((f) => (
          <Marker key={`${f.lat}-${f.lon}`} position={[f.lat, f.lon]} icon={iconoViento(f.dir as number, f.kt as number)} />
        ))}
        {oleaje && ola != null && (
          <CircleMarker center={[lat, lon]} radius={18 + Number(ola) * 14} pathOptions={{ color: '#2dd4bf', weight: 2, fillOpacity: 0.15 }} />
        )}
        {deriva && motor?.riesgoDeriva && (
          <CircleMarker center={[lat + 0.03, lon + 0.03]} radius={12} pathOptions={{ color: '#c084fc', fillColor: '#c084fc', fillOpacity: 0.45 }} />
        )}
        {particulas && <CampoParticulas vientoKt={centro?.kt ?? null} dirDeg={centro?.dir ?? null} />}
      </SpotMap>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Capa activo={viento} onClick={() => setViento((v) => !v)} texto="Viento" />
        <Capa activo={lluvia} onClick={() => setLluvia((v) => !v)} texto="Lluvia" />
        <Capa activo={oleaje} onClick={() => setOleaje((v) => !v)} texto="Oleaje" />
        <Capa activo={deriva} onClick={() => setDeriva((v) => !v)} texto="Deriva" />
        <Capa activo={particulas} onClick={() => setParticulas((v) => !v)} texto="Partículas" />
      </div>
      <div className="flex gap-2">
        <Boton onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar radar'}</Boton>
        <Boton variante="suave" onClick={async () => {
          try {
            const pos = await leerPosicion();
            setLat(pos.lat);
            setLon(pos.lon);
            setFoco((n) => n + 1);
          } catch (err) {
            setError(textoError(err));
          }
        }}>Centrar GPS</Boton>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Tarjeta>
        <h2 className="font-black">Lectura en el punto</h2>
        <p className="mt-1 text-sm text-slate-300">
          Viento {motor?.detallesTecnicos?.vientoKt == null ? 'sin dato' : `${motor.detallesTecnicos.vientoKt} kt`} {cardinal(flechas[4]?.dir)}. Oleaje {ola != null ? `${Number(ola).toFixed(1)} m` : 'sin dato'}.
          Deriva {motor?.riesgoDeriva?.nivel || '—'}{motor?.riesgoDeriva?.descripcion ? `: ${motor.riesgoDeriva.descripcion}` : ''}.
        </p>
        <p className="mt-2 text-sm">Veredicto del punto: <strong>{motor?.icono} {motor?.estado || 'pulsa actualizar'}</strong></p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">La lluvia es el último radar de RainViewer. A partir del zoom 7 se amplía esa tesela: el servicio no tiene niveles más cercanos. Las flechas salen de Open-Meteo (la punta indica hacia dónde sopla el viento). Las partículas usan ese mismo vector, como máximo 120, y se paran si la app no está delante. La deriva es la estimación costera de PaddleSafe, no una boya oficial.</p>
        {particulas && !centro && !cargando && <p className="mt-2 text-sm text-slate-300">Partículas: sin dato de viento en la rejilla. No se dibuja un flujo inventado.</p>}
      </Tarjeta>
    </div>
  );
}

function Capa({ activo, onClick, texto }: { activo: boolean; onClick: () => void; texto: string }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-11 rounded-2xl text-sm font-black ${activo ? 'bg-sky-400 text-slate-950' : 'bg-white/5 text-slate-300'}`}>
      {texto}
    </button>
  );
}
