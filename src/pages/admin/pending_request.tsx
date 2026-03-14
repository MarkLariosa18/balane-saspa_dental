/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react';
import {
  Toasts, useToasts, StatusBadge, ConfirmDialog, PageHeader,
  Card, CardHeader, SearchInput, Pagination, GradientBtn, Th,
  DarkTextarea,
} from './admin_shared';

const API_BASE = 'http://localhost:3000';

interface Patient { first_name?: string; last_name?: string; }
interface AppointmentRef {
  appointment_date?: string; services?: { name?: string };
  notes?: string; cancel_reason?: string; status?: string;
}
interface Request {
  id: number | string; action: string; patients?: Patient;
  appointments?: AppointmentRef; new_appointment_date?: string;
  new_notes?: string; new_cancel_reason?: string;
}

function getPatientName(p?: Patient) {
  return `${p?.first_name || 'Unknown'} ${p?.last_name || ''}`.trim();
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Action badge ──────────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    cancel:     'bg-red-500/15 text-red-400 border-red-500/25',
    reschedule: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  };
  const cls = styles[action.toLowerCase()] || 'bg-sky-500/15 text-sky-400 border-sky-500/25';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border ${cls}`}>
      {cap(action)}
    </span>
  );
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ onSubmit, onClose }: { onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="rounded-2xl w-full max-w-md p-6 shadow-2xl"
        style={{ background: '#0d0d15', border: '1px solid rgba(248,113,113,0.2)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h5 className="text-sm font-bold text-white">Reject Request</h5>
            <p className="text-xs text-white/30 mt-0.5">Provide a reason for rejection</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] text-lg transition-colors">×</button>
        </div>
        <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Reason for Rejection</label>
        <DarkTextarea value={reason} onChange={setReason} rows={3} placeholder="e.g., Schedule conflict, Patient request, etc." />
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl border border-white/10 text-white/50 text-sm font-medium hover:bg-white/[0.06] transition-colors">
            Cancel
          </button>
          <button onClick={() => { if (reason.trim()) onSubmit(reason.trim()); }}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#ef4444', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PendingRequestsPage() {
  const [requests, setRequests]     = useState<Request[]>([]);
  const [loading, setLoading]       = useState(true);
  const [rejectIdx, setRejectIdx]   = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const { toasts, addToast }        = useToasts();
  const PER_PAGE = 10;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/appointments/requests`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch requests');
        const data = await res.json();
        setRequests((data.requests || []).filter((r: Request) => r.appointments?.status?.toLowerCase() !== 'expired'));
      } catch (err: unknown) { addToast((err as Error).message, 'error'); }
      setLoading(false);
    })();
  }, []);

  async function approve(idx: number) {
    const req = requests[idx];
    try {
      const res = await fetch(`${API_BASE}/api/appointments/requests/${req.id}/approve`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Approval failed');
      setRequests(rs => rs.filter((_, i) => i !== idx));
      addToast(`${cap(req.action)} request approved.`, 'success');
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
    setConfirmIdx(null);
  }

  async function reject(idx: number, reason: string) {
    const req = requests[idx];
    try {
      const res = await fetch(`${API_BASE}/api/appointments/requests/${req.id}/reject`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: reason }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      setRequests(rs => rs.filter((_, i) => i !== idx));
      addToast(`${cap(req.action)} request rejected.`, 'info');
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
    setRejectIdx(null);
  }

  const filtered = requests.filter(r => {
    const s = search.toLowerCase();
    return getPatientName(r.patients).toLowerCase().includes(s) || (r.action || '').toLowerCase().includes(s);
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-white/30">
      <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  );

  return (
    <>
      <Toasts toasts={toasts} />
      {confirmIdx !== null && (
        <ConfirmDialog
          opts={{ title: 'Approve Request', text: `Approve this ${requests[confirmIdx]?.action} request?`, confirmText: 'Approve' }}
          onConfirm={() => approve(confirmIdx!)}
          onCancel={() => setConfirmIdx(null)}
        />
      )}
      {rejectIdx !== null && (
        <RejectModal onSubmit={reason => reject(rejectIdx!, reason)} onClose={() => setRejectIdx(null)} />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <PageHeader section="Management" title="Pending Requests" />
          {requests.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-xs font-bold text-yellow-400">{requests.length} pending</span>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-bold text-white">Appointment Requests</h3>
              <p className="text-xs text-white/30 mt-0.5">{filtered.length} requests</p>
            </div>
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search by patient or action…" width="w-60" />
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Patient','Action','Current Date','New Date','Service','Notes','Reason','Actions'].map(h => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-16 text-sm text-white/25">No pending requests found.</td></tr>
                ) : rows.map((req, ri) => {
                  const realIdx = requests.indexOf(filtered[(page - 1) * PER_PAGE + ri]);
                  const curDate = req.appointments?.appointment_date ? new Date(req.appointments.appointment_date).toLocaleString() : 'N/A';
                  const newDate = req.new_appointment_date ? new Date(req.new_appointment_date).toLocaleString() : '—';
                  const reason  = req.action === 'cancel' ? req.appointments?.cancel_reason
                    : req.action === 'reschedule' ? (req.new_cancel_reason || req.appointments?.cancel_reason)
                    : req.appointments?.notes || '—';
                  return (
                    <tr key={String(req.id)} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)' }}>
                            {getPatientName(req.patients).charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-white/80 whitespace-nowrap">{getPatientName(req.patients)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><ActionBadge action={req.action || 'N/A'} /></td>
                      <td className="px-5 py-3.5 text-xs text-white/50 whitespace-nowrap">{curDate}</td>
                      <td className="px-5 py-3.5 text-xs text-white/50 whitespace-nowrap">{newDate}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50">{req.appointments?.services?.name || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 max-w-[140px] truncate">{req.new_notes || req.appointments?.notes || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 max-w-[140px] truncate">{reason || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <GradientBtn onClick={() => setConfirmIdx(realIdx)}>Approve</GradientBtn>
                          <button onClick={() => setRejectIdx(realIdx)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                            style={{ background: 'rgba(239,68,68,0.05)' }}>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </Card>
      </div>
    </>
  );
}