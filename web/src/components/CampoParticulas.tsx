import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { avanzarParticula, cantidadParticulas, colorSiHayViento, crearParticulas, vectorFlujo, type Particula } from '@/lib/particulas';

/**
 * Lienzo encima del mapa. Sin viento medido no dibuja un flujo inventado.
 * En segundo plano cancela el frame. Con menos movimiento deja un fotograma quieto.
 */
export function CampoParticulas({ vientoKt, dirDeg }: { vientoKt: number | null; dirDeg: number | null }) {
  const map = useMap();

  useEffect(() => {
    const contenedor = map.getContainer();
    const lienzo = document.createElement('canvas');
    lienzo.setAttribute('aria-hidden', 'true');
    lienzo.style.position = 'absolute';
    lienzo.style.inset = '0';
    lienzo.style.width = '100%';
    lienzo.style.height = '100%';
    lienzo.style.pointerEvents = 'none';
    lienzo.style.zIndex = '450';
    contenedor.appendChild(lienzo);

    let frame = 0;
    let vivo = true;
    let partes: Particula[] = [];
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const color = colorSiHayViento(vientoKt);
    const flujo = dirDeg === null || !Number.isFinite(dirDeg) ? null : vectorFlujo(dirDeg);
    const factor = vientoKt === null ? 0 : Math.max(0.35, Math.min(2.8, vientoKt * 0.18));

    const medidas = () => {
      const rect = contenedor.getBoundingClientRect();
      const ancho = Math.max(1, Math.floor(rect.width));
      const alto = Math.max(1, Math.floor(rect.height));
      if (lienzo.width !== ancho || lienzo.height !== alto) {
        lienzo.width = ancho;
        lienzo.height = alto;
        partes = crearParticulas(cantidadParticulas(ancho, alto), ancho, alto);
      }
      return { ancho, alto };
    };

    const trazo = (quieto: boolean) => {
      if (!color || !flujo) return;
      const { ancho, alto } = medidas();
      const ctx = lienzo.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, ancho, alto);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const particula of partes) {
        const larga = quieto ? 8 : particula.velocidad * factor * 3;
        ctx.moveTo(particula.x, particula.y);
        ctx.lineTo(particula.x + flujo.vx * larga, particula.y + flujo.vy * larga);
      }
      ctx.stroke();
    };

    const bucle = () => {
      if (!vivo || !color || !flujo) return;
      if (document.visibilityState === 'hidden') return;
      const { ancho, alto } = medidas();
      partes = partes.map((particula) => avanzarParticula(particula, flujo, factor, ancho, alto));
      trazo(false);
      frame = requestAnimationFrame(bucle);
    };

    const alVer = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === 'visible' && !reducido) frame = requestAnimationFrame(bucle);
    };

    if (color && flujo && !reducido) frame = requestAnimationFrame(bucle);
    else trazo(true);

    document.addEventListener('visibilitychange', alVer);
    map.on('resize', medidas);
    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', alVer);
      map.off('resize', medidas);
      lienzo.remove();
    };
  }, [dirDeg, map, vientoKt]);

  return null;
}
