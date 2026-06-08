import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'patient' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, getDashboardRoute } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', form);
      login(res.data.user, res.data.token);
      navigate(getDashboardRoute(res.data.user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: 'name', label: 'Full name', type: 'text', placeholder: 'Your full name' },
    { key: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '10-digit mobile number' },
    { key: 'password', label: 'Password', type: 'password', placeholder: 'Minimum 6 characters' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🚑</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9' }}>Create account</h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Join SwiftAid today</p>
        </div>

        <div className="card">
          <form onSubmit={submit}>
            {fields.map(f => (
              <div className="input-group" key={f.key}>
                <label className="input-label">{f.label}</label>
                <input className="input" type={f.type} placeholder={f.placeholder}
                  value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required />
              </div>
            ))}
            <div className="input-group">
              <label className="input-label">I am a</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="patient">🏥 Patient</option>
                <option value="driver">🚑 Ambulance Driver</option>
                <option value="hospital_admin">🏨 Hospital Admin</option>
              </select>
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            <button className="btn btn-danger btn-block" type="submit" disabled={loading} style={{ padding: '14px' }}>
              {loading ? <><div className="spinner spinner-sm" /> Creating...</> : '→ Create account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#64748b' }}>
            Already registered? <Link to="/login" style={{ color: '#e94560', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}