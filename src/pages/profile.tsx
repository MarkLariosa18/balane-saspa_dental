/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

const API = "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientProfile {
  patient_id: number; username: string;
  first_name: string; last_name: string; middle_name?: string;
  birthdate: string; sex: string; nickname?: string;
  religion?: string; nationality?: string;
  home_address: string; home_no?: string; mobile_no: string;
  email: string; occupation?: string; office_no?: string;
  fax_no?: string; dental_insurance?: string;
}
interface Appointment {
  id: number; appointment_date: string;
  services?: { name: string }; service_name?: string;
  status: string; notes?: string;
  cancel_reason?: string; reject_reason?: string;
}
interface Service { id: number; name: string; description: string; }
type TabKey = "appointments" | "services" | "overview" | "history" | "edit" | "password";

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────
function PrfAlert({ type, msg, onClose }: { type: "ok" | "err"; msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [msg]);
  const isErr = type === "err";
  return (
    <div className={`flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 mb-4 ${isErr ? "bg-red-500/10 border border-red-500/20 text-red-300" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"}`}>
      <span>{isErr ? "⚠" : "✓"}</span>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors ml-auto">✕</button>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    confirmed: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/25",
    rejected:  "bg-red-500/15 text-red-400 border-red-500/25",
    expired:   "bg-white/10 text-white/40 border-white/15",
    "no-show": "bg-orange-500/15 text-orange-400 border-orange-500/25",
  };
  const key = status.toLowerCase().replace(" ", "-");
  const cls = map[key] || "bg-white/10 text-white/40 border-white/15";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-4 opacity-40">{icon}</div>
      <p className="text-white/60 font-medium mb-1">{title}</p>
      <p className="text-white/25 text-sm">{sub}</p>
    </div>
  );
}

// ─── Field components ─────────────────────────────────────────────────────────
const inputCls = "w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.08] transition-all";
const inputReadonlyCls = "w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2.5 text-white/40 text-sm cursor-not-allowed";

function FieldInput({ label, value, onChange, type = "text", readonly }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; readonly?: boolean;
}) {
  return (
    <div>
      <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} readOnly={readonly} onChange={e => onChange?.(e.target.value)} className={readonly ? inputReadonlyCls : inputCls} />
    </div>
  );
}

function PwInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} pr-12`} />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1">
          {show ? "🙈" : "👁"}
        </button>
      </div>
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
        active ? "bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-white border border-sky-500/30" : "text-white/40 hover:text-white/70 hover:bg-white/5"
      }`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Appointments Tab ─────────────────────────────────────────────────────────
function AppointmentsTab() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/appointments`, { credentials: "include" })
      .then(r => r.json()).then(d => setAppointments(Array.isArray(d.appointments) ? d.appointments : []))
      .catch(() => setAppointments([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const upcoming = appointments.filter(a => !["completed","cancelled","rejected","expired","no-show"].includes(a.status.toLowerCase()));

  return (
    <div>
      <div className="mb-5">
        <h3 className="text-base sm:text-lg font-semibold text-white">Upcoming Appointments</h3>
        <p className="text-white/35 text-sm mt-0.5">{upcoming.length} active appointment{upcoming.length !== 1 ? "s" : ""}</p>
      </div>
      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4 opacity-40">📅</div>
          <p className="text-white/60 font-medium mb-1">No upcoming appointments</p>
          <p className="text-white/25 text-sm mb-6">Your scheduled appointments will appear here</p>
          <button onClick={() => navigate("/appointment")} className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
            style={{ background: "rgba(56,189,248,0.1)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.2)", cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.15)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.1)"; }}>
            <svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Book your first appointment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map(a => (
            <div key={a.id} className="flex items-start gap-3 sm:gap-4 bg-white/[0.04] border border-white/8 rounded-2xl p-3 sm:p-4 hover:bg-white/[0.06] transition-all">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/20 flex items-center justify-center text-base shrink-0">🦷</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{a.services?.name || a.service_name || "—"}</p>
                <p className="text-white/40 text-xs mt-0.5">{new Date(a.appointment_date).toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                {a.notes && <p className="text-white/30 text-xs mt-1 italic">{a.notes}</p>}
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Services Tab ─────────────────────────────────────────────────────────────
function ServicesTab() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/services/all`, { credentials: "include" })
      .then(r => r.json()).then(d => setServices(Array.isArray(d.services) ? d.services : Array.isArray(d) ? d : []))
      .catch(() => setServices([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  const serviceIcons = ["🦷","🪥","💊","🔬","✨","🩺","💉","🧬"];

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-white">Our Services</h3>
        <p className="text-white/35 text-sm mt-0.5">{services.length} treatment{services.length !== 1 ? "s" : ""} available</p>
      </div>
      {services.length === 0 ? <EmptyState icon="🦷" title="No services listed" sub="Available treatments will appear here" /> : (
        <div className="grid gap-3">
          {services.map((svc, idx) => {
            const isOpen = expanded === svc.id;
            return (
              <div key={svc.id} className="rounded-2xl border transition-all overflow-hidden"
                style={{ background: isOpen ? "rgba(56,189,248,0.05)" : "rgba(255,255,255,0.03)", borderColor: isOpen ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.07)" }}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : svc.id)}
                  className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg shrink-0 transition-all"
                    style={{ background: isOpen ? "linear-gradient(135deg,rgba(56,189,248,0.2),rgba(99,102,241,0.2))" : "rgba(255,255,255,0.05)", border: isOpen ? "1px solid rgba(56,189,248,0.25)" : "1px solid rgba(255,255,255,0.07)" }}>
                    {serviceIcons[idx % serviceIcons.length]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm transition-colors" style={{ color: isOpen ? "#fff" : "rgba(255,255,255,0.75)" }}>{svc.name}</p>
                    {!isOpen && svc.description && <p className="text-white/30 text-xs mt-0.5 truncate">{svc.description.replace(/<[^>]+>/g,"").slice(0,80)}…</p>}
                  </div>
                  <div className="shrink-0">
                    <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      style={{ color: isOpen ? "#38bdf8" : "rgba(255,255,255,0.25)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease, color 0.2s ease" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5" style={{ borderTop: "1px solid rgba(56,189,248,0.1)" }}>
                    <div className="flex items-center gap-2 pt-3 sm:pt-4 mb-3">
                      <div style={{ width: 3, height: 12, borderRadius: 3, background: "linear-gradient(180deg,#38bdf8,#6366f1)" }} />
                      <p style={{ fontWeight: 700, fontSize: "0.65rem", color: "#38bdf8", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>About this service</p>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.75 }}
                      dangerouslySetInnerHTML={{ __html: svc.description.replace(/\n/g,"<br>") }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {services.length > 0 && <p className="text-white/20 text-xs text-center mt-6">Click a service to learn more · Payment collected after your visit only</p>}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ profile }: { profile: PatientProfile }) {
  const rows = [
    { label: "Full Name",        value: [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ") || "—" },
    { label: "Date of Birth",    value: profile.birthdate ? new Date(profile.birthdate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "—" },
    { label: "Sex",              value: profile.sex === "M" ? "Male" : profile.sex === "F" ? "Female" : "—" },
    { label: "Nickname",         value: profile.nickname || "—" },
    { label: "Religion",         value: profile.religion || "—" },
    { label: "Nationality",      value: profile.nationality || "—" },
    { label: "Home Address",     value: profile.home_address || "—" },
    { label: "Home No.",         value: profile.home_no || "—" },
    { label: "Mobile No.",       value: profile.mobile_no || "—" },
    { label: "Email",            value: profile.email || "—" },
    { label: "Occupation",       value: profile.occupation || "—" },
    { label: "Office No.",       value: profile.office_no || "—" },
    { label: "Dental Insurance", value: profile.dental_insurance || "—" },
  ];
  return (
    <div>
      <h3 className="text-base sm:text-lg font-semibold text-white mb-5">Personal Information</h3>
      <div className="rounded-2xl overflow-hidden border border-white/8">
        {rows.map((r, i) => (
          <div key={r.label} className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5 ${i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"}`}>
            <span className="text-white/40 text-xs font-medium uppercase tracking-wide sm:w-36 shrink-0">{r.label}</span>
            <span className="text-white/80 text-sm break-words">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [history, setHistory] = useState<Appointment[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/appointments?all=true`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { const all = Array.isArray(d.appointments) ? d.appointments : []; setHistory(all.filter((a: Appointment) => ["completed","cancelled","rejected","expired","no-show"].includes(a.status.toLowerCase()))); })
      .catch(() => setHistory([])).finally(() => setLoading(false));
  }, []);

  const filtered = history.filter(a => search === "" || [a.services?.name || a.service_name || "", a.appointment_date, a.notes || ""].some(v => v.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div>
      <h3 className="text-base sm:text-lg font-semibold text-white mb-5">Dental History</h3>
      <div className="relative mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by service, date, or notes…"
          className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 transition-all" />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      {filtered.length === 0 ? <EmptyState icon="📋" title="No history found" sub={search ? "Try a different search term" : "Completed appointments will appear here"} /> : (
        <div className="space-y-3">
          {filtered.map(a => (
            <div key={a.id} className="flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4">
              <div className="mt-1.5 w-2 h-2 rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-white font-medium text-sm">{a.services?.name || a.service_name || "—"}</p>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-white/35 text-xs mt-0.5">{new Date(a.appointment_date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                {a.notes         && <p className="text-white/30 text-xs mt-1 italic">{a.notes}</p>}
                {a.cancel_reason && <p className="text-white/30 text-xs mt-1">Reason: {a.cancel_reason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Profile Tab ─────────────────────────────────────────────────────────
function EditProfileTab({ profile, onSaved }: { profile: PatientProfile; onSaved: (p: PatientProfile) => void }) {
  const [form, setForm] = useState({ ...profile });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/patients/profile`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: `${form.first_name} ${form.last_name}`, dob: form.birthdate?.slice(0,10), gender: form.sex === "M" ? "male" : form.sex === "F" ? "female" : "other", address: form.home_address, religion: form.religion || null, nationality: form.nationality || null, homeNumber: form.home_no || null, phone: form.mobile_no, email: form.email }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed to save"); }
      setAlert({ type: "ok", msg: "Profile updated successfully!" });
      onSaved(form);
    } catch (e: any) { setAlert({ type: "err", msg: e.message || "Could not save changes." }); }
    finally { setLoading(false); }
  };

  const selectCls = "w-full bg-[#0d0d15] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500/50 transition-all appearance-none";

  return (
    <div>
      <h3 className="text-base sm:text-lg font-semibold text-white mb-5">Edit Profile</h3>
      {alert && <PrfAlert type={alert.type} msg={alert.msg} onClose={() => setAlert(null)} />}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldInput label="First Name"  value={form.first_name}       onChange={set("first_name")} />
          <FieldInput label="Last Name"   value={form.last_name}        onChange={set("last_name")} />
          <FieldInput label="Middle Name" value={form.middle_name || ""} onChange={set("middle_name")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldInput label="Date of Birth" type="date" value={form.birthdate?.slice(0,10) || ""} onChange={set("birthdate")} />
          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">Sex</label>
            <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))} className={selectCls}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <FieldInput label="Nickname" value={form.nickname || ""} onChange={set("nickname")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldInput label="Religion"    value={form.religion    || ""} onChange={set("religion")} />
          <FieldInput label="Nationality" value={form.nationality || ""} onChange={set("nationality")} />
        </div>
        <div>
          <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">Home Address</label>
          <textarea value={form.home_address} rows={2} onChange={e => setForm(f => ({ ...f, home_address: e.target.value }))}
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-sky-500/50 transition-all resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldInput label="Home No."   value={form.home_no   || ""}  onChange={set("home_no")} />
          <FieldInput label="Mobile No." value={form.mobile_no}         onChange={set("mobile_no")} />
          <FieldInput label="Email" type="email" value={form.email}     readonly />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldInput label="Occupation"       value={form.occupation       || ""} onChange={set("occupation")} />
          <FieldInput label="Office No."       value={form.office_no        || ""} onChange={set("office_no")} />
          <FieldInput label="Dental Insurance" value={form.dental_insurance || ""} onChange={set("dental_insurance")} />
        </div>
        <button onClick={handleSave} disabled={loading}
          className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2">
          {loading ? <><Spinner size={16} /> Saving…</> : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Change Password Tab ──────────────────────────────────────────────────────
function ChangePasswordTab() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function pwStrength(pw: string) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  const strength = pwStrength(next);

  const handleChange = async () => {
    if (!current || !next || !confirm) { setAlert({ type: "err", msg: "All fields are required." }); return; }
    if (next.length < 8)  { setAlert({ type: "err", msg: "New password must be at least 8 characters." }); return; }
    if (next !== confirm) { setAlert({ type: "err", msg: "Passwords do not match." }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/patients/change-password`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");
      setAlert({ type: "ok", msg: "Password changed. Redirecting to login…" });
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e: any) { setAlert({ type: "err", msg: e.message }); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h3 className="text-base sm:text-lg font-semibold text-white mb-5">Change Password</h3>
      {alert && <PrfAlert type={alert.type} msg={alert.msg} onClose={() => setAlert(null)} />}
      <div className="space-y-4">
        <PwInput label="Current Password" value={current} onChange={setCurrent} />
        <div>
          <PwInput label="New Password" value={next} onChange={setNext} />
          {next && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex gap-1 flex-1">
                {[0,1,2].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < strength ? ["","bg-red-500","bg-yellow-400","bg-emerald-400"][strength] : "bg-white/10"}`} />)}
              </div>
              <span className={`text-xs font-medium ${["","text-red-400","text-yellow-400","text-emerald-400"][strength]}`}>{["","Weak","Fair","Strong"][strength]}</span>
            </div>
          )}
        </div>
        <PwInput label="Confirm New Password" value={confirm} onChange={setConfirm} />
        <p className="text-white/25 text-xs bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
          Min. 8 characters. Use uppercase, lowercase, numbers and symbols for a strong password.
        </p>
        <button onClick={handleChange} disabled={loading}
          className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2">
          {loading ? <><Spinner size={16} /> Updating…</> : "Update Password"}
        </button>
      </div>
    </div>
  );
}

// ─── useIsMobile ──────────────────────────────────────────────────────────────
function useIsMobile(bp = 1024) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [profile,    setProfile]    = useState<PatientProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<TabKey>("appointments");
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/patients/profile`, { credentials: "include" })
      .then(r => { if (r.status === 401) { navigate("/login"); throw new Error("Unauth"); } return r.json(); })
      .then(d => setProfile({
        patient_id:       d.patient_id ?? d.patientId ?? 0,
        username:         d.username ?? "",
        first_name:       d.first_name  ?? d.firstName  ?? (d.full_name ?? "").split(" ")[0] ?? "",
        last_name:        d.last_name   ?? d.lastName   ?? (d.full_name ?? "").split(" ").slice(1).join(" ") ?? "",
        middle_name:      d.middle_name ?? d.middleName,
        birthdate:        d.birthdate   ?? d.birth_date ?? d.dob ?? "",
        sex:              d.sex ?? (d.gender === "male" ? "M" : d.gender === "female" ? "F" : ""),
        nickname:         d.nickname,
        religion:         d.religion !== "N/A"    ? d.religion    : undefined,
        nationality:      d.nationality !== "N/A" ? d.nationality : undefined,
        home_address:     d.home_address ?? d.homeAddress ?? d.address ?? "",
        home_no:          d.home_no ?? d.homeNo ?? (d.home_number !== "N/A" ? d.home_number : undefined),
        mobile_no:        d.mobile_no ?? d.mobileNo ?? d.phone ?? "",
        email:            d.email ?? "",
        occupation:       d.occupation,
        office_no:        d.office_no ?? d.officeNo,
        fax_no:           d.fax_no    ?? d.faxNo,
        dental_insurance: d.dental_insurance ?? d.dentalInsurance,
      }))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }); }
    finally { navigate("/login"); }
  };

  const TABS: { key: TabKey; icon: string; label: string }[] = [
    { key: "appointments", icon: "📅", label: "Appointments" },
    { key: "services",     icon: "🦷", label: "Services"     },
    { key: "overview",     icon: "👤", label: "Overview"     },
    { key: "history",      icon: "📋", label: "History"      },
    { key: "edit",         icon: "✏️",  label: "Edit Profile" },
    { key: "password",     icon: "🔐", label: "Password"     },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center flex-col gap-4">
      <Spinner size={32} />
      <p className="text-white/30 text-sm">Loading your profile…</p>
    </div>
  );

  if (!profile) return null;

  const firstName  = profile.first_name  ?? "";
  const lastName   = profile.last_name   ?? "";
  const middleName = profile.middle_name ?? "";
  const fullName   = [firstName, middleName ? middleName.charAt(0) + "." : "", lastName].filter(Boolean).join(" ");
  const initials   = ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?";

  // ── Sidebar content (shared between desktop aside and mobile drawer) ──
  const SidebarContent = () => (
    <>
      {/* Avatar card */}
      <div className="bg-white/[0.04] border border-white/8 rounded-3xl p-5 text-center">
        <div className="relative inline-block mb-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-sky-500/20">
            {initials}
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-[#0a0a0f] flex items-center justify-center">
            <svg width="8" height="8" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <h2 className="text-white font-semibold text-sm leading-snug">{fullName}</h2>
        <span className="inline-block text-xs font-bold tracking-widest text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-full px-3 py-1 mt-2">PATIENT</span>
        <div className="mt-4 space-y-2 text-left">
          {[{ icon: "✉", text: profile.email }, { icon: "📞", text: profile.mobile_no }].map(item => (
            <div key={item.icon} className="flex items-center gap-2 text-white/40 text-xs">
              <span className="text-white/25">{item.icon}</span>
              <span className="truncate">{item.text}</span>
            </div>
          ))}
        </div>
        <button onClick={handleLogout} disabled={loggingOut}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium py-2.5 rounded-xl transition-all">
          <svg width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {loggingOut ? "Logging out…" : "Logout"}
        </button>
      </div>

      {/* Quick info */}
      <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-3">Quick Info</p>
        <div className="space-y-2.5">
          {[
            { label: "Username",   value: profile.username },
            { label: "Sex",        value: profile.sex === "M" ? "Male" : "Female" },
            { label: "Patient ID", value: `#${profile.patient_id}` },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-white/35 text-xs">{r.label}</span>
              <span className="text-white/70 text-xs font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0f]">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/8 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* ── Mobile drawer ── */}
      {isMobile && drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#0d0d18] border-r border-white/8 p-5 overflow-y-auto flex flex-col gap-4">
            <button onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/[0.06] border border-white/8 flex items-center justify-center text-white/40 hover:text-white transition-colors text-sm">
              ✕
            </button>
            <div className="pt-2">
              {/* Nav items in drawer */}
              <div className="space-y-1 mb-4">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => { setTab(t.key); setDrawerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                      tab === t.key ? "bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-white border border-sky-500/30" : "text-white/40 hover:text-white/70 hover:bg-white/5"
                    }`}>
                    <span>{t.icon}</span><span>{t.label}</span>
                  </button>
                ))}
              </div>
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 shrink-0 border-b border-white/8 bg-black/30 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-sm sm:text-base shadow-lg shadow-sky-500/20">🦷</div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Balane-Saspa</div>
              <div className="text-white/30 text-xs mt-0.5">Patient Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/appointment"
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl transition-all"
              style={{ background: "linear-gradient(135deg,#38bdf8,#6366f1)", color: "#fff", textDecoration: "none", boxShadow: "0 4px 14px rgba(56,189,248,0.2)" }}>
              <svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">Book Appointment</span>
            </Link>
            <div className="flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
              <span className="hidden sm:inline text-white/70 text-sm font-medium pr-1">{fullName}</span>
            </div>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)}
                className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-white/30 text-xs mb-4 sm:mb-6">
            <span>Portal</span><span>/</span><span className="text-white/60">My Profile</span>
          </div>

          <div className="flex gap-5 sm:gap-6 items-start">
            {/* Desktop sidebar */}
            {!isMobile && (
              <aside className="shrink-0 w-64 space-y-4">
                <SidebarContent />
              </aside>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 bg-white/[0.04] border border-white/8 rounded-2xl sm:rounded-3xl overflow-hidden">
              {/* Tabs — scrollable, icons-only on mobile (sm shows text) */}
              <div className="flex gap-1 p-2 sm:p-3 border-b border-white/8 overflow-x-auto"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {TABS.map(t => <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon} label={t.label} />)}
              </div>
              <div className="p-4 sm:p-6">
                {tab === "appointments" && <AppointmentsTab />}
                {tab === "services"     && <ServicesTab />}
                {tab === "overview"     && <OverviewTab profile={profile} />}
                {tab === "history"      && <HistoryTab />}
                {tab === "edit"         && <EditProfileTab profile={profile} onSaved={p => setProfile(p)} />}
                {tab === "password"     && <ChangePasswordTab />}
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center text-white/15 text-xs py-6 mt-4 border-t border-white/5">
          © 2025 Balane-Saspa Dental Clinic — All Rights Reserved.
        </footer>
      </main>
    </div>
  );
}