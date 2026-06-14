import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import api from '../../api/axios';
import { useGlobalTab } from '../../components/Sidebar';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab] = useGlobalTab('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  fetchAll();
  // Auto-refresh every 30 seconds
  const interval = setInterval(fetchAll, 30000);
  return () => clearInterval(interval); // cleanup on unmount
}, []);

  const fetchAll = async () => {
    try {
      const [statsRes, ambRes, hosRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/ambulances'),
        api.get('/admin/hospitals'),
      ]);
      setStats(statsRes.data.stats);
      setAmbulances(ambRes.data.ambulances);
      setHospitals(hosRes.data.hospitals);
    } catch {} finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users);
    } catch {}
  };

  useEffect(() => { if (tab === 'users') fetchUsers(); }, [tab]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0e1a' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Admin dashboard</h1>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>System overview and management</p>
          </div>
          <button onClick={fetchAll} className="btn btn-ghost" style={{ padding: '8px 16px' }}>🔄 Refresh</button>
        </div>

        
        {/* OVERVIEW */}
        {tab === 'overview' && stats && (
          <div className="fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Total users', value: stats.totalUsers, icon: '👥', color: '#3b82f6' },
                { label: 'Total ambulances', value: stats.totalAmbulances, icon: '🚑', color: '#e94560' },
                { label: 'Available now', value: stats.availableAmbulances, icon: '✅', color: '#10b981' },
                { label: 'On trips', value: stats.busyAmbulances, icon: '🛣️', color: '#f97316' },
                { label: 'Hospitals', value: stats.totalHospitals, icon: '🏥', color: '#8b5cf6' },
                { label: 'Active requests', value: stats.activeRequests, icon: '🚨', color: '#e94560' },
              ].map(s => (
                <div key={s.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ fontSize: '32px' }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Fleet status breakdown */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Fleet status breakdown</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {[
                  { label: 'Available', count: stats.availableAmbulances, color: '#10b981' },
                  { label: 'On trips', count: stats.busyAmbulances, color: '#f97316' },
                  { label: 'Offline', count: stats.totalAmbulances - stats.availableAmbulances - stats.busyAmbulances, color: '#64748b' },
                ].map(s => (
                  <div key={s.label} style={{ flex: s.count || 0.1, height: '32px', background: s.color + '30', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: s.color, fontWeight: 600, minWidth: '60px' }}>
                    {s.count} {s.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FLEET */}
        {tab === 'fleet' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ambulances.map(a => (
              <div key={a._id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>{a.vehicleNumber}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textTransform: 'capitalize' }}>{a.ambulanceType} type</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Driver</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>{a.driverId?.name || 'Unassigned'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Trips completed</div>
                  <div style={{ fontSize: '13px', color: '#f1f5f9', marginTop: '2px' }}>{a.totalTripsCompleted}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge badge-${a.status}`}>{a.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HOSPITALS */}
        {tab === 'hospitals' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {hospitals.map(h => {
              const pct = Math.round((h.availableBeds / h.totalBeds) * 100);
              return (
                <div key={h._id} className="card">
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>{h.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{h.address?.city}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Available beds</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: pct > 30 ? '#10b981' : '#f97316' }}>{h.availableBeds}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Total beds</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>{h.totalBeds}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                        background: h.isAcceptingEmergencies ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: h.isAcceptingEmergencies ? '#34d399' : '#f87171' }}>
                        {h.isAcceptingEmergencies ? '✅ Accepting' : '🔴 Not accepting'}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 30 ? '#10b981' : pct > 10 ? '#f97316' : '#e94560', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map(u => (
              <div key={u._id} className="card card-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#8b5cf620', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#8b5cf6', flexShrink: 0 }}>
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>{u.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{u.phone}</div>
                <div>
                  <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', textTransform: 'capitalize' }}>
                    {u.role?.replace('_', ' ')}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600,
                    background: u.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: u.isActive ? '#34d399' : '#f87171' }}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}