/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react';
import {
  useDialog, StatusBadge, PageHeader, Card, CardHeader,
  SearchInput, Select, Pagination, GradientBtn, Th,
} from './admin_shared';

const API_BASE = 'http://localhost:3000';

interface Patient {
  id?: number; first_name?: string; last_name?: string; middle_name?: string;
  home_address?: string; sex?: string; birthdate?: string; mobile_no?: string; email?: string;
}
interface Appointment {
  id: number | string; appointment_date: string; status: string;
  user_id?: number; patients?: Patient; services?: { name?: string };
}
interface Row {
  name: string; address: string; sex: string; age: number | string;
  contact: string; email: string; appointment_date: string;
  user_id?: number; service: string; status: string;
}

function calcAge(birthdate?: string) {
  if (!birthdate) return 'N/A';
  const age = Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000));
  return age >= 0 ? age : 'N/A';
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
type SortDir = 'asc' | 'desc';
type SortCol = keyof Row | null;

export default function HistoryPage() {
  const [rows, setRows]         = useState<Row[]>([]);
  const [allSvcs, setAllSvcs]   = useState<string[]>([]);
  const [statusF, setStatusF]   = useState('all');
  const [serviceF, setServiceF] = useState('all');
  const [search, setSearch]     = useState('');
  const [sortCol, setSortCol]   = useState<SortCol>(null);
  const [sortDir, setSortDir]   = useState<SortDir>('asc');
  const [showAll, setShowAll]   = useState(false);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const { node: dialogNode, fire } = useDialog();
  const PER_PAGE = 10;

  useEffect(() => {
    (async () => {
      try {
        const [pRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/patients/allPatients`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/appointments/all`, { credentials: 'include' }),
        ]);
        const patients: Patient[] = pRes.ok ? await pRes.json() : [];
        const aData = aRes.ok ? await aRes.json() : { appointments: [] };
        const appointments: Appointment[] = aData.appointments || [];
        const patMap = new Map(patients.map(p => [p.id, p]));
        const merged: Row[] = appointments.map(a => {
          const pat = patMap.get(a.user_id) ?? a.patients;
          return {
            name: `${pat?.first_name || 'N/A'} ${pat?.last_name || ''}`.trim(),
            address: pat?.home_address || 'N/A', sex: pat?.sex || 'N/A',
            age: calcAge(pat?.birthdate), contact: pat?.mobile_no || 'N/A',
            email: pat?.email || 'N/A', appointment_date: a.appointment_date || 'N/A',
            user_id: a.user_id, service: a.services?.name || 'N/A', status: a.status || 'pending',
          };
        });
        setRows(merged);
        setAllSvcs([...new Set(merged.map(r => r.service).filter(s => s !== 'N/A'))]);
      } catch (err: unknown) { await fire({ icon: 'error', title: 'Error', text: (err as Error).message }); }
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter(r => {
    const s = search.toLowerCase();
    return (statusF === 'all' || r.status.toLowerCase() === statusF)
        && (serviceF === 'all' || r.service === serviceF)
        && (r.name.toLowerCase().includes(s) || r.address.toLowerCase().includes(s)
            || r.service.toLowerCase().includes(s) || fmtDate(r.appointment_date).toLowerCase().includes(s));
  });

  const sorted = sortCol ? [...filtered].sort((a, b) => {
    let va: number | string = a[sortCol as keyof Row] as string | number;
    let vb: number | string = b[sortCol as keyof Row] as string | number;
    if (sortCol === 'age') { va = va === 'N/A' ? -1 : Number(va); vb = vb === 'N/A' ? -1 : Number(vb); }
    if (sortCol === 'appointment_date') { va = new Date(String(va)).getTime(); vb = new Date(String(vb)).getTime(); }
    if (typeof va === 'string' && typeof vb === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
  }) : filtered;

  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const visible    = showAll ? sorted : sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function exportCsv() {
    const hdrs = ['Name','Address','Sex','Age','Contact No.','Email','Appointment Date','Service','Status'];
    const lines = [hdrs.join(',')];
    sorted.forEach(r => lines.push([`"${r.name}"`,`"${r.address}"`,r.sex,r.age,`"${r.contact}"`,`"${r.email}"`,`"${fmtDate(r.appointment_date)}"`,`"${r.service}"`,cap(r.status)].join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = `appointment_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  const COLS: { key: SortCol; label: string }[] = [
    { key: 'name', label: 'Name' }, { key: 'address', label: 'Address' }, { key: 'sex', label: 'Sex' },
    { key: 'age', label: 'Age' }, { key: 'contact', label: 'Contact' }, { key: 'email', label: 'Email' },
    { key: 'appointment_date', label: 'Date' }, { key: 'service', label: 'Service' }, { key: 'status', label: 'Status' },
  ];

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
        <PageHeader section="Records" title="Appointment History" />

        <Card>
          {/* Filters */}
          <div className="px-5 py-4 border-b border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">All Records</h3>
                <p className="text-xs text-white/30 mt-0.5">{sorted.length} matching records</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowAll(s => !s); setPage(1); }}
                  className="px-3 py-2 rounded-xl border border-white/10 text-xs font-semibold text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
                  {showAll ? 'Show Paginated' : 'Show All'}
                </button>
                <GradientBtn onClick={exportCsv}>Export CSV</GradientBtn>
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <Select value={statusF} onChange={v => { setStatusF(v); setPage(1); }}>
                {['all','confirmed','pending','cancelled','rejected','expired'].map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All Statuses' : cap(s)}</option>
                ))}
              </Select>
              <Select value={serviceF} onChange={v => { setServiceF(v); setPage(1); }}>
                <option value="all">All Services</option>
                {allSvcs.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }}
                placeholder="Search by patient, service, or date…" width="flex-1 min-w-[200px]" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {COLS.map(({ key, label }) => (
                    <Th key={String(key)} onClick={() => handleSort(key)} sorted={sortCol === key} dir={sortDir}>{label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-16 text-sm text-white/25">No matching records found</td></tr>
                ) : visible.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-white/80 whitespace-nowrap">{r.name}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50 max-w-[160px] truncate">{r.address}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{r.sex}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{r.age}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50 whitespace-nowrap">{r.contact}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50 max-w-[160px] truncate">{r.email}</td>
                    <td className="px-5 py-3.5 text-xs text-white/50 whitespace-nowrap">{fmtDate(r.appointment_date)}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{r.service}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!showAll && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </Card>
      </div>
    </>
  );
}