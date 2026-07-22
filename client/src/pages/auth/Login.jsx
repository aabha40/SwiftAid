import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, getDashboardRoute } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data.user, res.data.token);
      navigate(getDashboardRoute(res.data.user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fill = (email, password) => {
    setForm({ email, password });
    setError('');
  };

  return (
    <div style={S.page}>

      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <div style={S.left}>
        {/* Gradient blobs */}
        <div style={S.blob1} />
        <div style={S.blob2} />
        <div style={S.blob3} />

        {/* Logo */}
        <div style={S.logoRow}>
          <div style={S.logoBox}>🚑</div>
          <div>
            <div style={S.logoName}>SwiftAid</div>
            <div style={S.logoTag}>Smart Emergency Dispatch</div>
          </div>
        </div>

        {/* Hero text */}
        <div style={S.hero}>
          <div style={S.liveTag}>
            <div style={S.liveDot} />
            Live dispatch · India
          </div>
          <h1 style={S.h1}>
            Emergency help,<br />
            <span style={{ color: '#e94560' }}>instantly.</span>
          </h1>
          <p style={S.heroP}>
            Redis geo-matching finds the nearest ambulance in under 5ms.
            Smart routing picks the best hospital — not just the nearest one.
          </p>

          {/* Live dispatch mini-map card */}
          <div style={S.dispatchCard}>
            <div style={S.cardTop}>
              <span style={S.cardTitle}>Live dispatch view</span>
              <span style={S.liveBadge}>
                <div style={S.liveBadgeDot} />
                3 active trips
              </span>
            </div>

            {/* Mini map */}
            <div style={S.miniMap}>
              {/* Road grid */}
              {[30, 55, 75].map(y => (
                <div key={y} style={{ ...S.roadH, top: `${y}%` }} />
              ))}
              {[30, 50, 75].map(x => (
                <div key={x} style={{ ...S.roadV, left: `${x}%` }} />
              ))}

              {/* Patient pin */}
              <div style={{ ...S.pin, ...S.pinPatient, left: '50%', top: '55%' }}>
                <div style={S.pinLabel('rgba(233,69,96,0.9)', '#e94560')}>📍 Patient</div>
              </div>

              {/* Moving ambulance */}
              <div style={{ ...S.pin, ...S.pinAmb, left: '15%', top: '55%' }} />

              {/* Route line */}
              <div style={S.routeLine} />

              {/* ETA pill */}
              <div style={S.etaPill}>ETA 4min</div>

              {/* Hospital */}
              <div style={{ ...S.pin, ...S.pinHosp, left: '75%', top: '30%' }}>
                <div style={S.pinLabel('rgba(59,130,246,0.9)', '#3b82f6')}>🏥 AIIMS</div>
              </div>

              {/* Second ambulance */}
              <div style={{ ...S.pin, ...S.pinAmb2, left: '70%', top: '75%' }} />
            </div>

            {/* Map legend */}
            <div style={S.mapLegend}>
              {[
                { color: '#e94560', label: 'Ambulance' },
                { color: 'rgba(233,69,96,0.4)', label: 'Patient' },
                { color: '#3b82f6', label: 'Hospital' },
                { color: '#10b981', label: 'Available' },
              ].map(l => (
                <div key={l.label} style={S.legendItem}>
                  <div style={{ ...S.legendDot, background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div style={S.statsRow}>
            {[
              { val: '<5ms',  lbl: 'Dispatch time' },
              { val: '1,190', lbl: 'Req/sec' },
              { val: '41ms',  lbl: 'Avg latency' },
            ].map(s => (
              <div key={s.lbl} style={S.statCard}>
                <div style={S.statVal}>{s.val}</div>
                <div style={S.statLbl}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div style={S.features}>
          {[
            { bg: 'rgba(233,69,96,0.12)',    icon: '⚡', text: 'Redis geo-matching in <5ms — 10× faster than MongoDB' },
            { bg: 'rgba(16,185,129,0.12)',   icon: '📍', text: 'Live WebSocket GPS tracking with dynamic ETA' },
            { bg: 'rgba(59,130,246,0.12)',   icon: '🏥', text: 'Hospital scored on beds, distance & specialty' },
            { bg: 'rgba(139,92,246,0.12)',   icon: '🚨', text: 'Priority queue — cardiac dispatched first' },
          ].map(f => (
            <div key={f.text} style={S.feat}>
              <div style={{ ...S.featIcon, background: f.bg }}>{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────── */}
      <div style={S.right}>
        <h2 style={S.formH}>Welcome back</h2>
        <p style={S.formS}>Sign in to your SwiftAid account</p>

        {error && <div style={S.errorBox}>⚠️ {error}</div>}

        <form onSubmit={submit}>
          {[
            { key: 'email',    label: 'Email address', type: 'email',    ph: 'you@example.com' },
            { key: 'password', label: 'Password',      type: 'password', ph: 'Your password'   },
          ].map(f => (
            <div key={f.key} style={S.field}>
              <label style={S.flabel}>{f.label}</label>
              <input
                style={S.finput}
                type={f.type}
                placeholder={f.ph}
                value={form[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                onFocus={e => e.target.style.borderColor = '#e94560'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
                required
              />
            </div>
          ))}

          <button
            style={{ ...S.sbtn, opacity: loading ? 0.7 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={S.spinner} /> Signing in...
                </span>
              : '→ Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div style={S.divRow}>
          <div style={S.divLine} />
          <span style={S.divText}>Demo credentials</span>
          <div style={S.divLine} />
        </div>

        {/* Demo buttons */}
        <div style={S.demoGrid}>
          {[
            { label: '🏥 Patient',    email: 'rahul@gmail.com',        pw: 'password123',  color: '#e94560', bg: 'rgba(233,69,96,0.07)',   border: 'rgba(233,69,96,0.35)'   },
            { label: '🚑 Driver',     email: 'ramesh@swiftaid.com',    pw: 'driver123',    color: '#10b981', bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.35)'  },
            { label: '🏨 Hospital',   email: 'hospital@swiftaid.com',  pw: 'hospital123',  color: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.35)'  },
          ].map(d => (
            <button
              key={d.label}
              onClick={() => fill(d.email, d.pw)}
              style={{ ...S.demoBtn, color: d.color, background: d.bg, borderColor: d.border }}
            >
              {d.label}
            </button>
          ))}
          {/* Super Admin full width */}
          <button
            onClick={() => fill('admin@swiftaid.com', 'admin123')}
            style={{ ...S.demoBtn, gridColumn: 'span 3', color: '#8b5cf6', background: 'rgba(139,92,246,0.07)', borderColor: 'rgba(139,92,246,0.35)' }}
          >
            ⚙️ Super Admin
          </button>
        </div>

        <p style={S.regLink}>
          No account?{' '}
          <Link to="/register" style={{ color: '#e94560', textDecoration: 'none', fontWeight: 500 }}>
            Create one here
          </Link>
        </p>

        <div style={S.security}>
          🔒 JWT secured · Rate limited · 4-role RBAC
        </div>
      </div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  page: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    minHeight: '100vh',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: '#0a0e1a',
  },

  // Left
  left: {
    background: 'linear-gradient(160deg, #0f0c1d 0%, #1a0a2e 40%, #0a1828 100%)',
    padding: '36px 40px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  blob1: { position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: 'rgba(233,69,96,0.07)', top: -100, left: -100, filter: 'blur(70px)', pointerEvents: 'none' },
  blob2: { position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(139,92,246,0.07)', bottom: -60, right: 20, filter: 'blur(70px)', pointerEvents: 'none' },
  blob3: { position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: 'rgba(16,185,129,0.05)', top: '40%', right: 80, filter: 'blur(50px)', pointerEvents: 'none' },

  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'auto', position: 'relative', zIndex: 1 },
  logoBox: { width: 44, height: 44, background: '#e94560', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
  logoName: { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  logoTag:  { fontSize: 11, color: '#475569', marginTop: 2 },

  hero: { position: 'relative', zIndex: 1, margin: '28px 0' },
  liveTag: {
    fontSize: 11, color: '#e94560',
    textTransform: 'uppercase', letterSpacing: '0.14em',
    fontWeight: 600, marginBottom: 14,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#e94560',
    animation: 'blink 1.5s infinite',
  },
  h1: {
    fontSize: 38, fontWeight: 700,
    color: '#f1f5f9', lineHeight: 1.15,
    margin: '0 0 14px',
  },
  heroP: {
    fontSize: 13, color: '#64748b',
    lineHeight: 1.7, margin: '0 0 22px',
    maxWidth: 320,
  },

  // Dispatch card
  dispatchCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' },
  liveBadge: {
    fontSize: 10, color: '#34d399',
    background: 'rgba(52,211,153,0.12)',
    border: '0.5px solid rgba(52,211,153,0.25)',
    borderRadius: 20, padding: '2px 8px',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  liveBadgeDot: { width: 5, height: 5, borderRadius: '50%', background: '#34d399', animation: 'blink 1.2s infinite' },

  // Mini map
  miniMap: {
    background: 'rgba(8,16,31,0.8)',
    borderRadius: 8, padding: 12,
    position: 'relative', height: 110, overflow: 'hidden',
  },
  roadH: { position: 'absolute', left: 0, right: 0, height: 1, background: 'rgba(30,58,94,0.8)' },
  roadV: { position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(30,58,94,0.8)' },
  pin: { position: 'absolute', width: 10, height: 10, borderRadius: '50%', transform: 'translate(-50%, -50%)' },
  pinPatient: { background: '#e94560', boxShadow: '0 0 0 4px rgba(233,69,96,0.2), 0 0 12px rgba(233,69,96,0.4)' },
  pinHosp: { background: '#3b82f6', boxShadow: '0 0 8px rgba(59,130,246,0.5)' },
  pinAmb: {
    background: '#e94560',
    animation: 'moveAmb 4s linear infinite',
  },
  pinAmb2: { background: '#10b981', animation: 'moveAmb2 5s linear infinite' },
  routeLine: {
    position: 'absolute', top: '55%',
    left: '15%', right: '50%',
    height: 1.5, background: 'rgba(233,69,96,0.4)',
    animation: 'routeGrow 4s linear infinite',
  },
  etaPill: {
    position: 'absolute',
    background: '#131c2e',
    border: '0.5px solid #e94560',
    borderRadius: 4, padding: '2px 7px',
    fontSize: 9, color: '#e94560', fontWeight: 500,
    animation: 'etaMove 4s linear infinite',
    whiteSpace: 'nowrap',
  },
  pinLabel: (bg, color) => ({
    position: 'absolute', bottom: 13,
    left: '50%', transform: 'translateX(-50%)',
    whiteSpace: 'nowrap', fontSize: 8,
    color, background: bg,
    padding: '1px 4px', borderRadius: 3,
  }),
  mapLegend: { display: 'flex', justifyContent: 'space-between', marginTop: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#475569' },
  legendDot: { width: 5, height: 5, borderRadius: '50%' },

  // Stats
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 },
  statCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '10px 12px',
  },
  statVal: { fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
  statLbl: { fontSize: 10, color: '#475569', marginTop: 2 },

  // Features
  features: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 9 },
  feat: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' },
  featIcon: { width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 },

  // Right
  right: {
    background: '#0d1526',
    borderLeft: '1px solid rgba(255,255,255,0.05)',
    padding: '40px 32px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  formH: { fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' },
  formS: { fontSize: 13, color: '#475569', margin: '0 0 22px' },
  errorBox: {
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.1)',
    color: '#f87171',
    border: '0.5px solid rgba(239,68,68,0.2)',
    borderRadius: 8, fontSize: 12, marginBottom: 12,
  },
  field: { marginBottom: 14 },
  flabel: { display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 },
  finput: {
    width: '100%', padding: '11px 14px',
    background: '#131c2e',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 9, color: '#f1f5f9',
    fontSize: 14, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  sbtn: {
    width: '100%', padding: '13px',
    background: '#e94560', border: 'none',
    borderRadius: 9, color: 'white',
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    marginTop: 6, transition: 'opacity 0.15s, transform 0.1s',
    letterSpacing: '0.01em',
  },
  spinner: {
    display: 'inline-block', width: 16, height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: 'white', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  divRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' },
  divLine: { flex: 1, height: 0.5, background: 'rgba(255,255,255,0.06)' },
  divText: { fontSize: 10, color: '#2d3f5a', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' },
  demoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 18 },
  demoBtn: {
    padding: '9px 4px', borderRadius: 8,
    border: '0.5px solid', background: 'transparent',
    cursor: 'pointer', fontSize: 11,
    fontWeight: 600, fontFamily: 'inherit',
    transition: 'opacity 0.15s', textAlign: 'center',
  },
  regLink: { textAlign: 'center', fontSize: 12, color: '#475569' },
  security: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 16, fontSize: 11, color: '#2d3f5a',
  },
};