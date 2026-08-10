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
  const [activeRequest, setActiveRequest] = useState(null); // the patient's request tied to currentTripId
  const [advancing, setAdvancing] = useState(false);
  
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

      // If currently on a trip, fetch the underlying request so we know
      // the patient's info and exactly which status step we're on.
      if (res.data.ambulance.currentTripId?.requestId) {
        try {
          const reqRes = await api.get(`/requests/${res.data.ambulance.currentTripId.requestId}`);
          setActiveRequest(reqRes.data.request);
        } catch {
          setActiveRequest(null);
        }
      } else {
        setActiveRequest(null);
      }
    } catch {}
  };

  // Poll for a newly-assigned trip while online — the driver has no
  // socket event telling them "you've been assigned," so this is a
  // simple, reliable way to notice a new trip without a page refresh.
  useEffect(() => {
    if (status !== 'available' && status !== 'busy') return;
    const interval = setInterval(fetchAmbulance, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Trip status progression ──────────────────────────────────────
  const TRIP_STEPS = [
    { value: 'accepted', label: 'Accept trip', desc: "Confirm you're heading to the patient" },
    { value: 'en_route', label: 'Start driving', desc: 'Mark yourself as en route' },
    { value: 'arrived', label: 'Mark arrived', desc: "You've reached the patient" },
    { value: 'hospital_bound', label: 'Heading to hospital', desc: 'Patient is in the vehicle' },
    { value: 'completed', label: 'Complete trip', desc: 'Patient has been delivered' },
  ];

  const advanceStatus = async (newStatus) => {
    if (!activeRequest) return;
    setAdvancing(true);
    try {
      await api.patch(`/requests/${activeRequest._id}/status`, { status: newStatus });
      if (newStatus === 'completed') {
        // Ambulance frees up automatically on the backend — refetch
        // everything since currentTripId is now cleared.
        setActiveRequest(null);
        await fetchAmbulance();
      } else {
        setActiveRequest((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update trip status');
    } finally {
      setAdvancing(false);
    }
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

  socketRef.current = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', { auth: { token: `Bearer ${token}` } });

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

            {/* Active trip — patient info + step buttons */}
            {activeRequest && (
              <div className="card" style={{ border: '1px solid rgba(233,69,96,0.3)' }}>
                <h3 style={{ fontSize: '13px', color: '#e94560', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
                  🚨 Active trip
                </h3>
                <div style={{ marginBottom: '4px', fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                  {activeRequest.patientId?.name || 'Patient'}
                </div>
                {activeRequest.patientId?.phone && (
                  <a href={`tel:${activeRequest.patientId.phone}`} style={{ fontSize: '12px', color: '#34d399', textDecoration: 'none' }}>
                    📞 {activeRequest.patientId.phone}
                  </a>
                )}
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#94a3b8' }}>
                  {activeRequest.emergencyType?.toUpperCase()} · Priority {activeRequest.priorityScore}
                </div>
                {activeRequest.description && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                    "{activeRequest.description}"
                  </div>
                )}

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {TRIP_STEPS.map((step) => {
                    const stepOrder = ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'hospital_bound', 'completed'];
                    const currentIdx = stepOrder.indexOf(activeRequest.status);
                    const thisIdx = stepOrder.indexOf(step.value);
                    const isDone = thisIdx <= currentIdx;
                    const isNext = thisIdx === currentIdx + 1;

                    return (
                      <button
                        key={step.value}
                        disabled={!isNext || advancing}
                        onClick={() => advanceStatus(step.value)}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          border: `1px solid ${isDone ? 'rgba(16,185,129,0.4)' : isNext ? 'rgba(233,69,96,0.4)' : 'rgba(255,255,255,0.06)'}`,
                          background: isDone ? 'rgba(16,185,129,0.08)' : isNext ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
                          color: isDone ? '#34d399' : isNext ? '#f1f5f9' : '#475569',
                          cursor: isNext && !advancing ? 'pointer' : 'default',
                          textAlign: 'left',
                          opacity: isNext ? 1 : isDone ? 0.8 : 0.5,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>
                          {isDone ? '✓ ' : ''}{step.label}
                        </div>
                        {isNext && <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>{step.desc}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
              { step: '4', title: 'Update trip status', desc: 'Use the step buttons in the Active Trip card to progress: accepted → en route → arrived → hospital bound → completed.', color: '#f97316' },
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