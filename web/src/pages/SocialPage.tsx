import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAcceso } from '@/context/AccesoContext';
import { Candado } from '@/components/Candado';
import { Aviso, Boton, inputCls, Tarjeta } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { formatoTiempo } from '@/lib/geo';

type Ruta = {
  id: string;
  user_id: string;
  distancia_km: number | null;
  tiempo_minutos: number | null;
  ubicacion: string | null;
  fecha?: string | null;
  imagen_url?: string | null;
  autor?: string;
};
type Comentario = { id: string; comentario?: string | null; contenido?: string | null; texto?: string | null; autor_nombre?: string | null };
type Rank = { id?: string; nombre?: string | null; avatar_url?: string | null; puntos_periodo?: number | null; club_id?: string; logo_url?: string | null; miembros?: number | null };
type Amigo = { id: string; nombre: string; pendiente?: boolean; amistadId?: string };

const PERIODOS = [
  ['diario', 'Hoy'],
  ['semanal', 'Semana'],
  ['mensual', 'Mes'],
  ['anual', 'Año'],
  ['historico', 'Total']
] as const;

export function SocialPage() {
  const acceso = useAcceso();
  const { session, perfil } = useAuth();
  const [tab, setTab] = useState<'muro' | 'ranking' | 'amigos'>('muro');
  const [filtro, setFiltro] = useState<'global' | 'amigos' | 'clubes'>('global');
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [mios, setMios] = useState<Record<string, boolean>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [borrador, setBorrador] = useState('');
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number][0]>('diario');
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [clubes, setClubes] = useState(false);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [solicitudes, setSolicitudes] = useState<Amigo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [misClubes, setMisClubes] = useState<Array<{ id: string; nombre: string }>>([]);

  async function cargarMuro() {
    if (!supabase) return;
    setError(null);
    const { data, error: err } = await supabase
      .from('rutas')
      .select('id, user_id, distancia_km, tiempo_minutos, ubicacion, fecha, imagen_url')
      .order('fecha', { ascending: false })
      .limit(40);
    if (err) {
      setError(err.message);
      return;
    }
    let lista = (data || []) as Ruta[];
    if (session && filtro !== 'global') {
      if (filtro === 'amigos') {
        const { data: rel } = await supabase.from('amistades').select('usuario_id, amigo_id').eq('estado', 'aceptada').or(`usuario_id.eq.${session.user.id},amigo_id.eq.${session.user.id}`);
        const ids = new Set<string>([session.user.id]);
        (rel || []).forEach((fila: { usuario_id: string; amigo_id: string }) => {
          ids.add(fila.usuario_id);
          ids.add(fila.amigo_id);
        });
        lista = lista.filter((r) => ids.has(r.user_id));
      } else {
        const { data: clubs } = await supabase.from('clubs_usuarios').select('club_id').eq('user_id', session.user.id);
        const clubIds = (clubs || []).map((c: { club_id: string }) => c.club_id);
        if (clubIds.length === 0) lista = [];
        else {
          const { data: comparten } = await supabase.from('clubs_usuarios').select('user_id').in('club_id', clubIds);
          const ids = new Set((comparten || []).map((c: { user_id: string }) => c.user_id));
          lista = lista.filter((r) => ids.has(r.user_id));
        }
      }
    }
    const autores = [...new Set(lista.map((r) => r.user_id))];
    if (autores.length) {
      const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', autores);
      const mapa = new Map((perfiles || []).map((p: { id: string; nombre: string | null }) => [p.id, p.nombre || 'Paddler']));
      lista = lista.map((r) => ({ ...r, autor: mapa.get(r.user_id) || 'Paddler' }));
    }
    setRutas(lista);
    if (lista.length) {
      const ids = lista.map((r) => r.id);
      const { data: corazones } = await supabase.from('rutas_likes').select('ruta_id, user_id').in('ruta_id', ids);
      const cuenta: Record<string, number> = {};
      const propio: Record<string, boolean> = {};
      (corazones || []).forEach((like: { ruta_id: string; user_id: string }) => {
        cuenta[like.ruta_id] = (cuenta[like.ruta_id] || 0) + 1;
        if (session && like.user_id === session.user.id) propio[like.ruta_id] = true;
      });
      setLikes(cuenta);
      setMios(propio);
    }
  }

  async function cargarRanking(siguiente = periodo, deClubes = clubes) {
    if (!supabase) return;
    const rpc = deClubes ? 'get_ranking_clubs_v2' : 'get_ranking_riders';
    const { data, error: err } = await supabase.rpc(rpc, { periodo: siguiente });
    if (err) setError(err.message);
    else setRanking((data || []) as Rank[]);
  }

  async function cargarAmigos() {
    if (!supabase || !session) return;
    const { data } = await supabase
      .from('amistades')
      .select('id, usuario_id, amigo_id, estado')
      .or(`usuario_id.eq.${session.user.id},amigo_id.eq.${session.user.id}`);
    const filas = (data || []) as Array<{ id: string; usuario_id: string; amigo_id: string; estado: string }>;
    const ids = filas.map((f) => (f.usuario_id === session.user.id ? f.amigo_id : f.usuario_id));
    const { data: perfiles } = ids.length
      ? await supabase.from('perfiles').select('id, nombre').in('id', ids)
      : { data: [] };
    const nombres = new Map((perfiles || []).map((p: { id: string; nombre: string | null }) => [p.id, p.nombre || 'Paddler']));
    setAmigos(filas.filter((f) => f.estado === 'aceptada').map((f) => ({
      id: f.usuario_id === session.user.id ? f.amigo_id : f.usuario_id,
      nombre: nombres.get(f.usuario_id === session.user.id ? f.amigo_id : f.usuario_id) || 'Paddler',
      amistadId: f.id
    })));
    setSolicitudes(filas.filter((f) => f.estado === 'pendiente' && f.amigo_id === session.user.id).map((f) => ({
      id: f.usuario_id,
      nombre: nombres.get(f.usuario_id) || 'Paddler',
      amistadId: f.id,
      pendiente: true
    })));
  }

  useEffect(() => {
    if (tab === 'muro') cargarMuro();
    if (tab === 'ranking') cargarRanking();
    if (tab === 'amigos') cargarAmigos();
  }, [tab, filtro, session]);

  useEffect(() => {
    if (!supabase || !session) return;
    supabase.from('clubs_usuarios').select('club_id, clubs(nombre)').eq('user_id', session.user.id).then(({ data }) => {
      setMisClubes((data || []).map((fila: { club_id: string; clubs: { nombre?: string } | { nombre?: string }[] }) => {
        const club = Array.isArray(fila.clubs) ? fila.clubs[0] : fila.clubs;
        return { id: fila.club_id, nombre: club?.nombre || 'Club' };
      }));
    });
  }, [session]);

  async function like(rutaId: string) {
    if (!supabase || !session) return setError('Entra para dejar un me gusta.');
    if (mios[rutaId]) {
      await supabase.from('rutas_likes').delete().eq('ruta_id', rutaId).eq('user_id', session.user.id);
    } else {
      const { error: err } = await supabase.from('rutas_likes').insert([{ ruta_id: rutaId, user_id: session.user.id }]);
      if (err) return setError(err.message);
    }
    await cargarMuro();
  }

  async function abrirComentarios(rutaId: string) {
    if (!supabase) return;
    setAbierto(rutaId);
    const { data } = await supabase.from('rutas_comentarios').select('*').eq('ruta_id', rutaId).order('created_at', { ascending: true }).limit(40);
    setComentarios((data || []) as Comentario[]);
  }

  async function comentar(rutaId: string) {
    if (!supabase || !session) return setError('Entra para comentar.');
    const texto = borrador.trim();
    if (!texto) return;
    const { error: err } = await supabase.from('rutas_comentarios').insert([{
      ruta_id: rutaId,
      user_id: session.user.id,
      comentario: texto,
      texto,
      contenido: texto,
      autor_nombre: perfil?.nombre || 'Paddler'
    }]);
    if (err) {
      const { error: err2 } = await supabase.from('rutas_comentarios').insert([{ ruta_id: rutaId, user_id: session.user.id, comentario: texto }]);
      if (err2) return setError(err2.message);
    }
    setBorrador('');
    await abrirComentarios(rutaId);
  }

  async function borrarRuta(rutaId: string) {
    if (!supabase || !session) return;
    if (!window.confirm('¿Eliminar esta ruta de tu cuenta?')) return;
    const { error: err } = await supabase.from('rutas').delete().eq('id', rutaId).eq('user_id', session.user.id);
    if (err) setError(err.message);
    else await cargarMuro();
  }

  async function compartirClub(rutaId: string, clubId: string) {
    if (!supabase || !session) return;
    const { error: err } = await supabase.from('club_rutas').insert([{ club_id: clubId, ruta_id: rutaId }]);
    if (err) setError(err.message);
    else {
      await supabase.from('club_chat').insert([{
        club_id: clubId,
        user_id: session.user.id,
        mensaje: 'He compartido una ruta en el club.',
        visibility: 'club_only',
        is_public: false
      }]);
      setError(null);
    }
  }

  async function responder(amistadId: string, aceptar: boolean) {
    if (!supabase) return;
    const { error: err } = await supabase.from('amistades').update({ estado: aceptar ? 'aceptada' : 'rechazada' }).eq('id', amistadId);
    if (err) setError(err.message);
    else await cargarAmigos();
  }

  if (!acceso.puede('social')) return <div className="space-y-3"><Candado funcion="social" /></div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([['muro', 'Muro'], ['ranking', 'Ranking'], ['amigos', 'Amigos']] as const).map(([id, label]) => (
          <button key={id} type="button" className={`min-h-11 rounded-2xl text-sm font-black ${tab === id ? 'bg-emerald-400 text-slate-950' : 'bg-white/5'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {tab === 'muro' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {([['global', 'Global'], ['clubes', 'Mis clubes'], ['amigos', 'Amigos']] as const).map(([id, label]) => (
              <button key={id} type="button" className={`min-h-11 rounded-2xl text-xs font-bold ${filtro === id ? 'bg-sky-400 text-slate-950' : 'bg-white/5'}`} onClick={() => setFiltro(id)}>{label}</button>
            ))}
          </div>
          {rutas.length === 0 && <p className="text-sm text-slate-400">No hay rutas en este filtro.</p>}
          {rutas.map((ruta) => (
            <Tarjeta key={ruta.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black">{ruta.autor}</p>
                  <p className="text-sm text-slate-300">{ruta.ubicacion || 'Travesía'}</p>
                </div>
                <p className="text-right font-black">{Number(ruta.distancia_km || 0).toFixed(1)} km<br /><span className="text-xs font-semibold text-slate-400">{formatoTiempo(Number(ruta.tiempo_minutos || 0))}</span></p>
              </div>
              {ruta.imagen_url && <img src={ruta.imagen_url} alt="" className="max-h-48 w-full rounded-2xl object-cover" />}
              <div className="flex flex-wrap gap-2">
                <Boton variante="suave" onClick={() => like(ruta.id)}>{mios[ruta.id] ? 'Te gusta' : 'Me gusta'} · {likes[ruta.id] || 0}</Boton>
                <Boton variante="suave" onClick={() => abrirComentarios(ruta.id)}>Comentar</Boton>
                {session?.user.id === ruta.user_id && <Boton variante="peligro" onClick={() => borrarRuta(ruta.id)}>Eliminar</Boton>}
              </div>
              {misClubes.length > 0 && session?.user.id === ruta.user_id && (
                <select className={inputCls} defaultValue="" onChange={(e) => { if (e.target.value) compartirClub(ruta.id, e.target.value); e.target.value = ''; }}>
                  <option value="">Compartir en un club…</option>
                  {misClubes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}
              {abierto === ruta.id && (
                <div className="space-y-2">
                  {comentarios.map((c) => (
                    <p key={c.id} className="rounded-2xl bg-white/5 px-3 py-2 text-sm"><span className="font-bold">{c.autor_nombre || 'Paddler'}: </span>{c.comentario || c.contenido || c.texto}</p>
                  ))}
                  <div className="flex gap-2">
                    <input className={inputCls} value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="Comentario" />
                    <Boton onClick={() => comentar(ruta.id)}>Publicar</Boton>
                  </div>
                </div>
              )}
            </Tarjeta>
          ))}
        </>
      )}
      {tab === 'ranking' && (
        <Tarjeta className="space-y-2">
          <div className="flex gap-2 overflow-auto">
            {PERIODOS.map(([id, label]) => (
              <button key={id} type="button" className={`min-h-11 shrink-0 rounded-2xl px-3 text-xs font-black ${!clubes && periodo === id ? 'bg-sky-400 text-slate-950' : 'bg-white/5'}`} onClick={() => { setClubes(false); setPeriodo(id); cargarRanking(id, false); }}>{label}</button>
            ))}
            <button type="button" className={`min-h-11 shrink-0 rounded-2xl px-3 text-xs font-black ${clubes ? 'bg-amber-300 text-slate-950' : 'bg-white/5'}`} onClick={() => { setClubes(true); cargarRanking(periodo, true); }}>Clubes</button>
          </div>
          <ol className="space-y-2">
            {ranking.map((fila, indice) => (
              <li key={fila.id || fila.club_id || indice} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="w-6 font-black text-slate-400">{indice + 1}</span>
                <span className="flex-1 font-bold">{fila.nombre}</span>
                <span className="text-sm font-black text-emerald-300">{fila.puntos_periodo ?? 0}</span>
              </li>
            ))}
          </ol>
          {ranking.length === 0 && <p className="text-sm text-slate-400">Sin datos de ranking para este periodo.</p>}
        </Tarjeta>
      )}
      {tab === 'amigos' && (
        <div className="space-y-3">
          {!session && <Aviso>Entra para ver amigos y solicitudes.</Aviso>}
          <Tarjeta>
            <h2 className="mb-2 font-black">Solicitudes</h2>
            {solicitudes.length === 0 && <p className="text-sm text-slate-400">No hay solicitudes pendientes.</p>}
            {solicitudes.map((s) => (
              <div key={s.amistadId} className="mb-2 flex items-center gap-2">
                <span className="flex-1 font-bold">{s.nombre}</span>
                <Boton onClick={() => s.amistadId && responder(s.amistadId, true)}>Aceptar</Boton>
                <Boton variante="suave" onClick={() => s.amistadId && responder(s.amistadId, false)}>Rechazar</Boton>
              </div>
            ))}
          </Tarjeta>
          <Tarjeta>
            <h2 className="mb-2 font-black">Mis amigos</h2>
            {amigos.length === 0 && <p className="text-sm text-slate-400">Aún no hay amistades aceptadas. Puedes buscar paddlers en Clubes.</p>}
            <ul className="space-y-1 text-sm">{amigos.map((a) => <li key={a.id} className="rounded-2xl bg-white/5 px-3 py-2 font-bold">{a.nombre}</li>)}</ul>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
