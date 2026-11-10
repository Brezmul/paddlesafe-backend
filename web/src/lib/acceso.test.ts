import { describe, expect, it } from 'vitest';
import { decidirPremium, puedeUsar, textoPeriodo } from './acceso';

describe('acceso Premium', () => {
  it('deja gratis el veredicto, los avisos y el radar aunque no haya pago', () => {
    for (const funcion of ['mapa', 'busqueda', 'gps', 'veredicto', 'avisos', 'radar'] as const) {
      expect(puedeUsar(funcion, false)).toBe(true);
    }
    expect(puedeUsar('clubes', false)).toBe(false);
    expect(puedeUsar('cuenta', false)).toBe(false);
    expect(puedeUsar('tactico', true)).toBe(true);
  });

  it('abre Premium con el servidor, con usuarios previos o con Play en el dispositivo', () => {
    expect(decidirPremium({ playActivo: false, derecho: 'activo', accesoPrevio: false, sesion: true, tablaAusente: false }).origen).toBe('servidor');
    expect(decidirPremium({ playActivo: false, derecho: 'inactivo', accesoPrevio: true, sesion: true, tablaAusente: false }).premium).toBe(true);
    expect(decidirPremium({ playActivo: true, derecho: 'desconocido', accesoPrevio: false, sesion: false, tablaAusente: false }).origen).toBe('play');
    expect(decidirPremium({ playActivo: false, derecho: 'inactivo', accesoPrevio: false, sesion: false, tablaAusente: false }).premium).toBe(false);
  });

  it('no cierra la app a quien ya tiene sesión si la tabla de derechos aún no existe', () => {
    const gracia = decidirPremium({ playActivo: false, derecho: 'desconocido', accesoPrevio: false, sesion: true, tablaAusente: true });
    expect(gracia).toEqual({ premium: true, origen: 'gracia' });
    const visita = decidirPremium({ playActivo: false, derecho: 'desconocido', accesoPrevio: false, sesion: false, tablaAusente: true });
    expect(visita.premium).toBe(false);
  });

  it('no inventa un precio: solo traduce el periodo que manda Play', () => {
    expect(textoPeriodo('P1M')).toBe('Cada mes');
    expect(textoPeriodo('P1Y')).toBe('Cada año');
    expect(textoPeriodo('P1W')).toBe('Suscripción');
  });
});
