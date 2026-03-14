/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API = 'http://localhost:3000'

function pwStrength(pw: string) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

function Field({ label, required: req, optional, children }: {
  label: string; required?: boolean; optional?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide uppercase">
        {label}
        {req     && <span className="text-sky-400 ml-1">*</span>}
        {optional && <span className="text-white/25 ml-1 normal-case font-normal">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all"
const selectCls = "w-full bg-[#111118] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500/50 transition-all appearance-none cursor-pointer"

export default function SignupPage() {
  const navigate = useNavigate()

  const [step, setStep]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw]     = useState(false)

  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [middleName, setMiddleName] = useState('')
  const [mobile, setMobile]         = useState('')
  const [birthdate, setBirthdate]   = useState('')
  const [sex, setSex]               = useState('')
  const [address, setAddress]       = useState('')
  const [nickname, setNickname]     = useState('')
  const [religion, setReligion]     = useState('')
  const [nationality, setNationality] = useState('')
  const [occupation, setOccupation] = useState('')

  const [otpSent, setOtpSent]   = useState(false)
  const [otp, setOtp]           = useState('')

  const clear = () => { setError(''); setSuccess('') }

  const strength = pwStrength(password)
  const strengthLabel = ['', 'Weak', 'Fair', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-400', 'bg-emerald-400'][strength]

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault(); clear()
    if (password !== confirmPw) { setError('Passwords do not match.'); return }
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const r = await fetch(`${API}/patients/check-username?username=${encodeURIComponent(username)}`)
      const d = await r.json()
      if (d.exists) { setError('Username is already taken. Please choose another.'); return }
      setStep(2)
    } catch { setError('Could not verify username. Please try again.') }
    finally { setLoading(false) }
  }

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault(); clear()
    if (!firstName.trim()) { setError('First name is required.'); return }
    if (!lastName.trim())  { setError('Last name is required.'); return }
    if (!birthdate)        { setError('Date of birth is required.'); return }
    if (!sex)              { setError('Sex is required.'); return }
    if (!mobile.trim())    { setError('Mobile number is required.'); return }
    if (!address.trim())   { setError('Home address is required.'); return }
    setStep(3)
  }

  const handleSendOtp = async () => {
    clear(); setLoading(true)
    try {
      const r = await fetch(`${API}/api/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.message || 'Failed to send OTP'); return }
      setOtpSent(true)
      setSuccess('OTP sent to ' + email)
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); clear()
    if (!otpSent)         { setError('Please send and verify the OTP first.'); return }
    if (otp.length !== 6) { setError('Enter the 6-digit OTP.'); return }
    setLoading(true)
    try {
      const verifyRes = await fetch(`${API}/api/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, purpose: 'signup' }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) { setError(verifyData.message || 'Invalid or expired OTP.'); return }

      const registerRes = await fetch(`${API}/patients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username, password,
          first_name: firstName.trim(), last_name: lastName.trim(),
          middle_name: middleName.trim() || undefined,
          birthdate, sex, mobile_no: mobile.trim(),
          home_address: address.trim(), email,
          nickname:    nickname.trim()    || undefined,
          religion:    religion.trim()    || undefined,
          nationality: nationality.trim() || undefined,
          occupation:  occupation.trim()  || undefined,
        }),
      })
      const registerData = await registerRes.json()
      if (!registerRes.ok) { setError(registerData.message || 'Registration failed.'); return }
      setSuccess('Account created! Redirecting to login…')
      setTimeout(() => navigate('/login'), 1400)
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute -bottom-40 left-1/3 w-72 h-72 bg-cyan-500/8 rounded-full blur-[100px] animate-pulse delay-2000" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }}
        />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">

          {/* Brand */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-lg shadow-lg shadow-sky-500/25">
              🦷
            </div>
            <span className="text-white font-semibold tracking-wide text-sm">Smile Dental</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > i
                    ? 'bg-emerald-500 text-white'
                    : step === i
                    ? 'bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-sky-500/25'
                    : 'bg-white/10 text-white/30'
                }`}>
                  {step > i ? '✓' : i}
                </div>
                {i < 3 && <div className={`h-px w-8 transition-all ${step > i ? 'bg-emerald-500/50' : 'bg-white/10'}`} />}
              </div>
            ))}
            <span className="ml-2 text-white/30 text-xs">Step {step} of 3</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
            {step === 1
              ? <>Create an <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">account.</span></>
              : step === 2
              ? <>Your <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">details.</span></>
              : <>Verify <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent italic">email.</span></>
            }
          </h1>
          <p className="text-white/40 text-sm mb-6">
            {step === 1 ? 'Step 1 of 3 — Choose your login credentials.'
             : step === 2 ? 'Step 2 of 3 — Fill in your patient information.'
             : 'Step 3 of 3 — Confirm your email to finish.'}
          </p>

          {error   && <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl px-4 py-3 mb-5"><span>⚠</span>{error}</div>}
          {success && <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm rounded-xl px-4 py-3 mb-5"><span>✓</span>{success}</div>}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <Field label="Email" required><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required className={inputCls} /></Field>
              <Field label="Username" required><input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="min 3 characters" autoComplete="username" minLength={3} maxLength={50} required className={inputCls} /></Field>

              <Field label="Password" required>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="min 8 characters" autoComplete="new-password" required className={`${inputCls} pr-12`} />
                  <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1">{showPw ? '🙈' : '👁'}</button>
                </div>
                {password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[0,1,2].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < strength ? strengthColor : 'bg-white/10'}`} />
                      ))}
                    </div>
                    <span className={`text-xs font-medium ${['','text-red-400','text-yellow-400','text-emerald-400'][strength]}`}>{strengthLabel}</span>
                  </div>
                )}
              </Field>

              <Field label="Confirm Password" required><input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="repeat password" autoComplete="new-password" required className={inputCls} /></Field>

              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2">
                {loading ? <Spinner /> : 'Continue →'}
              </button>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" required><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" required className={inputCls} /></Field>
                <Field label="Last Name" required><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" required className={inputCls} /></Field>
              </div>
              <Field label="Middle Name" optional><input type="text" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="e.g. Santos" className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of Birth" required><input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} required className={inputCls} /></Field>
                <Field label="Sex" required>
                  <div className="relative">
                    <select value={sex} onChange={e => setSex(e.target.value)} required className={selectCls}>
                      <option value="">Select…</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">▾</div>
                  </div>
                </Field>
              </div>
              <Field label="Mobile Number" required><input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+63 9XX XXX XXXX" required className={inputCls} /></Field>
              <Field label="Home Address" required><input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City, Province" required className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nickname" optional><input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. Jay" className={inputCls} /></Field>
                <Field label="Occupation" optional><input type="text" value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="e.g. Engineer" className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Religion" optional><input type="text" value={religion} onChange={e => setReligion(e.target.value)} placeholder="e.g. Catholic" className={inputCls} /></Field>
                <Field label="Nationality" optional><input type="text" value={nationality} onChange={e => setNationality(e.target.value)} placeholder="e.g. Filipino" className={inputCls} /></Field>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { clear(); setStep(1) }} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-medium py-3 rounded-xl text-sm transition-all">← Back</button>
                <button type="submit" className="flex-2 flex-[2] bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20">Continue →</button>
              </div>
            </form>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <div className="flex gap-2">
                  <input type="email" value={email} readOnly className={`${inputCls} opacity-60 cursor-not-allowed flex-1`} />
                  <button
                    type="button" onClick={handleSendOtp}
                    disabled={loading || otpSent}
                    className={`px-4 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                      otpSent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed'
                        : 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white shadow-lg shadow-sky-500/20'
                    }`}
                  >
                    {otpSent ? '✓ Sent' : loading ? <Spinner /> : 'Send OTP'}
                  </button>
                </div>
              </Field>

              {otpSent && (
                <Field label="6-Digit OTP">
                  <input
                    type="text" value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="1 2 3 4 5 6" maxLength={6} required
                    className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-lg font-mono focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all text-center tracking-[0.5em]"
                  />
                </Field>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { clear(); setStep(2) }} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-medium py-3 rounded-xl text-sm transition-all">← Back</button>
                <button
                  type="submit"
                  disabled={loading || !otpSent || otp.length < 6}
                  className="flex-[2] bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? <Spinner /> : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-white/30 text-xs mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-400 hover:text-sky-300 transition-colors font-medium">Sign in →</Link>
          </p>
        </div>
      </div>
    </div>
  )
}