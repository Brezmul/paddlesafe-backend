import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAcceso } from '@/context/AccesoContext';
import { Aviso, Boton, Campo, inputCls, Tarjeta } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { textoError } from '@/lib/db';
import { borradoConfirmado, solicitarBorradoCuenta } from '@/lib/cuenta';
import { formatoTiempo } from '@/lib/geo';

const TABLAS = [
  { id: 'allround', nombre: 'All-round' },
  { id: 'hinchable', nombre: 'Hinchable' },
  { id: 'rigid_race', nombre: 'Race rígida' },
  { id: 'touring', nombre: 'Touring' },
  { id: 'olas', nombre: 'Olas' }
];

export function PerfilPage() {
  const auth = useAuth();
  const acceso = useAcceso();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<'entrar' | 'crear' | 'recuperar'>('entrar');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nueva, setNueva] = useState('');
  const [rutas, setRutas] = useState<Array<{ id: string; distancia_km: number | null; tiempo_minutos: number | null; ubicacion: string | null; fecha: string | null }>>([]);
  const [palabraBorrado, setPalabraBorrado] = useState('');
  const [avisoBorrado, setAvisoBorrado] = useState(false);
  const [tabla, setTabla] = useState(auth.perfil?.sup_board_type || 'allround');
  const [ritmo, setRitmo] = useState(String(auth.perfil?.sup_cruise_speed_kmh || 4.5));
  const [equipo, setEquipo] = useState(auth.perfil?.sup_gear_name || '');

  useEffect(() => {
    setTabla(auth.perfil?.sup_board_type || 'allround');
    setRitmo(String(auth.perfil?.sup_cruise_speed_kmh || 4.5));
    setEquipo(auth.perfil?.sup_gear_name || '');
    setNombre(auth.perfil?.nombre || '');
  }, [auth.perfil]);

  useEffect(() => {
    if (!supabase || !auth.userId) return;
    supabase.from('rutas').select('id, distancia_km, tiempo_minutos, ubicacion, fecha').eq('user_id', auth.userId).order('fecha', { ascending: false }).limit(15)
      .then(({ data }) => setRutas((data || []) as typeof rutas));
  }, [auth.userId]);

  async function enviarAuth() {
    setError(null);
    setInfo(null);
    try {
      if (modo === 'entrar') {
        await auth.signIn(email, password);
        setInfo('Sesión iniciada.');
      } else if (modo === 'crear') {
        setInfo(await auth.signUp(email, password, nombre || email.split('@')[0]));
      } else {
        await auth.resetPassword(email);
        setInfo('Si el correo existe, recibirás un enlace para elegir una contraseña nueva.');
      }
    } catch (err) {
      setError(textoError(err));
    }
  }

  const xp = Number(auth.perfil?.total_xp ?? auth.perfil?.puntos ?? 0);
  const km = Number(auth.perfil?.km_totales ?? auth.perfil?.total_distance_km ?? 0);
  const insignias = Array.isArray(auth.perfil?.insignias) ? auth.perfil?.insignias as Array<{ nombre?: string; codigo?: string }> : [];

  return (
    <div className="space-y-3">
      {!auth.configured && <Aviso tipo="error">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. El pronóstico sigue funcionando; la cuenta, no.</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {info && <Aviso tipo="ok">{info}</Aviso>}

      {auth.recuperacionPendiente && (
        <Tarjeta className="space-y-3">
          <h1 className="text-xl font-black">Elige una contraseña nueva</h1>
          <p className="text-sm text-slate-300">El enlace del correo ha abierto esta pantalla. La contraseña nueva sustituye a la anterior.</p>
          <Campo etiqueta="Nueva contraseña">
            <input className={inputCls} type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </Campo>
          <Boton onClick={async () => {
            try {
              await auth.updatePassword(nueva);
              setInfo('Contraseña actualizada.');
            } catch (err) {
              setError(textoError(err));
            }
          }}>Guardar contraseña</Boton>
        </Tarjeta>
      )}

      {!auth.session && !auth.recuperacionPendiente && (
        <Tarjeta className="space-y-3">
          <h1 className="text-xl font-black">{modo === 'crear' ? 'Crear cuenta' : modo === 'recuperar' ? 'Recuperar contraseña' : 'Entrar'}</h1>
          {modo === 'crear' && <Aviso>PaddleSafe es para mayores de 18 años. Al crear la cuenta confirmas que tienes esa edad.</Aviso>}
          {modo === 'crear' && <Campo etiqueta="Nombre"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>}
          <Campo etiqueta="Correo"><input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          {modo !== 'recuperar' && <Campo etiqueta="Contraseña"><input className={inputCls} type="password" autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></Campo>}
          <Boton onClick={enviarAuth}>{modo === 'entrar' ? 'Entrar' : modo === 'crear' ? 'Crear cuenta' : 'Enviar enlace'}</Boton>
          <div className="flex flex-wrap gap-2 text-sm">
            {modo === 'entrar' && !acceso.puede('cuenta') ? (
              <Link to="/premium" className="inline-flex min-h-11 items-center font-bold text-sky-300">Crear cuenta es Premium</Link>
            ) : (
              <button type="button" className="min-h-11 font-bold text-sky-300" onClick={() => setModo(modo === 'entrar' ? 'crear' : 'entrar')}>{modo === 'entrar' ? 'No tengo cuenta' : 'Ya tengo cuenta'}</button>
            )}
            <button type="button" className="font-bold text-sky-300" onClick={() => setModo('recuperar')}>Olvidé la contraseña</button>
          </div>
          {!auth.guest && <Boton variante="suave" onClick={auth.enterGuest}>Seguir como invitado</Boton>}
          {auth.guest && <p className="text-sm text-slate-300">Estás en modo invitado. El pronóstico y las rutas locales funcionan; clubes y el muro piden cuenta.</p>}
        </Tarjeta>
      )}

      {auth.session && auth.perfil && (
        <>
          <Tarjeta className="space-y-3">
            <div className="flex items-center gap-3">
              {auth.perfil.avatar_url ? <img src={auth.perfil.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-2xl">🏄</div>}
              <div>
                <h1 className="text-xl font-black">{auth.perfil.nombre}</h1>
                <p className="text-sm text-slate-400">{auth.perfil.titulo || 'Paddler'} · nivel {auth.perfil.nivel || 1}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-white/5 p-3"><p className="text-2xl font-black">{xp}</p><p className="text-xs text-slate-400">XP</p></div>
              <div className="rounded-2xl bg-white/5 p-3"><p className="text-2xl font-black">{km.toFixed(1)}</p><p className="text-xs text-slate-400">km</p></div>
            </div>
            {insignias.length > 0 && (
              <ul className="flex flex-wrap gap-2">{insignias.map((ins, i) => <li key={ins.codigo || i} className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">{ins.nombre || ins.codigo}</li>)}</ul>
            )}
            <Campo etiqueta="Nombre visible"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(auth.perfil.is_private)} onChange={(e) => auth.updatePerfil({ is_private: e.target.checked }).catch((err) => setError(textoError(err)))} />
              Perfil privado (fuera de rankings públicos)
            </label>
            <div className="flex flex-wrap gap-2">
              <Boton onClick={async () => {
                try { await auth.updatePerfil({ nombre }); setInfo('Nombre guardado.'); } catch (err) { setError(textoError(err)); }
              }}>Guardar nombre</Boton>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-white/15 px-3 text-sm font-black">
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { await auth.uploadAvatar(file); setInfo('Foto actualizada.'); } catch (err) { setError(textoError(err)); }
                }} />
              </label>
              <Boton variante="suave" onClick={() => auth.signOut()}>Salir</Boton>
            </div>
          </Tarjeta>
          <Tarjeta className="space-y-2">
            <h2 className="font-black">Mi tabla</h2>
            <select className={inputCls} value={tabla} onChange={(e) => setTabla(e.target.value)}>
              {TABLAS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <Campo etiqueta="Ritmo de crucero (km/h)"><input className={inputCls} type="number" min={2} max={12} step={0.1} value={ritmo} onChange={(e) => setRitmo(e.target.value)} /></Campo>
            <Campo etiqueta="Nombre del equipo"><input className={inputCls} value={equipo} onChange={(e) => setEquipo(e.target.value)} /></Campo>
            <Boton onClick={async () => {
              try {
                await auth.updatePerfil({
                  sup_board_type: tabla,
                  sup_cruise_speed_kmh: Number(ritmo),
                  sup_gear_name: equipo
                });
                setInfo('Equipo guardado. El planificador y el veredicto lo tendrán en cuenta.');
              } catch (err) {
                setError(textoError(err));
              }
            }}>Guardar equipo</Boton>
          </Tarjeta>
          <Tarjeta>
            <h2 className="mb-2 font-black">Mis rutas</h2>
            {rutas.length === 0 && <p className="text-sm text-slate-400">Cuando guardes una travesía aparecerá aquí y en el muro.</p>}
            <ul className="space-y-2">
              {rutas.map((ruta) => (
                <li key={ruta.id} className="rounded-2xl bg-white/5 px-3 py-2 text-sm">
                  <p className="font-bold">{ruta.ubicacion || 'Travesía'}</p>
                  <p className="text-slate-400">{Number(ruta.distancia_km || 0).toFixed(2)} km · {formatoTiempo(Number(ruta.tiempo_minutos || 0))} · {ruta.fecha || ''}</p>
                </li>
              ))}
            </ul>
          </Tarjeta>
          {auth.session && (
            <Tarjeta className="space-y-2">
              <h2 className="font-black text-rose-200">Eliminar mi cuenta</h2>
              <p className="text-sm text-slate-300">Borra el perfil, las rutas, la bitácora, los mensajes y las fotos, y cierra el usuario. No se puede deshacer.</p>
              {(acceso.origen === 'play' || acceso.play.activo) && (
                <Aviso>Si tienes Premium, cancélalo también en Google Play. Borrar la cuenta de PaddleSafe no cancela la suscripción.</Aviso>
              )}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={avisoBorrado} onChange={(e) => setAvisoBorrado(e.target.checked)} />
                Entiendo que se borrarán mis datos
              </label>
              <Campo etiqueta="Escribe ELIMINAR">
                <input className={inputCls} value={palabraBorrado} onChange={(e) => setPalabraBorrado(e.target.value)} autoComplete="off" />
              </Campo>
              <Boton variante="peligro" disabled={!borradoConfirmado(avisoBorrado, palabraBorrado)} onClick={async () => {
                if (!supabase) { setError('No hay conexión con la cuenta.'); return; }
                const cliente = supabase;
                const resultado = await solicitarBorradoCuenta({
                  invoke: (nombre, opciones) => cliente.functions.invoke(nombre, opciones)
                });
                if (!resultado.ok) { setError(resultado.mensaje); return; }
                await auth.signOut();
                setInfo('Cuenta eliminada.');
              }}>Eliminar mi cuenta</Boton>
            </Tarjeta>
          )}
        </>
      )}

      <p className="text-center text-sm">
        <Link className="font-bold text-sky-300" to="/privacidad">Política de privacidad</Link>
        {' · '}
        <a className="font-bold text-sky-300" href="/eliminar-cuenta.html">Eliminar cuenta</a>
      </p>
    </div>
  );
}
