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

export function Candado({ funcion, children }: { funcion: Funcion; children?: ReactNode }) {
  const { puede } = useAcceso();
  if (puede(funcion)) return <>{children}</>;
  return (
    <Tarjeta className="space-y-2">
      <h2 className="text-lg font-black">{NOMBRES[funcion] || 'Esta parte'} es Premium</h2>
      <p className="text-sm leading-relaxed text-slate-200">El mapa, tu posición, el veredicto de ahora y los avisos de peligro siguen gratis. Esto se desbloquea con la suscripción.</p>
      <Link to="/premium" className="inline-flex min-h-11 items-center font-black text-sky-300">Ver Premium</Link>
    </Tarjeta>
  );
}
