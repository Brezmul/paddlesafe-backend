/**
 * El enlace de recuperación de Supabase (flujo implícito, el de este cliente)
 * vuelve con los tokens en el fragmento: `#access_token=…&type=recovery`.
 * HashRouter también usa el fragmento (`#/perfil`). Si redirectTo ya lleva
 * `#/perfil`, el fragmento de la ruta y el del token se pisan y la app no
 * llega al formulario. La URL de retorno es solo origen + ruta, sin almohadilla.
 */

export function urlRetornoRecuperacion(origen: string, ruta: string): string {
  const base = new URL(ruta || '/', origen);
  base.hash = '';
  base.search = '';
  return base.toString();
}

export function enlaceTraeRecuperacion(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const consulta = url.searchParams.get('type');
  if (consulta === 'recovery') return true;
  const fragmento = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!fragmento || fragmento.startsWith('/')) return false;
  return new URLSearchParams(fragmento).get('type') === 'recovery';
}

export function urlSinTokens(origen: string, ruta: string): string {
  const base = new URL(ruta || '/', origen);
  base.hash = '#/perfil';
  base.search = '';
  return base.toString();
}
