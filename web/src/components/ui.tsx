import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Boton({ children, variante = 'solido', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'solido' | 'suave' | 'peligro' }) {
  const estilos = {
    solido: 'bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950',
    suave: 'border border-white/15 bg-white/5 text-slate-100',
    peligro: 'bg-rose-500/90 text-white'
  }[variante];
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-3 text-sm font-black disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</span>
      {children}
    </label>
  );
}

export const inputCls = 'min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-sky-400';

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'error' | 'ok' }) {
  const color = tipo === 'error' ? 'border-rose-400/40 bg-rose-500/10 text-rose-100' : tipo === 'ok' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-sky-400/30 bg-sky-500/10 text-sky-100';
  return <p className={`rounded-2xl border px-3 py-2 text-sm ${color}`}>{children}</p>;
}

export function Tarjeta({ children, className = '', ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={`rounded-3xl border border-white/10 bg-slate-900/70 p-3 ${className}`} {...props}>{children}</section>;
}
