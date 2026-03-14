/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { JSX } from "react/jsx-dev-runtime";

const API_BASE = "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Service { id: number; name: string; description: string; }
interface Appointment {
  id?: number; appointment_id?: number;
  appointment_date: string; status: string; updated_at?: string;
}
type AlertVariant = "success" | "error" | "warning" | "info";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AVAILABLE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const HOUR_LABELS: Record<number, string> = {
  9: "9:00 AM", 10: "10:00 AM", 11: "11:00 AM", 12: "12:00 PM",
  13: "1:00 PM", 14: "2:00 PM", 15: "3:00 PM", 16: "4:00 PM",
};

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function toBookedTimeStr(date: Date): string {
  return `${toDateStr(date)} ${String(date.getHours()).padStart(2, "0")}:00`;
}
function toISO(dateStr: string, hour: number): string {
  return `${dateStr}T${String(hour).padStart(2, "0")}:00:00`;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg style={{ width: size, height: size, animation: "apptSpin 0.7s linear infinite" }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Alert Dialog ─────────────────────────────────────────────────────────────
function AlertDialog({ open, variant, title, message, onClose }: {
  open: boolean; variant: AlertVariant; title: string; message: string; onClose: () => void;
}): JSX.Element | null {
  if (!open) return null;
  const icons: Record<AlertVariant, string> = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  const configs: Record<AlertVariant, { accent: string; bg: string; border: string }> = {
    success: { accent: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.2)"  },
    error:   { accent: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
    warning: { accent: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.2)"  },
    info:    { accent: "#38bdf8", bg: "rgba(56,189,248,0.1)",  border: "rgba(56,189,248,0.2)"  },
  };
  const c = configs[variant];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", animation: "apptFadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d15", borderRadius: 24, width: "100%", maxWidth: 360, padding: "2rem 1.75rem", textAlign: "center", border: `1px solid ${c.border}`, boxShadow: "0 32px 80px rgba(0,0,0,0.6)", animation: "apptPopUp 0.28s cubic-bezier(.22,.68,0,1.2) both" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 1.25rem", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", fontWeight: 800, color: c.accent, border: `1px solid ${c.border}` }}>{icons[variant]}</div>
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", margin: "0 0 0.5rem" }}>{title}</h3>
        <p style={{ fontSize: "0.84rem", lineHeight: 1.7, color: "rgba(255,255,255,0.4)", margin: "0 0 1.5rem" }}>{message}</p>
        <button onClick={onClose} style={{ width: "100%", padding: "0.8rem", borderRadius: 12, border: `1px solid ${c.border}`, cursor: "pointer", background: c.bg, color: c.accent, fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 700 }}>Got it</button>
      </div>
    </div>
  );
}

// ─── Policy Modal ─────────────────────────────────────────────────────────────
function PolicyModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }): JSX.Element | null {
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1055, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", animation: "apptFadeIn 0.15s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d15", borderRadius: 24, width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <h5 style={{ margin: 0, fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>{title}</h5>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "rgba(255,255,255,0.5)", width: 32, height: 32, borderRadius: 10, fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "1.5rem", flex: 1, fontSize: "0.84rem", lineHeight: 1.75, color: "rgba(255,255,255,0.4)" }}>{children}</div>
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "0.65rem 1.75rem", borderRadius: 10, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", color: "#38bdf8", cursor: "pointer", fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 700 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Privacy / Terms Content ──────────────────────────────────────────────────
function PolicySection({ t }: { t: string }) {
  return <h5 style={{ color: "rgba(255,255,255,0.7)", marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t}</h5>;
}
function PolicyParagraph({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: "0.875rem", color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>{children}</p>;
}

function PrivacyPolicyContent(): JSX.Element {
  return (
    <>
      <p style={{ fontSize: "0.7rem", color: "rgba(56,189,248,0.6)", marginBottom: "1rem" }}>Last Updated: May 8, 2025</p>
      <PolicySection t="1. Introduction" /><PolicyParagraph>Welcome to Balane-Saspa Dental Appointment System. We respect your privacy and are committed to protecting your personal information.</PolicyParagraph>
      <PolicySection t="2. Information We Collect" /><PolicyParagraph>We collect contact information (name, email, address, phone), health information (dental history, current conditions, treatment plans), and usage data.</PolicyParagraph>
      <PolicySection t="3. How We Use Your Information" /><PolicyParagraph>We use your information to provide dental services, process appointment bookings, send reminders, and communicate with you about your care.</PolicyParagraph>
      <PolicySection t="4. Data Security" /><PolicyParagraph>We implement appropriate technical and organizational security measures designed to protect your personal information from unauthorized access.</PolicyParagraph>
      <PolicySection t="5. Contact Us" /><p style={{ color: "rgba(255,255,255,0.35)" }}>Dental Clinic · 4X94+XQ2, Bagasbas Road, Daet, Camarines Norte · dmdannsaspa@yahoo.com · +63 920 797 6690</p>
    </>
  );
}

function TermsContent(): JSX.Element {
  return (
    <>
      <p style={{ fontSize: "0.7rem", color: "rgba(56,189,248,0.6)", marginBottom: "1rem" }}>Last Updated: May 8, 2025</p>
      <PolicySection t="1. Acceptance of Terms" /><PolicyParagraph>By accessing or using our Service, you agree to be bound by these Terms and Conditions.</PolicyParagraph>
      <PolicySection t="2. Appointment Policy" /><PolicyParagraph>You must cancel or reschedule at least 24 hours in advance. No-shows may be subject to a cooldown period before rebooking.</PolicyParagraph>
      <PolicySection t="3. Payment Terms" /><PolicyParagraph>Payment is only collected after a successful in-person appointment. No online payments are required.</PolicyParagraph>
      <PolicySection t="4. User Conduct" /><PolicyParagraph>You agree not to misuse the Service, impersonate others, or engage in any conduct that restricts others from using the Service.</PolicyParagraph>
      <PolicySection t="5. Contact Us" /><p style={{ color: "rgba(255,255,255,0.35)" }}>Balane-Saspa Dental Clinic · 4X94+XQ2, Bagasbas Road, Daet, Camarines Norte · dmdannsaspa@yahoo.com · +63 920 797 6690</p>
    </>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ selectedDate, onSelect, bookedTimes }: { selectedDate: string | null; onSelect: (dateStr: string) => void; bookedTimes: string[] }): JSX.Element {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isDisabled = (day: number): boolean => {
    const d = new Date(viewYear, viewMonth, day); d.setHours(0, 0, 0, 0);
    if (d < today) return true;
    if (d.getDay() === 0) return true;
    const ds = toDateStr(d);
    const now = new Date();
    if (ds === toDateStr(today) && now.getHours() >= 15) return true;
    return AVAILABLE_HOURS.every(h => bookedTimes.includes(`${ds} ${String(h).padStart(2,"0")}:00`));
  };

  const navBtn = (label: string, fn: () => void) => (
    <button type="button" onClick={fn} style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", transition: "all 0.15s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; }}>
      {label}
    </button>
  );

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        {navBtn("‹", () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); })}
        <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#fff" }}>{MONTHS[viewMonth]} {viewYear}</span>
        {navBtn("›", () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 5 }}>
        {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: "0.6rem", fontWeight: 700, color: "rgba(255,255,255,0.2)", padding: "2px 0", letterSpacing: "0.04em" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const ds = `${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const disabled = isDisabled(day); const selected = selectedDate === ds; const isToday = ds === toDateStr(today);
          return (
            <button key={day} type="button" onClick={() => !disabled && onSelect(ds)} disabled={disabled}
              style={{ aspectRatio: "1", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", background: selected ? "linear-gradient(135deg,#38bdf8,#6366f1)" : isToday ? "rgba(56,189,248,0.1)" : "transparent", color: selected ? "#fff" : disabled ? "rgba(255,255,255,0.15)" : isToday ? "#38bdf8" : "rgba(255,255,255,0.65)", fontSize: "0.74rem", fontWeight: selected || isToday ? 700 : 400, boxShadow: selected ? "0 4px 12px rgba(56,189,248,0.3)" : "none", transition: "all 0.15s" }}
              onMouseEnter={e => { if (!disabled && !selected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!disabled && !selected) (e.currentTarget as HTMLElement).style.background = isToday ? "rgba(56,189,248,0.1)" : "transparent"; }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Slots ───────────────────────────────────────────────────────────────
function TimeSlots({ selectedDate, selectedHour, onSelect, bookedTimes }: { selectedDate: string | null; selectedHour: number | null; onSelect: (hour: number) => void; bookedTimes: string[] }): JSX.Element {
  const now = new Date(); const todayStr = toDateStr(now);
  const isBooked = (hour: number) => !!selectedDate && bookedTimes.includes(`${selectedDate} ${String(hour).padStart(2,"0")}:00`);
  const isDisabled = (hour: number): boolean => {
    if (!selectedDate) return true;
    if (isBooked(hour)) return true;
    if (selectedDate === todayStr && hour <= now.getHours()) return true;
    return false;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {AVAILABLE_HOURS.map(hour => {
        const disabled = isDisabled(hour); const selected = selectedHour === hour; const booked = isBooked(hour);
        return (
          <div key={hour} onClick={() => !disabled && onSelect(hour)}
            style={{ padding: "7px 10px", textAlign: "center", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontSize: "0.73rem", fontWeight: selected ? 700 : 500, transition: "all 0.18s", background: selected ? "linear-gradient(135deg,#38bdf8,#6366f1)" : disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)", color: selected ? "#fff" : disabled ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)", border: selected ? "1px solid transparent" : `1px solid ${disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)"}`, textDecoration: booked ? "line-through" : "none", boxShadow: selected ? "0 4px 12px rgba(56,189,248,0.28)" : "none" }}
            onMouseEnter={e => { if (!disabled && !selected) { (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.2)"; (e.currentTarget as HTMLElement).style.color = "#38bdf8"; } }}
            onMouseLeave={e => { if (!disabled && !selected) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; } }}>
            {HOUR_LABELS[hour]}
          </div>
        );
      })}
      {!selectedDate && <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", margin: "4px 0 0", textAlign: "center" }}>Pick a date first</p>}
    </div>
  );
}

// ─── useIsMobile ──────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 767) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= breakpoint : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", handler); return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AppointmentPage(): JSX.Element {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [restriction, setRestriction] = useState<string | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);

  const [mobileStep, setMobileStep] = useState(1); // 1 = Service, 2 = Date & Time, 3 = Notes & Submit

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [alert, setAlert] = useState<{ open: boolean; variant: AlertVariant; title: string; message: string; redirect?: string }>({ open: false, variant: "info", title: "", message: "" });

  const socketRef = useRef<any>(null);

  const showAlert = useCallback((variant: AlertVariant, title: string, message: string, redirect?: string) => {
    setAlert({ open: true, variant, title, message, redirect });
  }, []);

  const closeAlert = useCallback(() => {
    const redir = alert.redirect;
    setAlert(a => ({ ...a, open: false }));
    if (redir) navigate(redir);
  }, [alert.redirect, navigate]);

  const parseBookedTimes = (appointments: Appointment[]): string[] =>
    appointments.map(a => { const d = new Date(a.appointment_date); return isNaN(d.getTime()) ? null : toBookedTimeStr(d); }).filter(Boolean) as string[];

  function checkRestrictions(appointments: Appointment[]): string | null {
    const now = new Date();
    const active = appointments.find(a => { const d = new Date(a.appointment_date); const s = (a.status || "").toLowerCase(); return s === "pending" || (s === "confirmed" && d >= now); });
    if (active) return "You cannot book a new appointment while you have an active appointment. Please wait until your current appointment is completed or cancelled.";
    const latest = [...appointments].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0];
    if (latest && (latest.status || "").toLowerCase() === "cancelled" && latest.updated_at) {
      const cooldownEnd = addDays(new Date(latest.updated_at), 3);
      if (now < cooldownEnd) {
        const daysLeft = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `You're in a 3-day cooldown after a cancellation. You can book again after ${cooldownEnd.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} (${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining).`;
      }
    }
    return null;
  }

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        let authRes = await fetch(`${API_BASE}/check-auth`, { credentials: "include" });
        let authData = await authRes.json();
        if (!authData.isLoggedIn) {
          const alRes = await fetch(`${API_BASE}/auth/auto-login`, { method: "POST", credentials: "include" });
          if (alRes.ok) { const alData = await alRes.json(); if (alData.success) { authRes = await fetch(`${API_BASE}/check-auth`, { credentials: "include" }); authData = await authRes.json(); } }
        }
        if (!authData.isLoggedIn) { showAlert("warning", "Login Required", "Please log in to make an appointment.", "/login"); if (mounted) setPageLoading(false); return; }
        if (!mounted) return;
        setUserId(authData.userId);
        const svcRes = await fetch(`${API_BASE}/api/services/all`, { credentials: "include" });
        const svcData = await svcRes.json();
        const svcList: Service[] = Array.isArray(svcData.services) ? svcData.services : Array.isArray(svcData) ? svcData : [];
        if (mounted) setServices(svcList);
        const apptRes = await fetch(`${API_BASE}/api/appointments?all=true`, { credentials: "include" });
        const apptData = await apptRes.json();
        const userAppts: Appointment[] = Array.isArray(apptData.appointments) ? apptData.appointments : [];
        if (!mounted) return;
        const restrictMsg = checkRestrictions(userAppts);
        if (restrictMsg) { setRestriction(restrictMsg); setPageLoading(false); return; }
        const bookedRes = await fetch(`${API_BASE}/api/appointments/booked?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
        const bookedData = await bookedRes.json();
        const booked: Appointment[] = Array.isArray(bookedData.appointments) ? bookedData.appointments : [];
        if (mounted) setBookedTimes(parseBookedTimes(booked));
        try {
          const { io } = await import("socket.io-client");
          const socket = io("http://localhost:3000", { withCredentials: true, transports: ["websocket","polling"], reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 3000 });
          socket.on("appointment_update", (data: { appointments: Appointment[] }) => { if (!mounted) return; setBookedTimes(parseBookedTimes(data.appointments)); });
          socketRef.current = socket;
        } catch (socketErr) { console.warn("[socket.io] skipped:", socketErr); }
        if (mounted) { setAuthChecked(true); setPageLoading(false); }
      } catch (err: any) { if (mounted) { showAlert("error", "Error", err.message || "An error occurred."); setPageLoading(false); } }
    };
    init();
    return () => { mounted = false; socketRef.current?.disconnect(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedDate || selectedHour === null) { showAlert("warning", "Incomplete", "Please select a service, date, and time."); return; }
    const now = new Date();
    const slotStr = `${selectedDate} ${String(selectedHour).padStart(2,"0")}:00`;
    const slotDt = new Date(toISO(selectedDate, selectedHour));
    if (slotDt <= now) { showAlert("warning", "Invalid Date", "Please select a future date and time."); return; }
    if (new Date(selectedDate).getDay() === 0) { showAlert("warning", "Invalid Date", "Appointments are not available on Sundays."); return; }
    if (bookedTimes.includes(slotStr)) { showAlert("warning", "Slot Taken", "This time slot is already booked. Please choose another."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/appointments`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: String(userId), appointment_date: toISO(selectedDate, selectedHour), service_id: String(selectedService.id), notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (res.status === 401) { showAlert("error", "Session Expired", "Please log in again.", "/login"); return; }
      if (res.status === 429) { showAlert("warning", "Limit Reached", "Maximum 5 bookings per day reached."); return; }
      if (!res.ok) throw new Error(data.message || "Failed to book appointment");
      showAlert("success", "Appointment Requested!", data.message || "Your request is submitted and awaiting admin confirmation.", "/profile");
    } catch (err: any) { showAlert("error", "Booking Failed", err.message); }
    finally { setSubmitting(false); }
  };

  const formReady = !pageLoading && !restriction && authChecked;
  const canSubmit = !!selectedService && !!selectedDate && selectedHour !== null;

  return (
    <>
      <style>{`
        @keyframes apptSpin    { to { transform: rotate(360deg); } }
        @keyframes apptFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes apptPopUp   { from { opacity: 0; transform: scale(0.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes apptSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        *, *::before, *::after { box-sizing: border-box; }
        .appt-root { min-height: 100vh; background: #0a0a0f; }
        .appt-card { background: rgba(255,255,255,0.04); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; }
        .appt-card-header { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .appt-step-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 4px; background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.18); border-radius: 50px; font-size: 0.65rem; font-weight: 700; color: #38bdf8; letter-spacing: 0.04em; margin-bottom: 8px; text-transform: uppercase; }
        .appt-step-num { width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg,#38bdf8,#6366f1); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 800; flex-shrink: 0; }
        .appt-service-item { padding: 10px 12px; margin-bottom: 4px; border-radius: 12px; cursor: pointer; transition: all 0.18s; border: 1px solid rgba(255,255,255,0.06); background: transparent; }
        .appt-service-item:hover:not(.selected) { background: rgba(56,189,248,0.06) !important; border-color: rgba(56,189,248,0.18) !important; }
        .appt-submit-btn { width: 100%; padding: 0.95rem; border-radius: 14px; border: none; cursor: pointer; font-family: inherit; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.01em; transition: all 0.2s; }
        .appt-submit-btn:not(:disabled):hover { transform: translateY(-1px); }
        .appt-submit-btn:not(:disabled):active { transform: translateY(0); }
        /* Main grid */
        .appt-main-grid { display: grid; grid-template-columns: 260px 1fr; gap: 1.25rem; align-items: start; }
        /* Date/time layout */
        .appt-datetime-inner { display: flex; gap: 1.25rem; flex-wrap: nowrap; align-items: flex-start; padding: 1.25rem; }
        .appt-timeslot-col { width: 120px; flex-shrink: 0; }
        .appt-divider { width: 1px; align-self: stretch; background: rgba(255,255,255,0.06); flex-shrink: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        /* ── Mobile ── */
        @media (max-width: 767px) {
          .appt-main-grid { grid-template-columns: 1fr; gap: 1rem; }
          .appt-datetime-inner { flex-direction: column; padding: 1rem; gap: 1rem; }
          .appt-divider { display: none; }
          .appt-timeslot-col { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
          .appt-timeslot-col > p { grid-column: 1 / -1; }
          .appt-topbar-hours { display: none !important; }
        }
        @media (max-width: 479px) { .appt-timeslot-col { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 1023px) { .appt-main-grid { grid-template-columns: 220px 1fr; gap: 1rem; } }
      `}</style>

      <div className="appt-root">
        {submitting && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.9)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", zIndex: 9999, gap: 16, backdropFilter: "blur(8px)" }}>
            <Spinner size={36} />
            <p style={{ fontSize: "0.875rem", color: "#38bdf8", fontWeight: 700, margin: 0 }}>Booking your appointment…</p>
          </div>
        )}

        {/* Background */}
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: -160, left: -160, width: 400, height: 400, borderRadius: "50%", background: "rgba(56,189,248,0.06)", filter: "blur(120px)" }} />
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 320, height: 320, borderRadius: "50%", background: "rgba(99,102,241,0.06)", filter: "blur(100px)" }} />
          <div style={{ position: "absolute", inset: 0, opacity: 0.015, backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        {/* Header */}
        <header style={{ background: "rgba(10,10,15,0.8)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, zIndex: 50 }}>
          {/* Top bar */}
          <div style={{ background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "6px 0" }}>
            <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="appt-topbar-hours" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "rgba(255,255,255,0.25)" }}>
                <svg width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={12} cy={12} r={10}/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
                Mon – Sat · 9 AM to 4 PM
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "rgba(255,255,255,0.25)" }}>
                <svg width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                +63 920 797 6690
              </span>
            </div>
          </div>
          {/* Nav bar */}
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 1rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Link to="/profile" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#38bdf8,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", boxShadow: "0 4px 16px rgba(56,189,248,0.2)", flexShrink: 0 }}>🦷</div>
              <div>
                <span style={{ fontWeight: 800, fontSize: "0.84rem", color: "#fff", display: "block", lineHeight: 1.2 }}>Balane-Saspa</span>
                <span style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Dental Clinic</span>
              </div>
            </Link>
            {!isMobile && (
              <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Link to="/profile" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, transition: "all 0.18s", fontWeight: 500 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  Profile
                </Link>
              </nav>
            )}
          </div>
        </header>

        {/* Main */}
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "1.25rem 1rem" : "2rem 1.5rem", position: "relative", zIndex: 1, animation: "apptSlideUp 0.4s ease both" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "rgba(255,255,255,0.25)", marginBottom: "1.25rem" }}>
            <Link to="/profile" style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"}>
              Portal
            </Link>
            <span style={{ opacity: 0.4 }}>/</span>
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Book an Appointment</span>
          </div>

          {/* Hero */}
          <div style={{ borderRadius: 20, overflow: "hidden", marginBottom: "1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: isMobile ? "1.25rem" : "2rem 2.25rem", position: "relative" }}>
            <div style={{ position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(56,189,248,0.08) 0%,transparent 70%)" }} />
            <div style={{ position: "absolute", left: -30, bottom: -40, width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "3px 10px 3px 5px", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 50, fontSize: "0.65rem", fontWeight: 700, color: "#38bdf8", letterSpacing: "0.05em" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8", display: "inline-block" }} />
                APPOINTMENT BOOKING
              </div>
              <h1 style={{ fontSize: isMobile ? "1.25rem" : "1.75rem", fontWeight: 800, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.03em" }}>Book an Appointment</h1>
              <p style={{ fontSize: "0.84rem", color: "rgba(255,255,255,0.35)", margin: 0, maxWidth: 420 }}>Select a service, choose your preferred date and time, and we'll confirm shortly.</p>
            </div>
          </div>

          {pageLoading && <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}><Spinner size={32} /></div>}

          {!pageLoading && restriction && (
            <div style={{ padding: "1.25rem", borderRadius: 16, marginBottom: 20, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "rgba(251,191,36,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>🔒</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: "0 0 4px" }}>Booking Restricted</p>
                <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.65 }}>{restriction}</p>
              </div>
            </div>
          )}

          {formReady && (
            <form onSubmit={handleSubmit}>
              {/* ── DESKTOP layout (unchanged two-column grid) ── */}
              {!isMobile && (
                <div className="appt-main-grid">
                  {/* Left: Service */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="appt-card">
                      <div className="appt-card-header">
                        <div className="appt-step-badge"><span className="appt-step-num">1</span>Select Service</div>
                        <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: "0 0 2px" }}>Choose Treatment</p>
                        <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>Select the service you need</p>
                      </div>
                      <div style={{ padding: "0.75rem", maxHeight: 320, overflowY: "auto" }}>
                        {services.length === 0
                          ? <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><Spinner size={22} /></div>
                          : services.map(svc => {
                            const sel = selectedService?.id === svc.id;
                            return (
                              <div key={svc.id} className={`appt-service-item${sel ? " selected" : ""}`} onClick={() => setSelectedService(sel ? null : svc)}
                                style={{ background: sel ? "rgba(56,189,248,0.1)" : undefined, color: sel ? "#fff" : "rgba(255,255,255,0.55)", border: sel ? "1px solid rgba(56,189,248,0.3)" : undefined, fontWeight: sel ? 600 : 400, fontSize: "0.84rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                  <span style={{ fontSize: "0.9rem" }}>🦷</span>{svc.name}
                                  {sel && <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "#38bdf8" }}>✓</span>}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                    {selectedService && (
                      <div style={{ padding: "1.25rem", borderRadius: 16, background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.12)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 3, height: 12, borderRadius: 3, background: "linear-gradient(180deg,#38bdf8,#6366f1)" }} />
                          <p style={{ fontWeight: 700, fontSize: "0.65rem", color: "#38bdf8", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>About this service</p>
                        </div>
                        <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: selectedService.description.replace(/\n/g,"<br>") }} />
                      </div>
                    )}
                  </div>

                  {/* Right: Date/Time/Notes/Submit */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="appt-card">
                      <div className="appt-card-header">
                        <div className="appt-step-badge"><span className="appt-step-num">2</span>Date & Time</div>
                        <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: "0 0 2px" }}>Pick Your Slot</p>
                        <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>Sundays unavailable · 9 AM – 4 PM only</p>
                      </div>
                      <div className="appt-datetime-inner">
                        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <MiniCalendar selectedDate={selectedDate} onSelect={ds => { setSelectedDate(ds); setSelectedHour(null); }} bookedTimes={bookedTimes} />
                        </div>
                        <div className="appt-divider" />
                        <div className="appt-timeslot-col">
                          <p style={{ fontWeight: 700, fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Available Times</p>
                          <TimeSlots selectedDate={selectedDate} selectedHour={selectedHour} onSelect={setSelectedHour} bookedTimes={bookedTimes} />
                        </div>
                      </div>
                      {selectedDate && selectedHour !== null && (
                        <div style={{ margin: "0 1.25rem 1.25rem", padding: "12px 14px", borderRadius: 12, background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#38bdf8,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", boxShadow: "0 4px 12px rgba(56,189,248,0.25)" }}>📅</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 600, fontSize: "0.8rem", color: "#fff", margin: 0 }}>{new Date(selectedDate).toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                            <p style={{ fontSize: "0.7rem", color: "#38bdf8", margin: "2px 0 0", fontWeight: 600 }}>{HOUR_LABELS[selectedHour]}</p>
                          </div>
                          <span style={{ marginLeft: "auto", background: "rgba(52,211,153,0.08)", color: "#34d399", padding: "3px 10px", borderRadius: 50, border: "1px solid rgba(52,211,153,0.18)", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>SELECTED</span>
                        </div>
                      )}
                    </div>
                    <div className="appt-card">
                      <div className="appt-card-header">
                        <div className="appt-step-badge"><span className="appt-step-num">3</span>Notes</div>
                        <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: 0 }}>Additional Notes <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)", fontSize: "0.8rem" }}>(Optional)</span></p>
                      </div>
                      <div style={{ padding: "1rem 1.25rem" }}>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} onFocus={() => setNotesFocused(true)} onBlur={() => setNotesFocused(false)} rows={3}
                          placeholder="Any special requests or information for your dentist…"
                          style={{ width: "100%", padding: "0.75rem 1rem", fontSize: "0.84rem", border: `1px solid ${notesFocused ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, background: notesFocused ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", fontFamily: "inherit", resize: "vertical", outline: "none", color: "#fff", transition: "all 0.2s", boxShadow: notesFocused ? "0 0 0 3px rgba(56,189,248,0.06)" : "none" }} />
                      </div>
                    </div>
                    <div>
                      <button type="submit" disabled={submitting || !canSubmit} className="appt-submit-btn"
                        style={{ background: canSubmit ? "linear-gradient(135deg,#38bdf8,#6366f1)" : "rgba(255,255,255,0.04)", color: canSubmit ? "#fff" : "rgba(255,255,255,0.2)", cursor: !canSubmit ? "not-allowed" : "pointer", boxShadow: canSubmit ? "0 8px 24px rgba(56,189,248,0.25)" : "none", border: `1px solid ${canSubmit ? "transparent" : "rgba(255,255,255,0.06)"}` }}>
                        {submitting ? "Submitting…" : canSubmit ? "Confirm Appointment →" : "Select service, date & time"}
                      </button>
                      {!canSubmit && (
                        <div style={{ marginTop: "0.75rem", display: "flex", gap: 5 }}>
                          {[{ label: "Service", done: !!selectedService }, { label: "Date", done: !!selectedDate }, { label: "Time", done: selectedHour !== null }].map(step => (
                            <div key={step.label} style={{ flex: 1, padding: "7px 10px", borderRadius: 10, background: step.done ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${step.done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)"}`, display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: "0.68rem", color: step.done ? "#34d399" : "rgba(255,255,255,0.2)" }}>{step.done ? "✓" : "○"}</span>
                              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: step.done ? "#34d399" : "rgba(255,255,255,0.22)" }}>{step.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: "0.75rem" }}>
                        {[{ label: "Privacy Policy", fn: () => setPrivacyOpen(true) }, { label: "Terms & Conditions", fn: () => setTermsOpen(true) }].map((item, i) => (
                          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {i > 0 && <span style={{ color: "rgba(255,255,255,0.1)", fontSize: "0.7rem" }}>·</span>}
                            <button type="button" onClick={item.fn} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.7rem", color: "rgba(255,255,255,0.25)", fontWeight: 500, padding: "0 2px", transition: "color 0.15s" }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"}>
                              {item.label}
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MOBILE multi-step wizard ── */}
              {isMobile && (
                <div>
                  {/* Step progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: "1.25rem" }}>
                    {[
                      { n: 1, label: "Service" },
                      { n: 2, label: "Date & Time" },
                      { n: 3, label: "Review" },
                    ].map(({ n, label }, idx) => {
                      const done  = mobileStep > n;
                      const active = mobileStep === n;
                      return (
                        <div key={n} style={{ display: "flex", alignItems: "center", flex: idx < 2 ? 1 : "none" }}>
                          {/* Step dot */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, fontSize: "0.75rem", flexShrink: 0,
                              background: done ? "rgba(52,211,153,0.15)" : active ? "linear-gradient(135deg,#38bdf8,#6366f1)" : "rgba(255,255,255,0.06)",
                              border: done ? "1px solid rgba(52,211,153,0.3)" : active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                              color: done ? "#34d399" : active ? "#fff" : "rgba(255,255,255,0.3)",
                              boxShadow: active ? "0 0 16px rgba(56,189,248,0.3)" : "none",
                              transition: "all 0.25s",
                              cursor: done ? "pointer" : "default",
                            }}
                              onClick={() => done && setMobileStep(n)}
                            >
                              {done ? "✓" : n}
                            </div>
                            <span style={{ fontSize: "0.6rem", fontWeight: 600, color: active ? "#38bdf8" : done ? "#34d399" : "rgba(255,255,255,0.25)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{label}</span>
                          </div>
                          {/* Connector line */}
                          {idx < 2 && (
                            <div style={{ flex: 1, height: 2, margin: "0 6px", marginBottom: 16, borderRadius: 2, background: done ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Step 1: Service ── */}
                  {mobileStep === 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div className="appt-card">
                        <div className="appt-card-header">
                          <div className="appt-step-badge"><span className="appt-step-num">1</span>Select Service</div>
                          <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: "0 0 2px" }}>Choose Treatment</p>
                          <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>Select the service you need</p>
                        </div>
                        <div style={{ padding: "0.75rem", maxHeight: 340, overflowY: "auto" }}>
                          {services.length === 0
                            ? <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><Spinner size={22} /></div>
                            : services.map(svc => {
                              const sel = selectedService?.id === svc.id;
                              return (
                                <div key={svc.id} className={`appt-service-item${sel ? " selected" : ""}`} onClick={() => setSelectedService(sel ? null : svc)}
                                  style={{ background: sel ? "rgba(56,189,248,0.1)" : undefined, color: sel ? "#fff" : "rgba(255,255,255,0.55)", border: sel ? "1px solid rgba(56,189,248,0.3)" : undefined, fontWeight: sel ? 600 : 400, fontSize: "0.84rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                    <span style={{ fontSize: "0.9rem" }}>🦷</span>{svc.name}
                                    {sel && <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "#38bdf8" }}>✓</span>}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {selectedService && (
                        <div style={{ padding: "1.25rem", borderRadius: 16, background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.12)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <div style={{ width: 3, height: 12, borderRadius: 3, background: "linear-gradient(180deg,#38bdf8,#6366f1)" }} />
                            <p style={{ fontWeight: 700, fontSize: "0.65rem", color: "#38bdf8", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>About this service</p>
                          </div>
                          <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: selectedService.description.replace(/\n/g,"<br>") }} />
                        </div>
                      )}

                      <button type="button" disabled={!selectedService}
                        onClick={() => setMobileStep(2)}
                        style={{ width: "100%", padding: "0.95rem", borderRadius: 14, border: "none", cursor: selectedService ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, transition: "all 0.2s", background: selectedService ? "linear-gradient(135deg,#38bdf8,#6366f1)" : "rgba(255,255,255,0.04)", color: selectedService ? "#fff" : "rgba(255,255,255,0.2)", boxShadow: selectedService ? "0 8px 24px rgba(56,189,248,0.25)" : "none" }}>
                        Next: Pick a Date & Time →
                      </button>
                    </div>
                  )}

                  {/* ── Step 2: Date & Time ── */}
                  {mobileStep === 2 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div className="appt-card">
                        <div className="appt-card-header">
                          <div className="appt-step-badge"><span className="appt-step-num">2</span>Date & Time</div>
                          <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: "0 0 2px" }}>Pick Your Slot</p>
                          <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>Sundays unavailable · 9 AM – 4 PM only</p>
                        </div>
                        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                          <MiniCalendar selectedDate={selectedDate} onSelect={ds => { setSelectedDate(ds); setSelectedHour(null); }} bookedTimes={bookedTimes} />
                          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                          <div>
                            <p style={{ fontWeight: 700, fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Available Times</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                              {AVAILABLE_HOURS.map(hour => {
                                const now2 = new Date(); const todayStr2 = toDateStr(now2);
                                const booked2 = !!selectedDate && bookedTimes.includes(`${selectedDate} ${String(hour).padStart(2,"0")}:00`);
                                const disabled2 = !selectedDate || booked2 || (selectedDate === todayStr2 && hour <= now2.getHours());
                                const sel2 = selectedHour === hour;
                                return (
                                  <div key={hour} onClick={() => !disabled2 && setSelectedHour(hour)}
                                    style={{ padding: "8px 4px", textAlign: "center", borderRadius: 10, cursor: disabled2 ? "not-allowed" : "pointer", fontSize: "0.72rem", fontWeight: sel2 ? 700 : 500, transition: "all 0.18s", background: sel2 ? "linear-gradient(135deg,#38bdf8,#6366f1)" : disabled2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)", color: sel2 ? "#fff" : disabled2 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)", border: sel2 ? "1px solid transparent" : `1px solid ${disabled2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)"}`, textDecoration: booked2 ? "line-through" : "none", boxShadow: sel2 ? "0 4px 12px rgba(56,189,248,0.28)" : "none" }}>
                                    {HOUR_LABELS[hour]}
                                  </div>
                                );
                              })}
                            </div>
                            {!selectedDate && <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", margin: "8px 0 0", textAlign: "center" }}>Pick a date first</p>}
                          </div>
                        </div>

                        {selectedDate && selectedHour !== null && (
                          <div style={{ margin: "0 1rem 1rem", padding: "12px 14px", borderRadius: 12, background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#38bdf8,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>📅</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 600, fontSize: "0.8rem", color: "#fff", margin: 0 }}>{new Date(selectedDate).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}</p>
                              <p style={{ fontSize: "0.7rem", color: "#38bdf8", margin: "2px 0 0", fontWeight: 600 }}>{HOUR_LABELS[selectedHour]}</p>
                            </div>
                            <span style={{ background: "rgba(52,211,153,0.08)", color: "#34d399", padding: "3px 10px", borderRadius: 50, border: "1px solid rgba(52,211,153,0.18)", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap" }}>SELECTED</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setMobileStep(1)}
                          style={{ flex: "0 0 auto", padding: "0.9rem 1.25rem", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", transition: "all 0.2s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}>
                          ← Back
                        </button>
                        <button type="button" disabled={!selectedDate || selectedHour === null}
                          onClick={() => setMobileStep(3)}
                          style={{ flex: 1, padding: "0.9rem", borderRadius: 14, border: "none", cursor: (selectedDate && selectedHour !== null) ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, transition: "all 0.2s", background: (selectedDate && selectedHour !== null) ? "linear-gradient(135deg,#38bdf8,#6366f1)" : "rgba(255,255,255,0.04)", color: (selectedDate && selectedHour !== null) ? "#fff" : "rgba(255,255,255,0.2)", boxShadow: (selectedDate && selectedHour !== null) ? "0 8px 24px rgba(56,189,248,0.25)" : "none" }}>
                          Next: Review & Confirm →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Step 3: Review + Notes + Submit ── */}
                  {mobileStep === 3 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {/* Summary card */}
                      <div className="appt-card">
                        <div className="appt-card-header">
                          <div className="appt-step-badge"><span className="appt-step-num">3</span>Review</div>
                          <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: 0 }}>Confirm Your Booking</p>
                        </div>
                        <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          {/* Service summary */}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,rgba(56,189,248,0.15),rgba(99,102,241,0.15))", border: "1px solid rgba(56,189,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>🦷</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Service</p>
                              <p style={{ fontSize: "0.84rem", color: "#fff", fontWeight: 600, margin: 0 }}>{selectedService?.name}</p>
                            </div>
                            <button type="button" onClick={() => setMobileStep(1)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(56,189,248,0.6)", fontSize: "0.7rem", fontWeight: 600, fontFamily: "inherit", padding: "4px 8px", borderRadius: 6 }}>
                              Edit
                            </button>
                          </div>
                          {/* Date/Time summary */}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,rgba(56,189,248,0.15),rgba(99,102,241,0.15))", border: "1px solid rgba(56,189,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>📅</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Date & Time</p>
                              <p style={{ fontSize: "0.84rem", color: "#fff", fontWeight: 600, margin: 0 }}>
                                {selectedDate ? new Date(selectedDate).toLocaleDateString("en-PH", { weekday: "short", month: "long", day: "numeric" }) : "—"}
                                {selectedHour !== null ? ` · ${HOUR_LABELS[selectedHour]}` : ""}
                              </p>
                            </div>
                            <button type="button" onClick={() => setMobileStep(2)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(56,189,248,0.6)", fontSize: "0.7rem", fontWeight: 600, fontFamily: "inherit", padding: "4px 8px", borderRadius: 6 }}>
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="appt-card">
                        <div className="appt-card-header">
                          <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#fff", margin: 0 }}>Additional Notes <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)", fontSize: "0.8rem" }}>(Optional)</span></p>
                        </div>
                        <div style={{ padding: "1rem 1.25rem" }}>
                          <textarea value={notes} onChange={e => setNotes(e.target.value)} onFocus={() => setNotesFocused(true)} onBlur={() => setNotesFocused(false)} rows={3}
                            placeholder="Any special requests or information for your dentist…"
                            style={{ width: "100%", padding: "0.75rem 1rem", fontSize: "0.84rem", border: `1px solid ${notesFocused ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, background: notesFocused ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", fontFamily: "inherit", resize: "vertical", outline: "none", color: "#fff", transition: "all 0.2s", boxShadow: notesFocused ? "0 0 0 3px rgba(56,189,248,0.06)" : "none" }} />
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setMobileStep(2)}
                          style={{ flex: "0 0 auto", padding: "0.9rem 1.25rem", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", transition: "all 0.2s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}>
                          ← Back
                        </button>
                        <button type="submit" disabled={submitting || !canSubmit}
                          style={{ flex: 1, padding: "0.9rem", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, transition: "all 0.2s", background: "linear-gradient(135deg,#38bdf8,#6366f1)", color: "#fff", boxShadow: "0 8px 24px rgba(56,189,248,0.25)", opacity: submitting ? 0.7 : 1 }}>
                          {submitting ? "Submitting…" : "Confirm Appointment →"}
                        </button>
                      </div>

                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
                        {[{ label: "Privacy Policy", fn: () => setPrivacyOpen(true) }, { label: "Terms & Conditions", fn: () => setTermsOpen(true) }].map((item, i) => (
                          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {i > 0 && <span style={{ color: "rgba(255,255,255,0.1)", fontSize: "0.7rem" }}>·</span>}
                            <button type="button" onClick={item.fn} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.7rem", color: "rgba(255,255,255,0.25)", fontWeight: 500, padding: "0 2px", transition: "color 0.15s" }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"}>
                              {item.label}
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </main>

        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "4rem", padding: "1.5rem", textAlign: "center", position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.15)", margin: 0 }}>© 2025 Balane-Saspa Dental Clinic — All Rights Reserved.</p>
        </footer>
      </div>

      <PolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy Policy"><PrivacyPolicyContent /></PolicyModal>
      <PolicyModal open={termsOpen}   onClose={() => setTermsOpen(false)}   title="Terms and Conditions"><TermsContent /></PolicyModal>
      <AlertDialog open={alert.open} variant={alert.variant} title={alert.title} message={alert.message} onClose={closeAlert} />
    </>
  );
}