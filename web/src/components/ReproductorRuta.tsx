import { useEffect, useRef, useState } from 'react';
import { Boton, Tarjeta } from '@/components/ui';
import { DURACION_BASE_S, debeAnimar, interpolarRecorrido, siguienteVelocidad } from '@/lib/replay';

function prefiereMenosMovimiento(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReproductorRuta({
  puntos,
  onMarco
}: {
  puntos: Array<[number, number]>;
  onMarco: (lat: number, lon: number, estela: Array<[number, number]>) => void;
}) {
  const [progreso, setProgreso] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [reducido, setReducido] = useState(prefiereMenosMovimiento);
  const [oculto, setOculto] = useState(typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const progresoRef = useRef(0);
  const velocidadRef = useRef(1);

  useEffect(() => { progresoRef.current = progreso; }, [progreso]);
  useEffect(() => { velocidadRef.current = velocidad; }, [velocidad]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const alCambiar = () => setReducido(media.matches);
    media.addEventListener?.('change', alCambiar);
    const alVer = () => setOculto(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', alVer);
    return () => {
      media.removeEventListener?.('change', alCambiar);
      document.removeEventListener('visibilitychange', alVer);
    };
  }, []);

  function publicar(valor: number) {
    const marco = interpolarRecorrido(puntos, valor);
    if (!marco) return;
    onMarco(marco.lat, marco.lon, marco.estela);
  }

  useEffect(() => {
    if (!debeAnimar({ reproduciendo, reducido, oculto })) return;
    let frame = 0;
    let anterior = performance.now();
    const bucle = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - anterior) / 1000);
      anterior = ahora;
      const paso = (dt * velocidadRef.current) / DURACION_BASE_S;
      const siguiente = Math.min(1, progresoRef.current + paso);
      progresoRef.current = siguiente;
      setProgreso(siguiente);
      publicar(siguiente);
      if (siguiente >= 1) {
        setReproduciendo(false);
        return;
      }
      frame = requestAnimationFrame(bucle);
    };
    frame = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(frame);
  }, [oculto, puntos, reducido, reproduciendo]);

  return (
    <Tarjeta className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black">Recorrido</h2>
        <p className="text-sm font-bold text-slate-300">{Math.round(progreso * 100)}%</p>
      </div>
      <input
        className="h-11 w-full accent-sky-400"
        type="range"
        min={0}
        max={1000}
        aria-label="Posición del recorrido"
        value={Math.round(progreso * 1000)}
        onChange={(e) => {
          const valor = Number(e.target.value) / 1000;
          setProgreso(valor);
          setReproduciendo(false);
          publicar(valor);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Boton
          onClick={() => {
            if (reducido) return;
            if (progreso >= 1) {
              setProgreso(0);
              progresoRef.current = 0;
              publicar(0);
            }
            setReproduciendo((v) => !v);
          }}
          disabled={reducido}
          aria-pressed={reproduciendo}
        >
          {reproduciendo && !oculto ? 'Pausa' : 'Reproducir'}
        </Boton>
        <Boton variante="suave" onClick={() => setVelocidad((v) => siguienteVelocidad(v))} disabled={reducido}>
          {velocidad}×
        </Boton>
      </div>
      {reducido && <p className="text-sm text-slate-300">El sistema pide menos movimiento. Avanza el recorrido con la barra.</p>}
      {oculto && reproduciendo && <p className="text-sm text-slate-300">La reproducción está en pausa mientras la app no está delante.</p>}
    </Tarjeta>
  );
}
