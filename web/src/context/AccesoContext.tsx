import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { decidirPremium, puedeUsar, type Funcion, type OrigenPremium } from '@/lib/acceso';
import { esAndroid, prepararPlay, type EstadoPlay, estadoSinPlay } from '@/lib/play';
import { supabase } from '@/lib/supabase';

type AccesoValor = {
  listo: boolean;
  premium: boolean;
  origen: OrigenPremium;
  play: EstadoPlay;
  puede: (funcion: Funcion) => boolean;
  recargarPlay: () => Promise<EstadoPlay>;
  fijarPlay: (estado: EstadoPlay) => void;
};

const AccesoContext = createContext<AccesoValor | null>(null);

function tablaNoExiste(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const texto = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || texto.includes('does not exist') || texto.includes('schema cache');
}

export function AccesoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [listo, setListo] = useState(false);
  const [play, setPlay] = useState<EstadoPlay>(estadoSinPlay(null));
  const [derecho, setDerecho] = useState<'activo' | 'inactivo' | 'desconocido'>('desconocido');
  const [accesoPrevio, setAccesoPrevio] = useState(false);
  const [tablaAusente, setTablaAusente] = useState(false);

  const recargarPlay = useCallback(async () => {
    const estado = await prepararPlay();
    setPlay(estado);
    return estado;
  }, []);

  useEffect(() => {
    let vivo = true;
    recargarPlay().finally(() => { if (vivo) setListo(true); });
    return () => { vivo = false; };
  }, [recargarPlay]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setDerecho('desconocido');
      setAccesoPrevio(false);
      setTablaAusente(false);
      return;
    }
    let vivo = true;
    Promise.all([
      supabase.from('premium_derechos').select('estado, expira_en').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('perfiles').select('acceso_previo').eq('id', session.user.id).maybeSingle()
    ]).then(([derechos, perfil]) => {
      if (!vivo) return;
      const falta = tablaNoExiste(derechos.error) || tablaNoExiste(perfil.error);
      setTablaAusente(falta);
      if (falta) {
        setDerecho('desconocido');
        setAccesoPrevio(false);
        return;
      }
      const expira = derechos.data?.expira_en ? Date.parse(derechos.data.expira_en) : NaN;
      const vigente = derechos.data?.estado === 'activo' && (!Number.isFinite(expira) || expira > Date.now());
      setDerecho(derechos.data ? (vigente ? 'activo' : 'inactivo') : 'inactivo');
      setAccesoPrevio(Boolean(perfil.data?.acceso_previo));
    }).catch(() => {
      if (!vivo) return;
      setTablaAusente(true);
    });
    return () => { vivo = false; };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session?.user || !play.token || !play.activo) return;
    supabase.functions.invoke('verificar-premium', {
      body: { purchaseToken: play.token, productId: play.producto }
    }).then(({ data }) => {
      if (data?.estado === 'activo') setDerecho('activo');
    }).catch(() => undefined);
  }, [play.activo, play.producto, play.token, session]);

  const decision = decidirPremium({
    playActivo: esAndroid() && play.activo,
    derecho,
    accesoPrevio,
    sesion: Boolean(session),
    tablaAusente
  });

  const valor = useMemo<AccesoValor>(() => ({
    listo,
    premium: decision.premium,
    origen: decision.origen,
    play,
    puede: (funcion) => puedeUsar(funcion, decision.premium),
    recargarPlay,
    fijarPlay: setPlay
  }), [decision.origen, decision.premium, listo, play, recargarPlay]);

  return <AccesoContext.Provider value={valor}>{children}</AccesoContext.Provider>;
}

export function useAcceso() {
  const ctx = useContext(AccesoContext);
  if (!ctx) throw new Error('useAcceso fuera de AccesoProvider');
  return ctx;
}
