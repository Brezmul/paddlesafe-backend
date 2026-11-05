import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, supabaseConfigured } from './env';

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
