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
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      {/* Left panel */}
      <div style={S.left}>
        <div style={S.hero}>
          <div style={S.heroIcon}>🚑</div>
          <h1 style={S.heroTitle}>SwiftAid</h1>
          <p style={S.heroSub}>Smart Emergency Ride Allocation System</p>
          <div style={S.features}>
            {['⚡ Real-time ambulance tracking', '🗺️ Geo-based smart matching', '🏥 Hospital availability routing', '🚨 Priority-based dispatch'].map(f => (
              <div key={f} style={S.feature}>{f}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={S.right}>
        <div style={S.formBox} className="fade-in">
          <div style={S.formHeader}>
            <h2 style={S.formTitle}>Welcome back</h2>
            <p style={S.formSub}>Sign in to your account</p>
          </div>

          <form onSubmit={submit}>
            <div className="input-group">
              <label className="input-label">Email address</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" placeholder="Your password"
                value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            <button className="btn btn-danger btn-block" type="submit" disabled={loading} style={{ marginTop: '8px', padding: '14px' }}>
              {loading ? <><div className="spinner spinner-sm" /> Signing in...</> : '→ Sign in'}
            </button>
          </form>

          <p style={S.switchText}>
            No account? <Link to="/register" style={{ color: '#e94560', textDecoration: 'none' }}>Create one here</Link>
          </p>

          {/* Demo credentials */}
          <div style={S.demo}>
            <div style={S.demoTitle}>Demo credentials</div>
            {[
              { role: 'Patient', email: 'rahul@gmail.com', pw: 'password123', color: '#e94560' },
              { role: 'Driver', email: 'ramesh@swiftaid.com', pw: 'driver123', color: '#10b981' },
              { role: 'Admin', email: 'admin@swiftaid.com', pw: 'admin123', color: '#8b5cf6' },
            ].map(d => (
              <button key={d.role} onClick={() => setForm({ email: d.email, password: d.pw })}
                style={{ ...S.demoBtn, borderColor: d.color + '40', color: d.color }}>
                {d.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'flex' },
  left: { flex: 1, background: 'linear-gradient(135deg, #0a0e1a 0%, #131c2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', borderRight: '1px solid rgba(255,255,255,0.05)' },
  hero: { maxWidth: '400px' },
  heroIcon: { fontSize: '64px', marginBottom: '16px' },
  heroTitle: { fontSize: '42px', fontWeight: 800, color: '#f1f5f9', marginBottom: '8px' },
  heroSub: { fontSize: '16px', color: '#64748b', marginBottom: '36px', lineHeight: 1.5 },
  features: { display: 'flex', flexDirection: 'column', gap: '12px' },
  feature: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#94a3b8', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' },
  right: { width: '460px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: '#0a0e1a' },
  formBox: { width: '100%', maxWidth: '380px' },
  formHeader: { marginBottom: '28px' },
  formTitle: { fontSize: '26px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' },
  formSub: { fontSize: '14px', color: '#64748b' },
  switchText: { textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#64748b' },
  demo: { marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' },
  demoTitle: { fontSize: '11px', color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  demoBtn: { padding: '6px 12px', borderRadius: '8px', border: '1px solid', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: 500, marginRight: '8px' },
};