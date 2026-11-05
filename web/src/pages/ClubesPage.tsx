import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Aviso, Boton, Campo, inputCls, Tarjeta } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { textoError } from '@/lib/db';

type Club = { id: string; nombre: string; descripcion?: string | null; logo_url?: string | null; ubicacion?: string | null; nivel?: number | null };
type Mensaje = { id: string; mensaje?: string | null; user_id?: string | null; created_at?: string | null; autor?: string };
type Evento = { id: string; nombre?: string | null; descripcion?: string | null; fecha_evento?: string | null; distancia_km?: number | null };
type Reto = { id: string; titulo?: string | null; descripcion?: string | null; meta_valor?: number | null; tipo?: string | null };
type Miembro = { user_id?: string; nombre?: string | null; rol?: string | null };

export function ClubesPage() {
  const { session, perfil } = useAuth();
  const [tab, setTab] = useState<'mios' | 'buscar' | 'paddlers'>('mios');
  const [mios, setMios] = useState<Club[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Club[]>([]);
  const [paddlers, setPaddlers] = useState<Array<{ id: string; nombre: string | null; avatar_url: string | null; titulo: string | null }>>([]);
  const [activo, setActivo] = useState<Club | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [retos, setRetos] = useState<Reto[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [nombreClub, setNombreClub] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);

  async function cargarMios() {
    if (!supabase || !session) return;
    const { data, error: err } = await supabase.rpc('obtener_clubs_usuario', { p_user_id: session.user.id });
    if (err) {
      const rel = await supabase.from('clubs_usuarios').select('club_id, rol, clubs(*)').eq('user_id', session.user.id);
      if (rel.error) setError(rel.error.message);
      else {
        const filas = (rel.data || []) as Array<{ rol?: string; clubs: Club | Club[] | null }>;
        const clubs = filas.flatMap((fila) => {
          const club = Array.isArray(fila.clubs) ? fila.clubs[0] : fila.clubs;
          return club ? [{ ...club, rol: fila.rol }] : [];
        });
        setMios(clubs);
      }
      return;
    }
    setMios((data || []) as Club[]);
  }

  useEffect(() => { cargarMios().catch((err) => setError(textoError(err))); }, [session]);

  useEffect(() => {
    const client = supabase;
    if (!client || !activo) return;
    const clubId = activo.id;
    const canal = client
      .channel(`club-chat-${clubId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_chat', filter: `club_id=eq.${clubId}` }, () => {
        cargarChat(clubId);
      })
      .subscribe();
    return () => { client.removeChannel(canal); };
  }, [activo?.id]);

  async function abrir(club: Club) {
    setActivo(club);
    setError(null);
    await Promise.all([cargarChat(club.id), cargarEventos(club.id), cargarRetos(club.id), cargarMiembros(club.id)]);
    if (supabase && session) {
      const { data } = await supabase.from('clubs_usuarios').select('rol').eq('club_id', club.id).eq('user_id', session.user.id).maybeSingle();
      setRol(data?.rol || null);
    }
  }

  async function cargarChat(clubId: string) {
    if (!supabase) return;
    const { data, error: err } = await supabase.from('club_chat').select('id, mensaje, user_id, created_at').eq('club_id', clubId).order('created_at', { ascending: true }).limit(80);
    if (err) {
      setError(err.message);
      return;
    }
    const filas = (data || []) as Mensaje[];
    const ids = [...new Set(filas.map((m) => m.user_id).filter(Boolean))] as string[];
    let nombres = new Map<string, string>();
    if (ids.length) {
      const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids);
      nombres = new Map((perfiles || []).map((p: { id: string; nombre: string | null }) => [p.id, p.nombre || 'Paddler']));
    }
    setMensajes(filas.map((m) => ({ ...m, autor: nombres.get(m.user_id || '') || 'Paddler' })));
  }

  async function cargarEventos(clubId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('club_eventos').select('id, nombre, descripcion, fecha_evento, distancia_km').eq('club_id', clubId).order('fecha_evento', { ascending: true }).limit(20);
    setEventos((data || []) as Evento[]);
  }

  async function cargarRetos(clubId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('club_retos').select('id, titulo, descripcion, meta_valor, tipo').eq('club_id', clubId).order('created_at', { ascending: false }).limit(20);
    setRetos((data || []) as Reto[]);
  }

  async function cargarMiembros(clubId: string) {
    if (!supabase) return;
    const { data, error: err } = await supabase.rpc('obtener_miembros_club', { p_club_id: clubId });
    if (!err && data) {
      setMiembros(data as Miembro[]);
      return;
    }
    const { data: rel } = await supabase.from('clubs_usuarios').select('user_id, rol').eq('club_id', clubId);
    setMiembros((rel || []) as Miembro[]);
  }

  async function crearClub() {
    if (!supabase || !session) return setError('Entra para crear un club.');
    const nombre = nombreClub.trim();
    if (nombre.length < 3) return setError('El nombre del club es demasiado corto.');
    const { error: err } = await supabase.rpc('crear_club_multiclub', { p_nombre: nombre });
    if (err) setError(err.message);
    else {
      setNombreClub('');
      setInfo('Club creado.');
      await cargarMios();
    }
  }

  async function buscarClubs() {
    if (!supabase) return;
    const q = busqueda.trim();
    let consulta = supabase.from('clubs').select('id, nombre, descripcion, logo_url, ubicacion, nivel').limit(30);
    if (q) consulta = consulta.ilike('nombre', `%${q}%`);
    const { data, error: err } = await consulta;
    if (err) setError(err.message);
    else setResultados((data || []) as Club[]);
  }

  async function buscarPaddlers() {
    if (!supabase) return;
    const q = busqueda.trim();
    let consulta = supabase.from('perfiles').select('id, nombre, avatar_url, titulo, is_private').limit(30);
    if (q) consulta = consulta.ilike('nombre', `%${q}%`);
    const { data, error: err } = await consulta;
    if (err) setError(err.message);
    else setPaddlers(((data || []) as Array<{ id: string; nombre: string | null; avatar_url: string | null; titulo: string | null; is_private?: boolean }>).filter((p) => !p.is_private));
  }

  async function solicitar(clubId: string) {
    if (!supabase || !session) return setError('Entra para pedir plaza.');
    const { error: err } = await supabase.from('clubs_solicitudes').insert([{ club_id: clubId, user_id: session.user.id, estado: 'pendiente' }]);
    if (err) setError(err.message);
    else setInfo('Solicitud enviada.');
  }

  async function enviarMensaje() {
    if (!supabase || !session || !activo) return setError('Entra para escribir en el chat.');
    const mensaje = texto.trim();
    if (!mensaje) return;
    const { error: err } = await supabase.from('club_chat').insert([{
      club_id: activo.id,
      user_id: session.user.id,
      mensaje,
      visibility: 'club_only',
      is_public: false
    }]);
    if (err) setError(err.message);
    else {
      setTexto('');
      await cargarChat(activo.id);
    }
  }

  async function crearEvento(form: FormData) {
    if (!supabase || !session || !activo) return;
    const fecha = String(form.get('fecha') || '');
    const hora = String(form.get('hora') || '');
    const cuando = new Date(`${fecha}T${hora}:00`);
    if (Number.isNaN(cuando.getTime()) || cuando.getTime() < Date.now()) {
      setError('La quedada tiene que ser en el futuro.');
      return;
    }
    if (cuando.getTime() - Date.now() > 7 * 86400000) {
      setError('Las quedadas se publican con un máximo de 7 días, para que el parte siga siendo útil.');
      return;
    }
    const { data, error: err } = await supabase.from('club_eventos').insert([{
      club_id: activo.id,
      creador_id: session.user.id,
      nombre: String(form.get('nombre') || 'Quedada'),
      descripcion: String(form.get('descripcion') || ''),
      fecha_evento: cuando.toISOString()
    }]).select('id').maybeSingle();
    if (err) setError(err.message);
    else {
      if (data?.id) await supabase.from('club_eventos_asistentes').insert([{ evento_id: data.id, user_id: session.user.id }]);
      setInfo('Quedada publicada.');
      await cargarEventos(activo.id);
    }
  }

  async function apuntarse(eventoId: string) {
    if (!supabase || !session) return setError('Entra para apuntarte.');
    const { data } = await supabase.from('club_eventos_asistentes').select('evento_id').eq('evento_id', eventoId).eq('user_id', session.user.id).maybeSingle();
    if (data) {
      await supabase.from('club_eventos_asistentes').delete().eq('evento_id', eventoId).eq('user_id', session.user.id);
    } else {
      const { error: err } = await supabase.from('club_eventos_asistentes').insert([{ evento_id: eventoId, user_id: session.user.id }]);
      if (err) setError(err.message);
    }
    setInfo('Asistencia actualizada.');
  }

  async function crearReto(form: FormData) {
    if (!supabase || !session || !activo) return;
    const { data, error: err } = await supabase.from('club_retos').insert([{
      club_id: activo.id,
      creador_id: session.user.id,
      titulo: String(form.get('titulo') || 'Reto'),
      descripcion: String(form.get('descripcion') || ''),
      tipo: 'km',
      meta_valor: Number(form.get('meta') || 10),
      xp_recompensa: 100,
      fecha_inicio: new Date().toISOString(),
      fecha_fin: new Date(Date.now() + 30 * 86400000).toISOString()
    }]).select('id').maybeSingle();
    if (err) setError(err.message);
    else if (data?.id) {
      await supabase.from('club_retos_participantes').insert([{ reto_id: data.id, user_id: session.user.id }]);
      await cargarRetos(activo.id);
    }
  }

  async function unirseReto(retoId: string) {
    if (!supabase || !session) return;
    const { error: err } = await supabase.from('club_retos_participantes').insert([{ reto_id: retoId, user_id: session.user.id }]);
    if (err) setError(err.message);
    else setInfo('Te has unido al reto.');
  }

  async function subirLogo(file: File) {
    if (!supabase || !session || !activo) return;
    const path = `clubs/${activo.id}-logo-${Date.now()}.jpg`;
    const { error: err } = await supabase.storage.from('paddlesafe').upload(path, file, { upsert: true, contentType: file.type });
    if (err) return setError(err.message);
    const { data } = supabase.storage.from('paddlesafe').getPublicUrl(path);
    const { error: upd } = await supabase.from('clubs').update({ logo_url: data.publicUrl }).eq('id', activo.id);
    if (upd) setError(upd.message);
    else {
      setActivo({ ...activo, logo_url: data.publicUrl });
      setInfo('Logo actualizado.');
    }
  }

  async function borrarClub() {
    if (!supabase || !activo) return;
    if (!window.confirm(`¿Eliminar el club ${activo.nombre}? Esta acción no se deshace.`)) return;
    const { error: err } = await supabase.rpc('club_eliminar', { p_club_id: activo.id });
    if (err) setError(err.message);
    else {
      setActivo(null);
      setInfo('Club eliminado.');
      await cargarMios();
    }
  }

  async function amistad(paddlerId: string) {
    if (!supabase || !session) return setError('Entra para enviar una solicitud.');
    if (paddlerId === session.user.id) return;
    const { error: err } = await supabase.from('amistades').insert([{ usuario_id: session.user.id, amigo_id: paddlerId, estado: 'pendiente' }]);
    if (err) setError(err.message);
    else setInfo('Solicitud de amistad enviada.');
  }

  if (!session) {
    return <Aviso>Entra o crea una cuenta en Perfil para usar clubes, chat y quedadas. Puedes evaluar el mar sin cuenta.</Aviso>;
  }

  if (activo) {
    return (
      <div className="space-y-3">
        <Boton variante="suave" onClick={() => setActivo(null)}>Volver a clubes</Boton>
        <Tarjeta className="space-y-2">
          <div className="flex items-center gap-3">
            {activo.logo_url && <img src={activo.logo_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />}
            <div>
              <h1 className="text-xl font-black">{activo.nombre}</h1>
              <p className="text-sm text-slate-400">{activo.ubicacion || 'Sin sede'} · tu rol: {rol || 'sin ficha'}</p>
            </div>
          </div>
          <p className="text-sm text-slate-300">{activo.descripcion}</p>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-white/15 px-3 text-sm font-bold">
            Cambiar logo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirLogo(f); }} />
          </label>
          {(rol === 'admin' || rol === 'owner' || rol === 'creador') && <Boton variante="peligro" onClick={borrarClub}>Eliminar club</Boton>}
        </Tarjeta>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {info && <Aviso tipo="ok">{info}</Aviso>}
        <Tarjeta>
          <h2 className="mb-2 font-black">Chat del club</h2>
          <ul className="mb-2 max-h-64 space-y-2 overflow-auto">
            {mensajes.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white/5 px-3 py-2 text-sm">
                <span className="font-bold">{m.autor}</span>
                <p>{m.mensaje}</p>
              </li>
            ))}
            {mensajes.length === 0 && <li className="text-sm text-slate-400">Todavía no hay mensajes.</li>}
          </ul>
          <div className="flex gap-2">
            <input className={inputCls} value={texto} placeholder="Mensaje para el club" onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviarMensaje(); }} />
            <Boton onClick={enviarMensaje}>Enviar</Boton>
          </div>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <h2 className="font-black">Quedadas</h2>
          {eventos.map((ev) => (
            <div key={ev.id} className="rounded-2xl bg-white/5 p-3 text-sm">
              <p className="font-bold">{ev.nombre}</p>
              <p className="text-slate-400">{ev.fecha_evento ? new Date(ev.fecha_evento).toLocaleString('es') : ''}</p>
              <p>{ev.descripcion}</p>
              <Boton variante="suave" className="mt-2" onClick={() => apuntarse(ev.id)}>Me apunto / cancelar</Boton>
            </div>
          ))}
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); crearEvento(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
            <input name="nombre" className={inputCls} placeholder="Nombre de la quedada" required />
            <input name="descripcion" className={inputCls} placeholder="Punto de encuentro" />
            <div className="grid grid-cols-2 gap-2">
              <input name="fecha" type="date" className={inputCls} required />
              <input name="hora" type="time" className={inputCls} required />
            </div>
            <Boton type="submit">Publicar quedada</Boton>
          </form>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <h2 className="font-black">Retos</h2>
          {retos.map((reto) => (
            <div key={reto.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white/5 p-3 text-sm">
              <div>
                <p className="font-bold">{reto.titulo}</p>
                <p className="text-slate-400">{reto.descripcion} · meta {reto.meta_valor} km</p>
              </div>
              <Boton variante="suave" onClick={() => unirseReto(reto.id)}>Unirme</Boton>
            </div>
          ))}
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); crearReto(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
            <input name="titulo" className={inputCls} placeholder="Título del reto" required />
            <input name="descripcion" className={inputCls} placeholder="Descripción" />
            <input name="meta" type="number" min={1} className={inputCls} placeholder="Kilómetros" defaultValue={10} />
            <Boton type="submit">Crear reto</Boton>
          </form>
        </Tarjeta>
        <Tarjeta>
          <h2 className="mb-2 font-black">Miembros</h2>
          <ul className="space-y-1 text-sm">
            {miembros.map((m, i) => <li key={`${m.user_id}-${i}`}>{m.nombre || m.user_id} {m.rol ? `· ${m.rol}` : ''}</li>)}
          </ul>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([['mios', 'Mis clubes'], ['buscar', 'Buscar'], ['paddlers', 'Paddlers']] as const).map(([id, label]) => (
          <button key={id} type="button" className={`min-h-11 rounded-2xl text-sm font-black ${tab === id ? 'bg-emerald-400 text-slate-950' : 'bg-white/5'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {info && <Aviso tipo="ok">{info}</Aviso>}
      {tab === 'mios' && (
        <Tarjeta className="space-y-2">
          <h1 className="text-lg font-black">Hola, {perfil?.nombre || 'paddler'}</h1>
          {mios.length === 0 && <p className="text-sm text-slate-400">No perteneces a ningún club todavía.</p>}
          {mios.map((club) => (
            <button key={club.id} type="button" className="min-h-11 w-full rounded-2xl bg-white/5 px-3 text-left font-bold" onClick={() => abrir(club)}>{club.nombre}</button>
          ))}
          <Campo etiqueta="Crear club">
            <div className="flex gap-2">
              <input className={inputCls} value={nombreClub} onChange={(e) => setNombreClub(e.target.value)} placeholder="Nombre del club" />
              <Boton onClick={crearClub}>Crear</Boton>
            </div>
          </Campo>
        </Tarjeta>
      )}
      {tab === 'buscar' && (
        <Tarjeta className="space-y-2">
          <div className="flex gap-2">
            <input className={inputCls} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del club" />
            <Boton onClick={buscarClubs}>Buscar</Boton>
          </div>
          {resultados.map((club) => (
            <div key={club.id} className="flex items-center gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-2xl bg-white/5 px-3 text-left" onClick={() => abrir(club)}>
                <span className="font-bold">{club.nombre}</span>
                <span className="block text-xs text-slate-400">{club.ubicacion}</span>
              </button>
              <Boton variante="suave" onClick={() => solicitar(club.id)}>Unirme</Boton>
            </div>
          ))}
        </Tarjeta>
      )}
      {tab === 'paddlers' && (
        <Tarjeta className="space-y-2">
          <div className="flex gap-2">
            <input className={inputCls} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre" />
            <Boton onClick={buscarPaddlers}>Buscar</Boton>
          </div>
          {paddlers.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="min-h-11 flex-1 rounded-2xl bg-white/5 px-3 py-2">
                <p className="font-bold">{p.nombre || 'Paddler'}</p>
                <p className="text-xs text-slate-400">{p.titulo}</p>
              </div>
              <Boton variante="suave" onClick={() => amistad(p.id)}>Amistad</Boton>
            </div>
          ))}
        </Tarjeta>
      )}
    </div>
  );
}
