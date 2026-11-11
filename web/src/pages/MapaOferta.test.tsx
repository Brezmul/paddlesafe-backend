import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { MapaPage } from './MapaPage';

vi.mock('@/lib/supabase', () => ({ supabase: null }));
vi.mock('@/context/AccesoContext', () => ({
  useAcceso: () => ({
    listo: true,
    premium: false,
    origen: 'ninguno',
    play: { disponible: false, conectado: false, activo: false, pendiente: false, token: null, producto: null, planes: [], error: null },
    puede: (funcion: string) => ['mapa', 'busqueda', 'gps', 'veredicto', 'avisos', 'radar'].includes(funcion),
    recargarPlay: async () => undefined,
    fijarPlay: () => undefined
  })
}));
vi.mock('@/components/SpotMap', () => ({
  SpotMap: () => <div>mapa</div>
}));

describe('Mapa gratis', () => {
  afterEach(() => cleanup());

  it('muestra un solo bloque Premium debajo del sitio, sin tarjetas repetidas', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <MapaPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getAllByRole('heading', { name: 'Desbloquea con Premium' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Ver Premium' })).toBeTruthy();
    expect(screen.getByText(/Panel táctico y evolución por horas/)).toBeTruthy();
    expect(screen.queryByText(/es Premium/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Spots guardados' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar spot' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Evaluar spot' })).toBeTruthy();
  });
});
