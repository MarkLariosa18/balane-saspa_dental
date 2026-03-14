// ─── Shared admin UI primitives (dark theme) ─────────────────────────────────

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center py-20 text-white/30">
      <Spinner size={32} />
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────
export interface Toast { id: number; message: string; type: 'success' | 'error' | 'info' | 'warning'; }

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  const configs: Record<string, { bg: string; border: string; icon: string }> = {
    success: { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)',  icon: '✓' },
    error:   { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', icon: '✕' },
    warning: { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  icon: '!' },
    info:    { bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.25)',  icon: 'i' },
  };
  const colors: Record<string, string> = { success: '#34d399', error: '#f87171', warning: '#fbbf24', info: '#38bdf8' };
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[9998]">
      {toasts.map(t => {
        const c = configs[t.type];
        return (
          <div key={t.id} className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium min-w-[220px]"
            style={{ background: c.bg, border: `1px solid ${c.border}`, color: colors[t.type] }}>
            <span className="font-bold">{c.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  function addToast(message: string, type: Toast['type']) {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }
  return { toasts, addToast };
}

// ── Status Badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    confirmed: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
    rejected:  'bg-red-500/15 text-red-400 border-red-500/25',
    expired:   'bg-white/10 text-white/40 border-white/15',
    'no-show': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  };
  const dots: Record<string, string> = {
    pending: 'bg-yellow-400', confirmed: 'bg-sky-400', completed: 'bg-emerald-400',
    cancelled: 'bg-red-400', rejected: 'bg-red-400', expired: 'bg-white/30', 'no-show': 'bg-orange-400',
  };
  const key = status.toLowerCase().replace(' ', '-');
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border ${map[key] || 'bg-white/10 text-white/40 border-white/15'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[key] || 'bg-white/30'}`} />
      {status}
    </span>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export interface ConfirmOpts { title: string; text?: string; confirmText?: string; danger?: boolean; }
export function ConfirmDialog({ opts, onConfirm, onCancel }: { opts: ConfirmOpts; onConfirm: () => void; onCancel: () => void }) {
  const accent = opts.danger ? '#f87171' : '#38bdf8';
  const bg     = opts.danger ? 'rgba(248,113,113,0.1)' : 'rgba(56,189,248,0.1)';
  const border = opts.danger ? 'rgba(248,113,113,0.2)' : 'rgba(56,189,248,0.2)';
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="rounded-2xl w-full max-w-sm p-7 text-center shadow-2xl"
        style={{ background: '#0d0d15', border: `1px solid ${border}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5"
          style={{ background: bg, color: accent, border: `1px solid ${border}` }}>
          {opts.danger ? '!' : '?'}
        </div>
        <h3 className="text-base font-bold text-white mb-2">{opts.title}</h3>
        {opts.text && <p className="text-sm text-white/40 mb-6 leading-relaxed">{opts.text}</p>}
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel}
            className="px-5 py-2 rounded-xl border border-white/10 text-white/50 text-sm font-medium hover:bg-white/[0.06] transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: opts.danger ? '#ef4444' : 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: opts.danger ? '0 4px 16px rgba(239,68,68,0.3)' : '0 4px 16px rgba(56,189,248,0.25)' }}>
            {opts.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert Dialog ──────────────────────────────────────────────────────────────
export interface DialogOptions { icon?: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string; }
export function AlertDialog({ opts, onClose }: { opts: DialogOptions; onClose: () => void }) {
  const configs: Record<string, { accent: string; bg: string; border: string; symbol: string }> = {
    success: { accent: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  symbol: '✓' },
    error:   { accent: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', symbol: '✕' },
    warning: { accent: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  symbol: '⚠' },
    info:    { accent: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.2)',  symbol: 'ℹ' },
  };
  const c = configs[opts.icon || 'info'];
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="rounded-2xl w-full max-w-sm p-7 text-center shadow-2xl"
        style={{ background: '#0d0d15', border: `1px solid ${c.border}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5"
          style={{ background: c.bg, color: c.accent, border: `1px solid ${c.border}` }}>{c.symbol}</div>
        <h3 className="text-base font-bold text-white mb-2">{opts.title}</h3>
        {opts.text && <p className="text-sm text-white/40 mb-6 leading-relaxed">{opts.text}</p>}
        <button onClick={onClose} className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.accent }}>Got it</button>
      </div>
    </div>
  );
}

export function useDialog() {
  const [state, setState] = React.useState<{ opts: DialogOptions; resolve: () => void } | null>(null);
  const fire = React.useCallback((opts: DialogOptions): Promise<void> => new Promise(r => setState({ opts, resolve: r })), []);
  const close = React.useCallback(() => { state?.resolve(); setState(null); }, [state]);
  const node = state ? <AlertDialog opts={state.opts} onClose={close} /> : null;
  return { node, fire };
}

// ── Page Header ───────────────────────────────────────────────────────────────
export function PageHeader({ section, title }: { section: string; title: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full text-[10px] font-bold text-sky-400 tracking-widest uppercase"
        style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
        {section}
      </div>
      <h2 className="text-2xl font-black text-white tracking-tight">{title}</h2>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

// ── Card Header ───────────────────────────────────────────────────────────────
export function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between flex-wrap gap-3"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      {children}
    </div>
  );
}

// ── Search Input ──────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', width = 'w-52' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: string;
}) {
  return (
    <div className={`relative ${width}`}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
        onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      />
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-2 rounded-xl text-sm text-white focus:outline-none transition-all appearance-none cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
      {children}
    </select>
  );
}

// ── Dark Input / Textarea ─────────────────────────────────────────────────────
export const darkInputCls = [
  'w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20',
  'focus:outline-none transition-all',
].join(' ');

export function DarkInput({ value, onChange, placeholder, type = 'text', readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
}) {
  const base = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' };
  const focus = { borderColor: 'rgba(56,189,248,0.4)', background: 'rgba(255,255,255,0.08)' };
  return (
    <input type={type} value={value} readOnly={readOnly} placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      className={`${darkInputCls} ${readOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={base}
      onFocus={e => { if (!readOnly) Object.assign(e.currentTarget.style, focus); }}
      onBlur={e  => { if (!readOnly) Object.assign(e.currentTarget.style, base); }}
    />
  );
}

export function DarkTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const base = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' };
  const focus = { borderColor: 'rgba(56,189,248,0.4)', background: 'rgba(255,255,255,0.08)' };
  return (
    <textarea value={value} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      className={`${darkInputCls} resize-none`} style={base}
      onFocus={e => Object.assign(e.currentTarget.style, focus)}
      onBlur={e  => Object.assign(e.currentTarget.style, base)}
    />
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-center gap-1.5">
      <PagBtn onClick={() => onChange(page - 1)} disabled={page === 1}>‹</PagBtn>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <PagBtn key={p} onClick={() => onChange(p)} active={p === page}>{p}</PagBtn>
      ))}
      <PagBtn onClick={() => onChange(page + 1)} disabled={page === totalPages}>›</PagBtn>
    </div>
  );
}

function PagBtn({ onClick, disabled, active, children }: { onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded-xl text-sm font-semibold transition-all ${active ? 'text-white' : 'text-white/40 border border-white/10 hover:text-white hover:bg-white/[0.06] disabled:opacity-30'}`}
      style={active ? { background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 12px rgba(56,189,248,0.25)' } : {}}>
      {children}
    </button>
  );
}

// ── Gradient button ───────────────────────────────────────────────────────────
export function GradientBtn({ onClick, disabled, children, className = '' }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode; className?: string; }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${className}`}
      style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 14px rgba(56,189,248,0.2)' }}>
      {children}
    </button>
  );
}

// ── Table header cell ─────────────────────────────────────────────────────────
export function Th({ onClick, sorted, dir, children }: { onClick?: () => void; sorted?: boolean; dir?: 'asc' | 'desc'; children: React.ReactNode }) {
  return (
    <th onClick={onClick}
      className={`px-5 py-3.5 text-left text-[10px] font-bold text-white/25 uppercase tracking-widest whitespace-nowrap select-none ${onClick ? 'cursor-pointer hover:text-white/60 transition-colors' : ''}`}
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span className="flex items-center gap-1">
        {children}
        {onClick && <span className={sorted ? 'text-sky-400' : 'opacity-30'}>{sorted ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>}
      </span>
    </th>
  );
}

// need React in scope for JSX
import React from 'react';