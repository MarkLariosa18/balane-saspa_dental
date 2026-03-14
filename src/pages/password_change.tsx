import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API = 'http://localhost:3000'

// ── Shared layout wrapper ──────────────────────────────────────────────────────
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute -bottom-40 left-1/3 w-72 h-72 bg-cyan-500/8 rounded-full blur-[100px] animate-pulse delay-2000" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }}
        />
      </div>
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  )
}

// ── Shared card ───────────────────────────────────────────────────────────────
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
      {children}
    </div>
  )
}

// ── Brand header ──────────────────────────────────────────────────────────────
function Brand() {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-lg shadow-lg shadow-sky-500/25">
        🦷
      </div>
      <span className="text-white font-semibold tracking-wide text-sm">Smile Dental</span>
    </div>
  )
}

// ── Alert ─────────────────────────────────────────────────────────────────────
function Alert({ type, msg }: { type: 'err' | 'ok'; msg: string }) {
  const isErr = type === 'err'
  return (
    <div className={`flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 mb-5 ${
      isErr
        ? 'bg-red-500/10 border border-red-500/20 text-red-300'
        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
    }`}>
      <span>{isErr ? '⚠' : '✓'}</span>{msg}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide uppercase">{label}</label>
      {children}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all"
    />
  )
}

// ── Submit button ─────────────────────────────────────────────────────────────
function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
    >
      {loading
        ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        : label
      }
    </button>
  )
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('')
    setLoading(true)
    try {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.message || 'User not found.'); return }
      setSuccess('OTP sent! Check your console (dev mode).')
      setTimeout(() => navigate('/verify-otp', { state: { identifier } }), 1200)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }

  return (
    <AuthShell>
      <AuthCard>
        <Brand />
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
          Forgot your <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">password?</span>
        </h1>
        <p className="text-white/40 text-sm mb-6">Enter your username or email and we'll send you a reset code.</p>

        {error   && <Alert type="err" msg={error} />}
        {success && <Alert type="ok"  msg={success} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username or Email">
            <TextInput
              type="text" value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="you@example.com" required autoComplete="username"
            />
          </Field>
          <SubmitBtn loading={loading} label="Send Reset Code" />
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          <Link to="/login" className="text-sky-400 hover:text-sky-300 transition-colors">← Back to login</Link>
        </p>
      </AuthCard>
    </AuthShell>
  )
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export function VerifyOtpPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp]               = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('')
    setLoading(true)
    try {
      const r = await fetch(`${API}/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, otp, purpose: 'password_reset' }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.message || 'Invalid OTP.'); return }
      setSuccess('OTP verified! Redirecting…')
      setTimeout(() => navigate('/reset-password', { state: { identifier, otp } }), 900)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }

  return (
    <AuthShell>
      <AuthCard>
        <Brand />
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
          Enter the <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">code.</span>
        </h1>
        <p className="text-white/40 text-sm mb-6">Paste the 6-digit OTP you received (or check the server console).</p>

        {error   && <Alert type="err" msg={error} />}
        {success && <Alert type="ok"  msg={success} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username or Email">
            <TextInput
              type="text" value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="same as before" required autoComplete="username"
            />
          </Field>
          <Field label="OTP Code">
            <input
              type="text" value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="1 2 3 4 5 6"
              maxLength={6} required
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all text-center tracking-[0.5em] text-lg font-mono"
            />
          </Field>
          <SubmitBtn loading={loading} label="Verify Code" />
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          <Link to="/forgot-password" className="text-sky-400 hover:text-sky-300 transition-colors">← Resend code</Link>
        </p>
      </AuthCard>
    </AuthShell>
  )
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp]               = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('')
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return }
    if (newPw.length < 8)   { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, otp, newPassword: newPw }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.message || 'Reset failed.'); return }
      setSuccess('Password reset! Taking you to login…')
      setTimeout(() => navigate('/login'), 1400)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }

  return (
    <AuthShell>
      <AuthCard>
        <Brand />
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
          New <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">password.</span>
        </h1>
        <p className="text-white/40 text-sm mb-6">Choose a strong password to secure your account.</p>

        {error   && <Alert type="err" msg={error} />}
        {success && <Alert type="ok"  msg={success} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username or Email">
            <TextInput type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="your identifier" required autoComplete="username" />
          </Field>

          <Field label="OTP Code">
            <input
              type="text" value={otp} onChange={e => setOtp(e.target.value)}
              placeholder="1 2 3 4 5 6" maxLength={6} required
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 transition-all text-center tracking-[0.5em] text-lg font-mono"
            />
          </Field>

          <Field label="New Password">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="min 8 characters" autoComplete="new-password" required
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all"
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </Field>

          <Field label="Confirm Password">
            <TextInput type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="repeat password" autoComplete="new-password" required />
          </Field>

          <SubmitBtn loading={loading} label="Reset Password" />
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          <Link to="/login" className="text-sky-400 hover:text-sky-300 transition-colors">← Back to login</Link>
        </p>
      </AuthCard>
    </AuthShell>
  )
}