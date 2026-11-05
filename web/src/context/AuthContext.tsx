import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { supabaseConfigured } from '@/lib/env';
import { sincronizarRutaPendiente, textoError } from '@/lib/db';

export type Perfil = {
  id: string;
  nombre: string | null;
  avatar_url: string | null;
  titulo: string | null;
  nivel: number | null;
  puntos: number | null;
  total_xp: number | null;
  km_totales: number | null;
  total_distance_km: number | null;
  is_private: boolean | null;
  insignias: unknown;
  sup_board_type: string | null;
  sup_cruise_speed_kmh: number | null;
  sup_gear_name: string | null;
};

type AuthValue = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  perfil: Perfil | null;
  guest: boolean;
  userId: string | null;
  nombreVisible: string;
  enterGuest: () => void;
  exitGuest: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nombre: string) => Promise<string>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshPerfil: () => Promise<void>;
  updatePerfil: (patch: Partial<Perfil>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const GUEST_KEY = 'ps_guest_mode';

async function leerPerfil(userId: string, email?: string | null): Promise<Perfil | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.warn(error.message);
    return null;
  }
  if (data) return data as Perfil;
  const nombre = (email || 'Paddler').split('@')[0];
  const { data: creado } = await supabase
    .from('perfiles')
    .upsert([{ id: userId, nombre }], { onConflict: 'id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();
  return (creado as Perfil) || { id: userId, nombre, avatar_url: null, titulo: null, nivel: 1, puntos: 0, total_xp: 0, km_totales: 0, total_distance_km: 0, is_private: false, insignias: [], sup_board_type: null, sup_cruise_speed_kmh: null, sup_gear_name: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [guest, setGuest] = useState(() => localStorage.getItem(GUEST_KEY) === '1');

  const refreshPerfil = useCallback(async () => {
    if (!session?.user) {
      setPerfil(null);
      return;
    }
    const data = await leerPerfil(session.user.id, session.user.email);
    setPerfil(data);
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        setGuest(false);
        localStorage.removeItem(GUEST_KEY);
      }
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setPerfil(null);
      return;
    }
    leerPerfil(session.user.id, session.user.email).then(setPerfil).catch(() => setPerfil(null));
    sincronizarRutaPendiente(session.user.id).catch((error) => console.warn(textoError(error)));
  }, [session]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user) return;
    const canal = client.channel('presence:paddlesafe_global', { config: { presence: { key: session.user.id } } });
    canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await canal.track({ user_id: session.user.id, status: 'online', updated_at: new Date().toISOString() }).catch(() => undefined);
      }
    });
    const alOcultar = () => {
      const status = document.visibilityState === 'hidden' ? 'away' : 'online';
      canal.track({ user_id: session.user.id, status, updated_at: new Date().toISOString() }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      client.removeChannel(canal);
    };
  }, [session]);

  const value = useMemo<AuthValue>(() => ({
    ready,
    configured: supabaseConfigured,
    session,
    perfil,
    guest: guest && !session,
    userId: session?.user.id ?? null,
    nombreVisible: perfil?.nombre || (guest ? 'Invitado' : 'Paddler'),
    enterGuest: () => {
      localStorage.setItem(GUEST_KEY, '1');
      setGuest(true);
    },
    exitGuest: () => {
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
    },
    async signIn(email, password) {
      if (!supabase) throw new Error('Falta la configuración de Supabase.');
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const texto = /invalid login credentials/i.test(error.message)
          ? 'Correo o contraseña incorrectos.'
          : /email not confirmed/i.test(error.message)
            ? 'Confirma el correo antes de entrar.'
            : error.message;
        throw new Error(texto);
      }
    },
    async signUp(email, password, nombre) {
      if (!supabase) throw new Error('Falta la configuración de Supabase.');
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nombre: nombre.trim() }, emailRedirectTo: window.location.origin }
      });
      if (error) throw new Error(error.message);
      if (data.user) {
        await supabase.from('perfiles').upsert({ id: data.user.id, nombre: nombre.trim() }, { onConflict: 'id' });
      }
      return data.session
        ? 'Cuenta creada. Ya puedes entrar.'
        : 'Cuenta creada. Revisa tu correo para confirmarla antes de entrar.';
    },
    async signOut() {
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
      if (supabase) await supabase.auth.signOut();
    },
    async resetPassword(email) {
      if (!supabase) throw new Error('Falta la configuración de Supabase.');
      const redirect = `${window.location.origin}${window.location.pathname}#/perfil`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
      if (error) throw new Error(error.message);
    },
    async updatePassword(password) {
      if (!supabase) throw new Error('Falta la configuración de Supabase.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    refreshPerfil,
    async updatePerfil(patch) {
      if (!supabase || !session?.user) throw new Error('Inicia sesión para guardar el perfil.');
      const { error } = await supabase.from('perfiles').update(patch).eq('id', session.user.id);
      if (error) throw new Error(error.message);
      await refreshPerfil();
    },
    async uploadAvatar(file) {
      if (!supabase || !session?.user) throw new Error('Inicia sesión para cambiar la foto.');
      if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
      if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB.');
      const path = `avatares/${session.user.id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('paddlesafe').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('paddlesafe').getPublicUrl(path);
      await supabase.from('perfiles').update({ avatar_url: data.publicUrl }).eq('id', session.user.id);
      await refreshPerfil();
    }
  }), [guest, perfil, ready, refreshPerfil, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
