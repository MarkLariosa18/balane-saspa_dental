/* eslint-disable @typescript-eslint/no-unused-expressions */
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import {
  useDialog, StatusBadge, PageHeader, Card, CardHeader,
  SearchInput, Select, Pagination, GradientBtn, Th,
} from './admin_shared';

const API_BASE = 'http://localhost:3000';

interface Patient { first_name?: string; middle_name?: string; last_name?: string; }
interface Appointment {
  id: number | string; appointment_date: string; status: string;
  patients?: Patient; services?: { name?: string };
}

function getPatientName(p?: Patient) {
  if (!p) return 'Unknown';
  return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Chart colour palette — vivid but subtle enough on dark bg
const PALETTE = ['#38bdf8','#818cf8','#34d399','#fbbf24','#f97316','#f472b6','#a78bfa','#06b6d4','#84cc16','#fb923c'];
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AppointmentGraphPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices]         = useState<{ name: string }[]>([]);
  const [years, setYears]               = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [hidden, setHidden]             = useState<Set<string>>(new Set());
  const [search, setSearch]             = useState('');
  const [statusF, setStatusF]           = useState('all');
  const [serviceF, setServiceF]         = useState('all');
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const { node: dialogNode, fire }      = useDialog();
  const navigate                        = useNavigate();
  const PER_PAGE = 10;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/appointments/all`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const apps = (data.appointments as Appointment[]).filter(a => !isNaN(new Date(a.appointment_date).getTime()));
        setAppointments(apps);
        const ys = [...new Set(apps.map(a => new Date(a.appointment_date).getFullYear()))].sort((a, b) => b - a);
        setYears(ys as number[]);
        if (ys.length) setSelectedYear(ys[0] as number);
      } catch (err: unknown) {
        await fire({ icon: 'error', title: 'Error', text: (err as Error).message });
        navigate('/admin/dashboard');
      }
      try {
        const r = await fetch(`${API_BASE}/api/services/all`, { credentials: 'include' });
        const d = await r.json();
        if (d.success) setServices(d.services);
      } catch { /* fallback */ }
      setLoading(false);
    })();
  }, []);

  const effectiveSvcs = services.length
    ? services
    : [...new Set(appointments.map(a => a.services?.name).filter(Boolean))].map(n => ({ name: n! }));

  const chartData = MONTHS.map((month, mi) => {
    const row: Record<string, string | number> = { month };
    effectiveSvcs.forEach(s => {
      row[s.name] = appointments.filter(a => {
        const d = new Date(a.appointment_date);
        return d.getFullYear() === selectedYear && d.getMonth() === mi && a.services?.name === s.name;
      }).length;
    });
    return row;
  });

  const totals  = MONTHS.map((_, mi) => effectiveSvcs.reduce((sum, s) => sum + (chartData[mi][s.name] as number), 0));
  const maxTot  = Math.max(...totals, 0);
  const highMon = MONTHS_FULL[totals.indexOf(maxTot)];

  const filtered = appointments.filter(a => {
    const s = search.toLowerCase();
    return (statusF === 'all' || a.status.toLowerCase() === statusF)
        && (serviceF === 'all' || a.services?.name === serviceF)
        && (getPatientName(a.patients).toLowerCase().includes(s)
            || (a.services?.name || '').toLowerCase().includes(s)
            || new Date(a.appointment_date).toLocaleDateString().toLowerCase().includes(s));
  }).sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime());

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const tableRows  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function exportCsv(data: Appointment[], name: string) {
    const lines = [['ID','Patient','Service','Date','Status'].join(',')];
    data.forEach(a => lines.push([a.id, `"${getPatientName(a.patients)}"`, `"${a.services?.name || 'N/A'}"`, new Date(a.appointment_date).toISOString().split('T')[0], cap(a.status)].join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = name; link.click();
  }

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
      {dialogNode}
      <div className="space-y-6">
        <PageHeader section="Analytics" title="Appointments Graph" />

        {/* Chart card */}
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-bold text-white">Appointments by Service</h3>
              <p className="text-xs text-white/30 mt-0.5">Monthly breakdown per year</p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Select value={selectedYear} onChange={v => setSelectedYear(+v)}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
              <GradientBtn onClick={() => exportCsv(
                appointments.filter(a => new Date(a.appointment_date).getFullYear() === selectedYear),
                `appointments_graph_${selectedYear}.csv`
              )}>Export CSV</GradientBtn>
            </div>
          </CardHeader>

          <div className="p-5">
            {/* Legend */}
            <div className="flex flex-wrap gap-2 mb-5">
              {effectiveSvcs.map((s, i) => {
                const isHidden = hidden.has(s.name);
                return (
                  <button key={s.name}
                    onClick={() => setHidden(prev => { const n = new Set(prev); n.has(s.name) ? n.delete(s.name) : n.add(s.name); return n; })}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${isHidden ? 'opacity-40 border-white/8 text-white/30' : 'border-white/10 text-white/70 hover:border-white/20'}`}
                    style={{ background: isHidden ? 'transparent' : 'rgba(255,255,255,0.04)' }}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                    {s.name}
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)', fontWeight: 600 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#0d0d15', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: '0.8rem' }}
                  labelStyle={{ color: '#fff', fontWeight: 700 }}
                  itemStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                {effectiveSvcs.filter(s => !hidden.has(s.name)).map((s, i) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={2} dot={{ r: 3, fill: PALETTE[i % PALETTE.length] }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>

            {maxTot > 0 && (
              <div className="mt-5 flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)' }}>★</div>
                <p className="text-sm text-white/70">
                  Peak month: <span className="font-bold text-sky-400">{highMon}</span>
                  <span className="text-white/40 ml-1">({maxTot} appointments)</span>
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Table card */}
        <Card>
          <div className="px-5 py-4 border-b border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">All Appointments</h3>
                <p className="text-xs text-white/30 mt-0.5">{filtered.length} total records</p>
              </div>
              <GradientBtn onClick={() => exportCsv(filtered, `appointments_table_${new Date().toISOString().split('T')[0]}.csv`)}>
                Export Table
              </GradientBtn>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <Select value={statusF} onChange={v => { setStatusF(v); setPage(1); }}>
                {['all','confirmed','pending','cancelled','rejected'].map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All Statuses' : cap(s)}</option>
                ))}
              </Select>
              <Select value={serviceF} onChange={v => { setServiceF(v); setPage(1); }}>
                <option value="all">All Services</option>
                {effectiveSvcs.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </Select>
              <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} width="flex-1 min-w-[180px]" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['#','Patient','Service','Date','Status'].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-16 text-sm text-white/25">No appointments found</td></tr>
                ) : tableRows.map((a, idx) => {
                  const id    = String(a.id || idx + 1);
                  const short = id.length > 4 ? id.slice(0, 4) : id.padEnd(4, '0');
                  return (
                    <tr key={String(a.id)} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-sky-400 px-2 py-1 rounded-lg"
                          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}>
                          #{short}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)' }}>
                            {getPatientName(a.patients).charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-white/80">{getPatientName(a.patients)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/50">{a.services?.name || 'N/A'}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 whitespace-nowrap">{new Date(a.appointment_date).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={a.status} /></td>
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