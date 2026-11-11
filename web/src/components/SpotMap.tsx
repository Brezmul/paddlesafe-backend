import { useEffect, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';

type Punto = [number, number];

type Props = {
  lat: number;
  lon: number;
  focusToken: number;
  puntos?: Punto[];
  marca?: Punto | null;
  recorrido?: Punto[];
  estela?: Punto[];
  marcaReplay?: Punto | null;
  onMapClick?: (lat: number, lon: number) => void;
  altura?: string;
  children?: ReactNode;
};

function Vista({ lat, lon, focusToken }: { lat: number; lon: number; focusToken: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 12));
  }, [focusToken, lat, lon, map]);
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 180);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

function Clicks({ onMapClick }: { onMapClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(evento) {
      onMapClick?.(evento.latlng.lat, evento.latlng.lng);
    }
  });
  return null;
}

export function SpotMap({ lat, lon, focusToken, puntos = [], marca, recorrido = [], estela = [], marcaReplay = null, onMapClick, altura = 'h-[46vh] min-h-[280px]', children }: Props) {
  return (
    <div className={`ps-marco ${altura} overflow-hidden rounded-3xl border border-white/10`}>
      <MapContainer center={[lat, lon]} zoom={13} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Vista lat={lat} lon={lon} focusToken={focusToken} />
        <Clicks onMapClick={onMapClick} />
        {recorrido.length > 1 && <Polyline positions={recorrido} pathOptions={{ color: '#34d399', weight: 5 }} />}
        {estela.length > 1 && <Polyline positions={estela} pathOptions={{ color: '#f8fafc', weight: 3 }} />}
        {marcaReplay && <CircleMarker center={marcaReplay} radius={8} pathOptions={{ color: '#082f49', fillColor: '#f8fafc', fillOpacity: 1, weight: 2 }} />}
        {puntos.map((p, i) => (
          <CircleMarker key={`${p[0]}-${p[1]}-${i}`} center={p} radius={7} pathOptions={{ color: '#082f49', fillColor: '#38bdf8', fillOpacity: 1, weight: 2 }} />
        ))}
        {marca && <CircleMarker center={marca} radius={10} pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2 }} />}
        {children}
      </MapContainer>
    </div>
  );
}
