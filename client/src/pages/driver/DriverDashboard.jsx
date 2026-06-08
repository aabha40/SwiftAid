import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import api from '../../api/axios';
import io from 'socket.io-client';

export default function DriverDashboard() {
  const token = localStorage.getItem('swiftaid_token');
  const [ambulance, setAmbulance] = useState(null);
  const [status, setStatus] = useState('offline');
  const [location, setLocation] = useState({ lat: 21.2514, lng: 81.6296 });
  const [updating, setUpdating] = useState(false);
  const [stats, setStats] = useState({ trips: 0, distance: 0, avgEta: 0 });
  const socketRef = useRef(null);
const intervalRef = useRef(null);
// Cleanup on unmount
useEffect(() => {
  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (socketRef.current) socketRef.current.disconnect();
  };
}, []);

  useEffect(() => {
    fetchAmbulance();
    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  const fetchAmbulance = async () => {
    try {
      const res = await api.get('/ambulances/my');
      setAmbulance(res.data.ambulance);
      setStatus(res.data.ambulance.status);
    } catch {}
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await api.patch('/ambulances/status', {
        status: newStatus,
        longitude: location.lng,
        latitude: location.lat,
      });
      setStatus(newStatus);
      setAmbulance(prev => ({ ...prev, status: newStatus }));

      // Connect socket when going available
      if (newStatus === 'available') {
  // Disconnect existing socket first
  if (socketRef.current) socketRef.current.disconnect();
  if (intervalRef.current) clearInterval(intervalRef.current);

  socketRef.current = io('http://localhost:5000', { auth: { token: `Bearer ${token}` } });

  socketRef.current.on('connect', () => {
    console.log('Driver socket connected');
    // Start heartbeat — store interval so we can clear it
    intervalRef.current = setInterval(() => {
      socketRef.current?.emit('heartbeat', { ambulanceId: ambulance?._id });
    }, 30000);
  });

  socketRef.current.on('connect_error', (err) => {
    console.warn('Driver socket error:', err.message);
  });
}

// When going offline — disconnect socket and clear heartbeat
if (newStatus === 'offline') {
  if (intervalRef.current) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
  if (socketRef.current) {
    socketRef.current.disconnect();
    socketRef.current = null;
  }
}
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const statusConfig = {
    available: { color: '#10b981', label: 'Available', icon: '✅' },
    busy: { color: '#f97316', label: 'On Trip', icon: '🚑' },
    offline: { color: '#64748b', label: 'Offline', icon: '⭕' },
  };

  const cfg = statusConfig[status] || statusConfig.offline;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0e1a' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Driver console</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Manage your availability and trips</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          {[
            { label: 'Trips today', value: ambulance?.totalTripsCompleted || 0, icon: '🚑', color: '#e94560' },
            { label: 'Status', value: cfg.label, icon: cfg.icon, color: cfg.color },
            { label: 'Vehicle', value: ambulance?.vehicleNumber || '—', icon: '🔢', color: '#3b82f6' },
          ].map(s => (
            <div key={s.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '28px' }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: s.color, marginTop: '2px' }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Status toggle */}
            <div className="card">
              <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>My status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { value: 'available', label: '🟢 Go online', desc: 'Start accepting requests', color: '#10b981' },
                  { value: 'offline', label: '⭕ Go offline', desc: 'Stop accepting requests', color: '#64748b' },
                ].map(s => (
                  <button key={s.value} disabled={updating || status === s.value}
                    onClick={() => updateStatus(s.value)}
                    style={{
                      padding: '14px', borderRadius: '10px', border: `1px solid ${status === s.value ? s.color + '60' : 'rgba(255,255,255,0.06)'}`,
                      background: status === s.value ? s.color + '15' : 'rgba(255,255,255,0.02)',
                      color: status === s.value ? s.color : '#64748b', cursor: status === s.value ? 'default' : 'pointer',
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.label}</div>
                    <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Ambulance details */}
            {ambulance && (
              <div className="card">
                <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Ambulance info</h3>
                {[
                  { label: 'Vehicle no.', value: ambulance.vehicleNumber },
                  { label: 'Type', value: ambulance.ambulanceType },
                  { label: 'Last active', value: ambulance.lastActiveAt ? new Date(ambulance.lastActiveAt).toLocaleTimeString() : 'Never' },
                  { label: 'Total trips', value: ambulance.totalTripsCompleted },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>{r.label}</span>
                    <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>How it works</h3>
            {[
              { step: '1', title: 'Go online', desc: 'Click "Go online" to start receiving emergency requests. Your location is added to the dispatch pool.', color: '#10b981' },
              { step: '2', title: 'Receive request', desc: 'When a patient nearby submits an emergency, our system automatically assigns you based on proximity and priority.', color: '#3b82f6' },
              { step: '3', title: 'Navigate to patient', desc: 'Your location updates in real-time. The patient sees you moving on their map with live ETA.', color: '#8b5cf6' },
              { step: '4', title: 'Update trip status', desc: 'Use the API (or mobile app in Phase 7) to update status: accepted → en_route → arrived → completed.', color: '#f97316' },
              { step: '5', title: 'Complete trip', desc: 'When trip is completed, your ambulance becomes available again automatically.', color: '#e94560' },
            ].map(s => (
              <div key={s.step} style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: s.color + '20', border: `2px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: s.color, flexShrink: 0 }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '2px' }}>{s.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}