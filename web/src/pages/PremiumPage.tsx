import { useState } from 'react';
import { Aviso, Boton, Tarjeta } from '@/components/ui';
import { useAcceso } from '@/context/AccesoContext';
import { textoPeriodo } from '@/lib/acceso';
import { esFicha } from '@/lib/ficha';
import { comprarPlan, esAndroid, restaurarPlay, urlGestionSuscripcion } from '@/lib/play';

const GRATIS = ['Mapa y búsqueda de spot', 'Mi GPS', 'Veredicto de seguridad del momento', 'Avisos de peligro', 'Radar básico (viento, lluvia, oleaje y deriva)'];
const DE_PAGO = ['Cuenta nueva, perfil y notificaciones', 'Clubes y muro', 'Panel táctico y evolución por horas', 'Planificador, GPX, repetición y seguimiento en vivo', 'Partículas, coach, favoritos y bitácora'];

export function PremiumPage() {
  const { premium, origen, play, fijarPlay } = useAcceso();
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const android = esAndroid() || esFicha();

  async function comprar(oferta: string) {
    setOcupado(true);
    setNota(null);
    try {
      const estado = await comprarPlan(oferta);
      fijarPlay(estado);
      if (estado.pendiente) setNota('Google tiene el pago pendiente. Premium se abre cuando lo confirme.');
      else if (estado.activo) setNota('Suscripción activa en esta cuenta de Google. Si creas tu usuario, la vinculamos a la cuenta.');
      else if (estado.error) setNota(estado.error);
    } catch (error) {
      setNota(error instanceof Error ? error.message : 'No se ha podido abrir el pago.');
    } finally {
      setOcupado(false);
    }
  }

  async function restaurar() {
    setOcupado(true);
    setNota(null);
    try {
      const estado = await restaurarPlay();
      fijarPlay(estado);
      setNota(estado.activo ? 'Compra restaurada en este dispositivo.' : 'Google no tiene una suscripción activa para esta cuenta.');
    } catch (error) {
      setNota(error instanceof Error ? error.message : 'No se ha podido restaurar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <Tarjeta className="space-y-3 bg-gradient-to-br from-sky-500/15 to-emerald-400/10">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-200">PaddleSafe</p>
        <h1 className="text-2xl font-black">Premium</h1>
        <p className="text-sm leading-relaxed text-slate-100">Lo necesario para decidir si sales ahora sigue gratis. Premium abre la app completa. El cobro lo hace Google Play, no un intermediario.</p>
        {premium && <Aviso tipo="ok">{origen === 'play' ? 'Google Play marca la suscripción como activa en este dispositivo.' : origen === 'previo' || origen === 'gracia' ? 'Tu cuenta ya tenía acceso. No hace falta pagar para seguir.' : 'Tu cuenta tiene Premium verificado.'}</Aviso>}
      </Tarjeta>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta>
          <h2 className="font-black">Siempre gratis</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">{GRATIS.map((item) => <li key={item}>· {item}</li>)}</ul>
        </Tarjeta>
        <Tarjeta>
          <h2 className="font-black">Con Premium</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">{DE_PAGO.map((item) => <li key={item}>· {item}</li>)}</ul>
        </Tarjeta>
      </div>
      {!android && (
        <Aviso>En el navegador no se puede cobrar. Premium se contrata en la app Android de Google Play. Si tu cuenta ya está verificada, aquí se desbloquea sola.</Aviso>
      )}
      {android && play.planes.length === 0 && !play.error && (
        <Aviso>El precio lo muestra Google Play cuando el producto está publicado. Aquí no hay una cifra fija.</Aviso>
      )}
      {play.error && <Aviso tipo="error">{play.error}</Aviso>}
      {nota && <Aviso tipo="ok">{nota}</Aviso>}
      <div className="space-y-2">
        {play.planes.map((plan) => (
          <Tarjeta key={plan.oferta} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black">{plan.precio}</p>
              <p className="text-sm text-slate-300">{textoPeriodo(plan.periodo)}</p>
            </div>
            <Boton disabled={ocupado || premium} onClick={() => comprar(plan.oferta)}>{premium ? 'Ya activo' : 'Suscribirme'}</Boton>
          </Tarjeta>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton variante="suave" disabled={ocupado || !android} onClick={restaurar}>Restaurar compras</Boton>
        <a className="inline-flex min-h-11 items-center rounded-2xl border border-white/15 px-3 text-sm font-black" href={urlGestionSuscripcion()}>Gestionar o cancelar en Play</a>
      </div>
      {play.pendiente && <Aviso>El pago está pendiente en Google. No se desbloquea hasta que lo confirme.</Aviso>}
    </div>
  );
}
