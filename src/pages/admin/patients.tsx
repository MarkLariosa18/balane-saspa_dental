import { useState, useEffect } from 'react';
import {
  Toasts, useToasts, PageHeader, Card, CardHeader,
  SearchInput, Pagination, GradientBtn, Th,
} from './admin_shared';

const API_BASE = 'http://localhost:3000';

interface Patient {
  first_name: string; last_name: string; home_address: string;
  sex: string; age: number | string; mobile_no: string; email?: string;
  middle_name?: string; birthdate?: string; nickname?: string; religion?: string;
  nationality?: string; home_no?: string; occupation?: string; office_no?: string;
  dental_insurance?: string; fax_no?: string; effective_date?: string;
}

type SortCol = keyof Pick<Patient, 'first_name' | 'home_address' | 'sex' | 'age' | 'mobile_no' | 'email'> | null;
type SortDir = 'asc' | 'desc';

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch]     = useState('');
  const [sortCol, setSortCol]   = useState<SortCol>(null);
  const [sortDir, setSortDir]   = useState<SortDir>('asc');
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const { toasts, addToast }    = useToasts();
  const PER_PAGE = 10;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/patients/allPatients`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch patients');
        setPatients(await res.json());
      } catch (err: unknown) { addToast((err as Error).message, 'error'); }
      setLoading(false);
    })();
  }, []);

  const filtered = patients.filter(p => {
    const s = search.toLowerCase();
    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(s)
      || p.home_address.toLowerCase().includes(s)
      || p.sex.toLowerCase().includes(s)
      || String(p.age).includes(s)
      || p.mobile_no.includes(s)
      || (p.email || '').toLowerCase().includes(s);
  });

  const sorted = sortCol ? [...filtered].sort((a, b) => {
    const va = sortCol === 'first_name' ? `${a.first_name} ${a.last_name}` : String(a[sortCol] ?? '');
    const vb = sortCol === 'first_name' ? `${b.first_name} ${b.last_name}` : String(b[sortCol] ?? '');
    if (sortCol === 'age') return sortDir === 'asc' ? Number(a.age) - Number(b.age) : Number(b.age) - Number(a.age);
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  }) : filtered;

  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const rows = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function exportCsv() {
    const hdrs = ['First Name','Last Name','Middle Name','Birthdate','Sex','Age','Nickname','Religion','Nationality','Home Address','Home No.','Occupation','Office No.','Dental Insurance','Fax No.','Mobile No.','Email','Effective Date'];
    const lines = [hdrs.join(',')];
    patients.forEach(p => lines.push([
      `"${p.first_name||''}"`,`"${p.last_name||''}"`,`"${p.middle_name||''}"`,`"${p.birthdate||''}"`,
      p.sex||'',p.age||0,`"${p.nickname||''}"`,`"${p.religion||''}"`,`"${p.nationality||''}"`,
      `"${p.home_address||''}"`,`"${p.home_no||''}"`,`"${p.occupation||''}"`,`"${p.office_no||''}"`,
      `"${p.dental_insurance||''}"`,`"${p.fax_no||''}"`,`"${p.mobile_no||''}"`,`"${p.email||''}"`,`"${p.effective_date||''}"`
    ].join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = `patients_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    addToast('Patient data exported successfully.', 'success');
  }

  const COLS: { key: SortCol; label: string }[] = [
    { key: 'first_name', label: 'Name' }, { key: 'home_address', label: 'Address' },
    { key: 'sex', label: 'Sex' }, { key: 'age', label: 'Age' },
    { key: 'mobile_no', label: 'Contact No.' }, { key: 'email', label: 'Email' },
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
      <Toasts toasts={toasts} />
      <div className="space-y-6">
        <PageHeader section="Directory" title="Patients" />

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Patients', value: patients.length, gradFrom: '#38bdf8', gradTo: '#6366f1', glow: 'rgba(56,189,248,0.15)' },
            { label: 'Male',           value: patients.filter(p => p.sex?.toLowerCase() === 'male').length,   gradFrom: '#818cf8', gradTo: '#6366f1', glow: 'rgba(99,102,241,0.15)' },
            { label: 'Female',         value: patients.filter(p => p.sex?.toLowerCase() === 'female').length, gradFrom: '#f472b6', gradTo: '#db2777', glow: 'rgba(244,114,182,0.15)' },
            { label: 'Avg. Age',       value: patients.length ? Math.round(patients.reduce((s, p) => s + Number(p.age || 0), 0) / patients.length) : 0, gradFrom: '#34d399', gradTo: '#059669', glow: 'rgba(52,211,153,0.15)' },
          ].map(stat => (
            <div key={stat.label} className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] p-4 hover:bg-white/[0.06] transition-all">
              <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                style={{ background: `radial-gradient(ellipse at top right, ${stat.glow}, transparent 70%)` }} />
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className="text-3xl font-black text-white tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-bold text-white">Patient Records</h3>
              <p className="text-xs text-white/30 mt-0.5">{sorted.length} patients found</p>
            </div>
            <div className="flex items-center gap-2.5">
              <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search patients…" />
              <GradientBtn onClick={exportCsv}>Export CSV</GradientBtn>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {COLS.map(({ key, label }) => (
                    <Th key={String(key)} onClick={() => handleSort(key)} sorted={sortCol === key} dir={sortDir}>{label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-16 text-sm text-white/25">No patients match the selected filters</td></tr>
                ) : rows.map((p, i) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#38bdf8,#6366f1)', boxShadow: '0 2px 8px rgba(56,189,248,0.2)' }}>
                          {p.first_name?.charAt(0) || '?'}
                        </div>
                        <span className="text-sm font-semibold text-white/80">{p.first_name} {p.last_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/50 max-w-[180px] truncate">{p.home_address}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{p.sex}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{p.age}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{p.mobile_no}</td>
                    <td className="px-5 py-3.5 text-sm text-white/50">{p.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </Card>
      </div>
    </>
  );
}