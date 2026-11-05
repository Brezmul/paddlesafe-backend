export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
  backendUrl: (import.meta.env.VITE_BACKEND_API_URL || 'https://paddlesafe-backend.vercel.app/api/backend').replace(/\/$/, '')
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
