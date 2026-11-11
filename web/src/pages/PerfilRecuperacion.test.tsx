import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { AccesoProvider } from '@/context/AccesoContext';
import { PerfilPage } from './PerfilPage';

vi.mock('@/lib/supabase', () => ({ supabase: null }));

describe('perfil tras el enlace de recuperación', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#access_token=abc&refresh_token=def&type=recovery');
  });

  it('muestra el formulario de contraseña nueva y no el de entrar', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AccesoProvider>
            <PerfilPage />
          </AccesoProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Elige una contraseña nueva' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull();
  });
});
