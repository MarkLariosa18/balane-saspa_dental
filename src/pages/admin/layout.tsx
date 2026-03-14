import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'

const API_BASE = 'http://localhost:3000'

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    group: 'Main',
    items: [
      {
        label: 'Dashboard',
        to: '/admin/dashboard',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        ),
      },
      {
        label: 'Pending Requests',
        to: '/admin/pending',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Records',
    items: [
      {
        label: 'History',
        to: '/admin/history',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        ),
      },
      {
        label: 'Graph',
        to: '/admin/graph',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        ),
      },
      {
        label: 'Patients',
        to: '/admin/patients',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Config',
    items: [
      {
        label: 'Services',
        to: '/admin/services',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
          </svg>
        ),
      },
      {
        label: 'Account',
        to: '/admin/account',
        icon: (
          <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"/>
          </svg>
        ),
      },
    ],
  },
]

// ── useIsMobile ───────────────────────────────────────────────────────────────
function useIsMobile(bp = 1024) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

// ── Admin Layout ──────────────────────────────────────────────────────────────
export default function AdminLayout() {
  const navigate    = useNavigate()
  const isMobile    = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }) }
    finally { navigate('/login') }
  }

  // ── Sidebar content (shared between desktop + mobile drawer) ──
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/8">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 16px rgba(56,189,248,0.25)' }}>
          🦷
        </div>
        <div>
          <div className="text-white font-bold text-sm leading-none">Balane-Saspa</div>
          <div className="text-white/30 text-xs mt-0.5 uppercase tracking-widest">Admin</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {NAV_ITEMS.map(group => (
          <div key={group.group}>
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-3 py-1.5">{group.group}</p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => isMobile && setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'text-white border border-sky-500/30'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05] border border-transparent'
                    }`
                  }
                  style={({ isActive }) => isActive
                    ? { background: 'linear-gradient(135deg,rgba(56,189,248,0.12),rgba(99,102,241,0.12))' }
                    : {}
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/8">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 transition-all hover:bg-red-500/10 disabled:opacity-50"
          style={{ background: 'rgba(239,68,68,0.05)' }}
        >
          <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <aside className="relative z-10 w-56 shrink-0 border-r border-white/8 bg-black/20 backdrop-blur-xl flex flex-col">
          <SidebarContent />
        </aside>
      )}

      {/* ── Mobile drawer ── */}
      {isMobile && drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-56 bg-[#0d0d18] border-r border-white/8 flex flex-col">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/[0.06] border border-white/8 flex items-center justify-center text-white/40 hover:text-white transition-colors text-sm"
            >✕</button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 border-b border-white/8 bg-black/20 backdrop-blur-xl">
          <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Hamburger on mobile */}
              {isMobile && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                >
                  <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
                  </svg>
                </button>
              )}
              {/* Logo on mobile (sidebar hidden) */}
              {isMobile && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)' }}>🦷</div>
                  <span className="text-white font-bold text-sm">Admin</span>
                </div>
              )}
            </div>

            {/* Right side — date */}
            <p className="text-xs text-white/30 font-medium hidden sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}