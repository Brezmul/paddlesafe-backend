import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tarjeta } from '@/components/ui';
import { useAcceso } from '@/context/AccesoContext';
import type { Funcion } from '@/lib/acceso';

const NOMBRES: Partial<Record<Funcion, string>> = {
  cuenta: 'Crear una cuenta',
  clubes: 'Clubes',
  social: 'El muro y el ranking',
  tactico: 'El panel táctico',
  tramos: 'El planificador por tramos',
  reproduccion: 'La repetición de la ruta',
  particulas: 'Las partículas de viento',
  gpx: 'Importar y exportar GPX',
  bitacora: 'La bitácora',
  vivo: 'El seguimiento en vivo',
  jornada: 'La evolución por horas',
  coach: 'El coach',
  favoritos: 'Los spots guardados',
  notificaciones: 'Los avisos de la cuenta',
  neopreno: 'La recomendación de neopreno',
  reporte: 'El reporte en el agua',
  poster: 'El póster de la sesión'
};

const INCLUYE_MAPA = [
  'Panel táctico y evolución por horas',
  'Spots guardados, notas y bitácora',
  'Coach, neopreno y reporte en el agua',
  'Planificador, GPX, repetición y seguimiento'
];

export function Candado({ funcion, children, oculto = false }: { funcion: Funcion; children?: ReactNode; oculto?: boolean }) {
  const { puede } = useAcceso();
  if (puede(funcion)) return <>{children}</>;
  if (oculto) return null;
  const nombre = NOMBRES[funcion] || 'Esta parte';
  return (
    <Tarjeta className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-200">Premium</p>
      <h2 className="text-lg font-black">{nombre}</h2>
      <p className="text-sm leading-relaxed text-slate-200">El mapa, tu posición, el veredicto de ahora y los avisos de peligro siguen gratis. Esto se desbloquea con la suscripción.</p>
      <Link to="/premium" className="inline-flex min-h-11 items-center font-black text-sky-300">Ver Premium</Link>
    </Tarjeta>
  );
}

/** Un solo aviso en el mapa. No repite una tarjeta por cada función. */
export function OfertaMapa() {
  const { premium } = useAcceso();
  if (premium) return null;
  return (
    <Tarjeta className="space-y-3 bg-gradient-to-br from-sky-500/20 to-emerald-400/10">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-sky-200">PaddleSafe Premium</p>
        <h2 className="text-xl font-black">Desbloquea con Premium</h2>
      </div>
      <ul className="space-y-1 text-sm leading-relaxed text-slate-100">
        {INCLUYE_MAPA.map((item) => <li key={item}>· {item}</li>)}
      </ul>
      <Link to="/premium" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-sky-400 px-4 font-black text-slate-950">Ver Premium</Link>
    </Tarjeta>
  );
}
