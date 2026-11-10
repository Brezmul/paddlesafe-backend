import { Aviso, Campo, inputCls, Tarjeta } from '@/components/ui';
import { formatoTiempo } from '@/lib/geo';
import { textoViento, type PlanTramos } from '@/lib/tramos';

export function PlanificadorTramos({
  plan,
  horaSalida,
  onHora
}: {
  plan: PlanTramos;
  horaSalida: string;
  onHora: (hora: string) => void;
}) {
  return (
    <Tarjeta className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">Tramos</h2>
          <p className="text-sm text-slate-300">Viento a la hora estimada de paso. Una hora vacía se queda en «sin dato».</p>
        </div>
        <Campo etiqueta="Hora de salida">
          <input className={inputCls} type="time" value={horaSalida} onChange={(e) => onHora(e.target.value)} />
        </Campo>
      </div>
      {plan.tramos.length === 0 && <p className="text-sm text-slate-300">Marca al menos dos puntos en el mapa.</p>}
      {plan.tramos.length > 0 && (
        <p className="text-sm text-slate-200">
          Salida {textoViento(plan.vientoSalidaKt)} · {plan.km.toFixed(2)} km
          {plan.minutos !== null ? ` · ${formatoTiempo(plan.minutos)}` : ' · tiempo sin dato'}
        </p>
      )}
      {plan.avisos.map((aviso) => <Aviso key={aviso}>{aviso}</Aviso>)}
      <ul className="space-y-2">
        {plan.tramos.map((tramo) => (
          <li key={tramo.nombre} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3" style={{ borderLeftWidth: 4, borderLeftColor: tramo.color }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">{tramo.nombre}</p>
              <p className="text-xs font-bold text-sky-200">ETA {tramo.eta}</p>
            </div>
            <p className="mt-1 text-sm text-slate-200">
              {tramo.km.toFixed(2)} km · {tramo.minutos === null ? 'tiempo sin dato' : formatoTiempo(tramo.minutos)} · rumbo {tramo.rumbo}°
            </p>
            <p className="mt-1 text-sm">
              <span className="font-black">{tramo.relativo}</span>
              {' · '}viento {textoViento(tramo.vientoKt)}
              {tramo.dirDeg === null ? '' : ` ${Math.round(tramo.dirDeg)}°`}
              {tramo.rachasKt === null ? '' : ` · rachas ${textoViento(tramo.rachasKt)}`}
            </p>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
