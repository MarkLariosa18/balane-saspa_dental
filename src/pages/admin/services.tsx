/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react';
import {
  Toasts, useToasts, ConfirmDialog, PageHeader,
  Card, CardHeader, GradientBtn, DarkInput, DarkTextarea,
} from './admin_shared';

const API_BASE = 'http://localhost:3000';

interface Service { id: number | string; name: string; description?: string; }

export default function ServicesPage() {
  const [services, setServices]       = useState<Service[]>([]);
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [deleteId, setDeleteId]       = useState<number | string | null>(null);
  const [loading, setLoading]         = useState(true);
  const { toasts, addToast }          = useToasts();

  async function fetchServices() {
    const res  = await fetch(`${API_BASE}/api/services/all`, { credentials: 'include' });
    const data = await res.json();
    if (data.success) setServices(data.services);
  }

  useEffect(() => {
    fetchServices().catch(err => addToast((err as Error).message, 'error')).finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) { addToast('Please fill all fields correctly.', 'warning'); return; }
    setSubmitting(true);
    try {
      const res  = await fetch(`${API_BASE}/api/services`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add service');
      addToast(data.message || 'Service added successfully!', 'success');
      setName(''); setDescription('');
      await fetchServices();
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
    setSubmitting(false);
  }

  async function handleDelete(id: number | string) {
    try {
      const res  = await fetch(`${API_BASE}/api/services/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete service');
      setServices(s => s.filter(x => x.id !== id));
      addToast(data.message || 'Service deleted.', 'success');
    } catch (err: unknown) { addToast((err as Error).message, 'error'); }
    setDeleteId(null);
  }

  return (
    <>
      <Toasts toasts={toasts} />
      {deleteId !== null && (
        <ConfirmDialog
          opts={{ title: 'Delete Service', text: 'Are you sure? This action cannot be undone.', confirmText: 'Delete', danger: true }}
          onConfirm={() => handleDelete(deleteId!)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader section="Configuration" title="Manage Services" />

        {/* Add form */}
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-bold text-white">Add New Service</h3>
              <p className="text-xs text-white/30 mt-0.5">Create a new dental service offering</p>
            </div>
          </CardHeader>
          <form onSubmit={handleAdd} className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Service Name</label>
                <DarkInput value={name} onChange={setName} placeholder="e.g., Teeth Cleaning" />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Description</label>
                <DarkTextarea value={description} onChange={setDescription} rows={3} placeholder="Brief description of the service…" />
              </div>
            </div>
            <div className="flex justify-center">
              <button type="submit" disabled={submitting}
                className="px-10 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 4px 14px rgba(56,189,248,0.2)' }}>
                {submitting ? 'Adding…' : 'Add Service'}
              </button>
            </div>
          </form>
        </Card>

        {/* Services list */}
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-bold text-white">All Services</h3>
              <p className="text-xs text-white/30 mt-0.5">{services.length} service{services.length !== 1 ? 's' : ''} available</p>
            </div>
          </CardHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/30">
              <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Service','Description','Action'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-white/25 uppercase tracking-widest"
                        style={{ background: 'rgba(255,255,255,0.02)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-16 text-sm text-white/25">No services found</td></tr>
                  ) : services.map(svc => (
                    <tr key={String(svc.id)} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 2px 8px rgba(56,189,248,0.2)' }}>
                            {svc.name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-white/80">{svc.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/50 max-w-[360px]">{svc.description || '—'}</td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => setDeleteId(svc.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                          style={{ background: 'rgba(239,68,68,0.05)' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}