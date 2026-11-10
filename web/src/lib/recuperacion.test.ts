import { describe, expect, it } from 'vitest';
import { enlaceTraeRecuperacion, urlRetornoRecuperacion, urlSinTokens } from './recuperacion';

describe('retorno de recuperación', () => {
  it('no pone la ruta de HashRouter en el fragmento que Supabase va a sustituir', () => {
    const url = urlRetornoRecuperacion('https://localhost', '/');
    expect(url).toBe('https://localhost/');
    expect(url.includes('#')).toBe(false);
    const sitio = urlRetornoRecuperacion('https://www.sup.evolucionesdigitales.es', '/index.html');
    expect(sitio).toBe('https://www.sup.evolucionesdigitales.es/index.html');
    expect(sitio.includes('#/perfil')).toBe(false);
  });

  it('reconoce el token de recuperación aunque haya borrado #/perfil', () => {
    expect(enlaceTraeRecuperacion('https://localhost/#access_token=abc&refresh_token=def&type=recovery')).toBe(true);
    expect(enlaceTraeRecuperacion('https://localhost/?type=recovery&code=abc')).toBe(true);
    expect(enlaceTraeRecuperacion('https://localhost/#/perfil')).toBe(false);
    expect(enlaceTraeRecuperacion('https://localhost/#access_token=abc&type=signup')).toBe(false);
  });

  it('deja la ruta de perfil sin tokens después de guardar la contraseña', () => {
    expect(urlSinTokens('https://localhost', '/')).toBe('https://localhost/#/perfil');
    expect(urlSinTokens('https://localhost', '/').includes('access_token')).toBe(false);
  });
});
