import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PremiumPage } from './PremiumPage';

const play = vi.hoisted(() => ({
  prepararPlay: vi.fn(),
  comprarPlan: vi.fn(),
  restaurarPlay: vi.fn(),
  esAndroid: vi.fn(() => true),
  estadoSinPlay: () => ({
    disponible: false, conectado: false, activo: false, pendiente: false, token: null, producto: null, planes: [], error: null
  }),
  urlGestionSuscripcion: () => 'https://play.google.com/store/account/subscriptions?package=es.evolucionesdigitales.paddlesafe&sku=premium'
}));

vi.mock('@/lib/play', () => play);
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ session: null })
}));

import { AccesoProvider } from '@/context/AccesoContext';

describe('pantalla Premium', () => {
  beforeEach(() => {
    cleanup();
    play.esAndroid.mockReturnValue(true);
    play.prepararPlay.mockResolvedValue({
      disponible: true,
      conectado: true,
      activo: false,
      pendiente: false,
      token: null,
      producto: 'premium',
      planes: [{ idBase: 'mensual', oferta: 'oferta-mes', precio: '3,99 €', periodo: 'P1M' }],
      error: null
    });
  });

  it('muestra el precio que devuelve Play y no uno escrito en la app', async () => {
    render(
      <MemoryRouter>
        <AccesoProvider>
          <PremiumPage />
        </AccesoProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('3,99 €')).toBeTruthy();
    expect(screen.queryByText(/4,99/)).toBeNull();
    expect(screen.getByText('Siempre gratis')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gestionar o cancelar en Play' }).getAttribute('href')).toContain('sku=premium');
  });

  it('en el navegador explica que el cobro es en la app Android', async () => {
    play.esAndroid.mockReturnValue(false);
    play.prepararPlay.mockResolvedValue({
      disponible: false, conectado: false, activo: false, pendiente: false, token: null, producto: null, planes: [], error: null
    });
    render(
      <MemoryRouter>
        <AccesoProvider>
          <PremiumPage />
        </AccesoProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/se contrata en la app Android/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurar compras' }).hasAttribute('disabled')).toBe(true);
  });

  it('muestra el ahorro del anual cuando Play manda los dos precios en micros', async () => {
    play.prepararPlay.mockResolvedValue({
      disponible: true,
      conectado: true,
      activo: false,
      pendiente: false,
      token: null,
      producto: 'premium',
      planes: [
        { idBase: 'mensual', oferta: 'oferta-mes', precio: '4,99 €', periodo: 'P1M', micros: 4_990_000, moneda: 'EUR' },
        { idBase: 'anual', oferta: 'oferta-ano', precio: '39,99 €', periodo: 'P1Y', micros: 39_990_000, moneda: 'EUR' }
      ],
      error: null
    });
    render(
      <MemoryRouter>
        <AccesoProvider>
          <PremiumPage />
        </AccesoProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('Ahorra 33 %')).toBeTruthy();
    expect(screen.getByText(/menos al año/)).toBeTruthy();
    expect(screen.getByText(/equivale a/)).toBeTruthy();
  });

  it('no pone insignia si falta el precio mensual', async () => {
    render(
      <MemoryRouter>
        <AccesoProvider>
          <PremiumPage />
        </AccesoProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('3,99 €')).toBeTruthy();
    expect(screen.queryByText(/Ahorra/)).toBeNull();
  });

  it('al suscribirse usa el token de oferta que mandó Play', async () => {
    play.comprarPlan.mockResolvedValue({
      disponible: true, conectado: true, activo: true, pendiente: false, token: 'tok', producto: 'premium', planes: [], error: null
    });
    const usuario = { click: (el: HTMLElement) => fireEvent.click(el) };
    render(
      <MemoryRouter>
        <AccesoProvider>
          <PremiumPage />
        </AccesoProvider>
      </MemoryRouter>
    );
    await usuario.click(await screen.findByRole('button', { name: 'Suscribirme' }));
    expect(play.comprarPlan).toHaveBeenCalledWith('oferta-mes');
  });
});
