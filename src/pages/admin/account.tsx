import { useState, useEffect } from 'react';
import { Toasts, useToasts, DarkInput, PageHeader } from './admin_shared';

const API_BASE = 'http://localhost:3000';

// ── OTP Modal ─────────────────────────────────────────────────────────────────
function OtpModal({ onVerify, onResend, onClose, timeLeft }: {
  onVerify: (otp: string) => void; onResend: () => void; onClose: () => void; timeLeft: number;
}) {
  const [otp, setOtp] = useState('');
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const base  = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' };
  const focus = { borderColor: 'rgba(56,189,248,0.4)', background: 'rgba(255,255,255,0.08)' };
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="rounded-2xl w-full max-w-sm p-6 shadow-2xl"
        style={{ background: '#0d0d15', border: '1px solid rgba(56,189,248,0.2)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h5 className="text-sm font-bold text-white">Verify OTP</h5>
            <p className="text-xs text-white/30 mt-0.5">Check your email for the code</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] text-lg transition-colors">×</button>
        </div>

        <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)' }}>
          <p className="text-xs text-white/40 mb-3 text-center">Enter the 6-digit OTP sent to your email</p>
          <input
            type="text" maxLength={6} value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="• • • • • •"
            className="w-full px-4 py-3 rounded-xl text-center text-xl font-bold tracking-[0.5em] text-white focus:outline-none transition-all"
            style={base}
            onFocus={e => Object.assign(e.currentTarget.style, focus)}
            onBlur={e  => Object.assign(e.currentTarget.style, base)}
          />
          <p className="text-center text-xs text-white/40 mt-3">
            Time remaining: <span className={`font-bold ${timeLeft < 30 ? 'text-red-400' : 'text-sky-400'}`}>{mins}:{secs}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { if (otp.length === 6) onVerify(otp); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 14px rgba(56,189,248,0.25)' }}>
            Verify OTP
          </button>
          <button onClick={onResend} disabled={timeLeft > 0}
            className="px-4 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => { if (timeLeft === 0) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            Resend
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-white/25">{hint}</p>}
    </div>
  );
}

// ── Password input with show/hide ─────────────────────────────────────────────
function PwField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [show, setShow] = useState(false);
  const base  = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' };
  const focus = { borderColor: 'rgba(56,189,248,0.4)', background: 'rgba(255,255,255,0.08)' };
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-12 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
          style={base}
          onFocus={e => Object.assign(e.currentTarget.style, focus)}
          onBlur={e  => Object.assign(e.currentTarget.style, base)}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1">
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </Field>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const [username, setUsername]       = useState('');
  const [curPwd, setCurPwd]           = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [rePwd, setRePwd]             = useState('');
  const [showOtp, setShowOtp]         = useState(false);
  const [timeLeft, setTimeLeft]       = useState(0);
  const [pendingData, setPendingData] = useState<{ username: string; curPwd: string; newPwd: string } | null>(null);
  const { toasts, addToast }          = useToasts();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/patients/admin-profile`, { credentials: 'include' });
        if (res.ok) { const d = await res.json(); setUsername(d.username || ''); }
      } catch { /* silent */ }
    })();
  }, []);

  useEffect(() => {
    if (!showOtp || timeLeft <= 0) return;
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [showOtp, timeLeft]);

  async function sendOtp() {
    try {
      const res = await fetch(`${API_BASE}/api/send-otp-password-change-admin`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setTimeLeft(180); setShowOtp(true);
      addToast('OTP sent to your email.', 'success');
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !curPwd || !newPwd || !rePwd) { addToast('All fields are required!', 'warning'); return; }
    if (newPwd !== rePwd) { addToast('New passwords do not match!', 'error'); return; }
    setPendingData({ username: username.trim(), curPwd, newPwd });
    await sendOtp();
  }

  async function handleVerify(otp: string) {
    try {
      const vRes  = await fetch(`${API_BASE}/api/verify-otp`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, purpose: 'password_change_admin' }),
      });
      const vData = await vRes.json();
      if (!vData.success) throw new Error(vData.message || 'OTP verification failed');

      const uRes  = await fetch(`${API_BASE}/patients/admin-update`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pendingData!.username, currentPassword: pendingData!.curPwd, newPassword: pendingData!.newPwd }),
      });
      const uData = await uRes.json();
      if (!uData.success) throw new Error(uData.message || 'Update failed');

      setShowOtp(false);
      addToast('Account updated! Please log in again.', 'success');
      setTimeout(() => window.location.href = '/login', 2500);
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
  }

  const initials = username ? username.charAt(0).toUpperCase() : 'A';

  return (
    <>
      <Toasts toasts={toasts} />
      {showOtp && <OtpModal timeLeft={timeLeft} onClose={() => setShowOtp(false)} onVerify={handleVerify} onResend={sendOtp} />}

      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader section="Settings" title="Admin Account" />

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
          {/* Profile card */}
          <div className="space-y-4 h-fit">
            <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-5 text-center">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 8px 24px rgba(56,189,248,0.25)' }}>
                {initials}
              </div>
              <p className="text-sm font-bold text-white">{username || 'Admin'}</p>
              <p className="text-xs text-white/30 mt-1">Administrator</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Active</span>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">Contact Info</p>
              {[
                { icon: '✉', value: 'dmdannsaspa@yahoo.com' },
                { icon: '📞', value: '+63 920 797 6690' },
              ].map(item => (
                <div key={item.value} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] mb-2 last:mb-0"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-xs text-white/40 font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edit form */}
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h3 className="text-sm font-bold text-white">Edit Account</h3>
              <p className="text-xs text-white/30 mt-0.5">Update your credentials and password</p>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <Field label="Username">
                <DarkInput value={username} onChange={setUsername} placeholder="Enter username" />
              </Field>

              <div className="border-t border-white/[0.06] pt-5">
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-4">Change Password</p>
                <div className="space-y-4">
                  <PwField label="Current Password" value={curPwd} onChange={setCurPwd} />
                  <PwField label="New Password" value={newPwd} onChange={setNewPwd} hint="At least 8 characters with numbers and symbols." />
                  <PwField label="Confirm New Password" value={rePwd} onChange={setRePwd} />
                </div>
              </div>

              <div className="pt-2">
                <button type="submit"
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 16px rgba(56,189,248,0.25)' }}>
                  Update Account
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}