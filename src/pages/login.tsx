/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API = 'http://localhost:3000'

export default function LoginPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [remember, setRemember]     = useState(false)
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, remember }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.message || 'Invalid credentials.'); return }
      setSuccess('Signed in — redirecting…')
      setTimeout(() => {
       navigate(d.role === 'admin' ? '/admin/dashboard' : '/profile')
      }, 900)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute -bottom-40 left-1/3 w-72 h-72 bg-cyan-500/8 rounded-full blur-[100px] animate-pulse delay-2000" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">

          {/* Brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-lg shadow-lg shadow-sky-500/25">
              🦷
            </div>
            <span className="text-white font-semibold tracking-wide text-sm">Smile Dental</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
            Welcome <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">back.</span>
          </h1>
          <p className="text-white/40 text-sm mb-6">Sign in to your patient portal to continue.</p>

          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
              <span className="text-base">⚠</span>{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm rounded-xl px-4 py-3 mb-5">
              <span className="text-base">✓</span>{success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide uppercase">Username or Email</label>
              <input
                type="text" value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username" required
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>

            <div>
              <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide uppercase">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password" required
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-base p-1"
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox" checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border transition-all ${remember ? 'bg-sky-500 border-sky-500' : 'bg-white/5 border-white/20 group-hover:border-white/40'}`}>
                    {remember && <svg className="w-3 h-3 text-white mx-auto mt-0.5" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </div>
                <span className="text-white/40 text-xs">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sky-400 text-xs hover:text-sky-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 mt-2 flex items-center justify-center gap-2"
            >
              {loading
                ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : 'Sign In'
              }
            </button>
          </form>

          <p className="text-center text-white/30 text-xs mt-6">
            New patient?{' '}
            <Link to="/signup" className="text-sky-400 hover:text-sky-300 transition-colors font-medium">
              Create an account →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}