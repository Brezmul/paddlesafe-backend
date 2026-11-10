import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAcceso } from '@/context/AccesoContext';
import { supabase } from '@/lib/supabase';

const enlaces = [
  { to: '/', label: 'Mapa', icono: '🗺️' },
  { to: '/radar', label: 'Radar', icono: '📡' },
  { to: '/clubes', label: 'Clubes', icono: '⛵' },
  { to: '/social', label: 'Social', icono: '👥' },
  { to: '/perfil', label: 'Perfil', icono: '👤' }
];

type Aviso = { id: string; titulo?: string | null; contenido?: string | null; leida?: boolean | null; created_at?: string | null };

export function Layout() {
  const auth = useAuth();
  const acceso = useAcceso();
  const { ready, session, guest, nombreVisible, perfil } = auth;
  const navigate = useNavigate();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abiertos, setAbiertos] = useState(false);

  useEffect(() => {
    const alEnfocar = (evento: FocusEvent) => {
      const objetivo = evento.target;
      if (!(objetivo instanceof HTMLInputElement || objetivo instanceof HTMLTextAreaElement || objetivo instanceof HTMLSelectElement)) return;
      window.setTimeout(() => objetivo.scrollIntoView({ block: 'center', inline: 'nearest' }), 280);
    };
    document.addEventListener('focusin', alEnfocar);
    return () => document.removeEventListener('focusin', alEnfocar);
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user || !acceso.puede('notificaciones')) {
      setAvisos([]);
      return;
    }
    supabase
      .from('notificaciones')
      .select('id, titulo, contenido, leida, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setAvisos((data || []) as Aviso[]));
  }, [session, abiertos, acceso.premium]);

  const sinLeer = avisos.filter((a) => !a.leida).length;

  useEffect(() => {
    if (auth.recuperacionPendiente) navigate('/perfil', { replace: true });
  }, [auth.recuperacionPendiente, navigate]);

  async function marcarLeidas() {
    if (!supabase || !session?.user) return;
    await supabase.from('notificaciones').update({ leida: true }).eq('user_id', session.user.id).eq('leida', false);
    setAvisos((lista) => lista.map((a) => ({ ...a, leida: true })));
  }

  return (
    <div className="flex h-dvh flex-col bg-[#041e30] text-slate-100">
      <header className="z-[500] shrink-0 border-b border-white/10 bg-[#06263c]/95 backdrop-blur">
        <div className="ps-cabecera mx-auto flex max-w-5xl items-center gap-3 px-3 pb-2.5">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-lg text-slate-950">🌊</span>
            <span>
              <span className="block text-sm font-black tracking-wide">PaddleSafe</span>
              <span className="block text-[11px] text-slate-400">Seguridad para remar</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!acceso.premium && (
              <button type="button" onClick={() => navigate('/premium')} className="inline-flex min-h-11 items-center rounded-2xl bg-sky-400 px-3 text-xs font-black text-slate-950">
                Premium
              </button>
            )}
            <button
              type="button"
              className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-slate-900/70"
              aria-label="Avisos"
              onClick={() => setAbiertos((v) => !v)}
            >
              🔔
              {sinLeer > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-400" />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/perfil')}
              className="flex h-11 max-w-[10rem] items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-2.5 text-xs font-bold"
              aria-label="Abrir perfil"
            >
              {perfil?.avatar_url ? (
                <img src={perfil.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span>👤</span>
              )}
              <span className="truncate">{ready ? nombreVisible : '…'}</span>
            </button>
          </div>
        </div>
        {abiertos && (
          <div className="mx-auto max-w-5xl px-3 pb-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-black">Avisos</p>
                {session && <button type="button" className="text-xs font-bold text-sky-300" onClick={marcarLeidas}>Marcar leídos</button>}
              </div>
              {!acceso.puede('notificaciones') && <p className="text-sm text-slate-300">Los avisos de la cuenta son Premium. El veredicto y las alertas de peligro siguen en el mapa.</p>}
              {acceso.puede('notificaciones') && !session && <p className="text-sm text-slate-400">{guest ? 'Los invitados no reciben avisos de cuenta.' : 'Entra para ver tus avisos.'}</p>}
              {acceso.puede('notificaciones') && session && avisos.length === 0 && <p className="text-sm text-slate-400">No hay avisos.</p>}
              {acceso.puede('notificaciones') && (
              <ul className="max-h-56 space-y-2 overflow-auto">
                {avisos.map((a) => (
                  <li key={a.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <p className="font-bold">{a.titulo || 'Aviso'}</p>
                    <p className="text-slate-300">{a.contenido}</p>
                  </li>
                ))}
              </ul>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="ps-contenido mx-auto w-full max-w-5xl px-3 pt-3">
        <Outlet />
      </main>

      <nav className="z-[500] shrink-0 border-t border-white/10 bg-[#06263c]/95 backdrop-blur">
        <ul className="ps-barra mx-auto grid max-w-5xl grid-cols-5">
          {enlaces.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive ? 'text-emerald-300' : 'text-slate-400'}`
                }
              >
                <span className="text-base" aria-hidden>{item.icono}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
