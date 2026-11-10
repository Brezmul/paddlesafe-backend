import { Aviso, Tarjeta } from '@/components/ui';
import { fichaTactica } from '@/lib/tactico';
import type { Motor, Pronostico } from '@/lib/legacy';

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-slate-950/60 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{etiqueta}</p>
      <p className="mt-1 text-base font-black leading-snug text-white">{valor}</p>
    </div>
  );
}

export function PanelTactico({
  motor,
  pronostico,
  lat,
  lon,
  horaSalida,
  minutosRuta,
  kmRuta,
  cruceroKmh,
  cargando
}: {
  motor: Motor | null;
  pronostico: Pronostico | null;
  lat: number;
  lon: number;
  horaSalida: string;
  minutosRuta: number | null;
  kmRuta: number | null;
  cruceroKmh: number | null;
  cargando: boolean;
}) {
  if (cargando && !motor) {
    return <Tarjeta><h2 className="text-lg font-black">Panel táctico</h2><p className="mt-2 text-sm text-slate-200">Consultando el parte…</p></Tarjeta>;
  }
  if (!motor) {
    return (
      <Tarjeta>
        <h2 className="text-lg font-black">Panel táctico</h2>
        <p className="mt-2 text-sm text-slate-200">Evalúa el lugar para ver viento, oleaje, ventana y ocaso. Hasta entonces no hay cifras.</p>
      </Tarjeta>
    );
  }
  const ficha = fichaTactica({ motor, pronostico, lat, lon, horaSalida, minutosRuta, kmRuta, cruceroKmh });
  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="text-lg font-black">Panel táctico</h2>
        <p className="text-sm text-slate-200">{ficha.veredicto}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Viento" valor={ficha.viento} />
        <Dato etiqueta="Rachas" valor={ficha.rachas} />
        <Dato etiqueta="Dirección" valor={ficha.direccion} />
        <Dato etiqueta="Oleaje" valor={ficha.oleaje} />
        <Dato etiqueta="Periodo" valor={ficha.periodo} />
        <Dato etiqueta="Lluvia" valor={ficha.lluvia} />
        <Dato etiqueta="Aire" valor={ficha.aire} />
        <Dato etiqueta="Agua" valor={ficha.agua} />
      </div>
      <p className="text-sm leading-relaxed text-slate-100">Ventana: {ficha.ventana}</p>
      <p className="text-sm leading-relaxed text-slate-100">Deriva: {ficha.deriva}</p>
      <p className="text-sm leading-relaxed text-slate-100">Esfuerzo estimado: {ficha.esfuerzo}</p>
      {ficha.ocaso.peligro ? <Aviso tipo="error">{ficha.ocaso.texto}</Aviso> : <p className="text-sm text-slate-200">{ficha.ocaso.texto}</p>}
    </Tarjeta>
  );
}
