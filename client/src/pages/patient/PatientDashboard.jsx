import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import io from 'socket.io-client';
import Sidebar from '../../components/Sidebar';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useGlobalTab } from '../../components/Sidebar';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const ambulanceIcon = new L.DivIcon({
  html: `<div style="background:#e94560;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 4px 12px rgba(233,69,96,0.4)">🚑</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], className: '',
});

const patientIcon = new L.DivIcon({
  html: `<div style="background:#10b981;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 4px 12px rgba(16,185,129,0.4)">📍</div>`,
  iconSize: [36, 36], iconAnchor: [18, 36], className: '',
});

const hospitalIcon = new L.DivIcon({
  html: `<div style="background:#3b82f6;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 4px 12px rgba(59,130,246,0.4)">🏥</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], className: '',
});

const EMERGENCY_TYPES = [
  { value: 'cardiac', label: '❤️ Cardiac arrest', color: '#e94560' },
  { value: 'trauma', label: '🩹 Trauma / accident', color: '#f97316' },
  { value: 'respiratory', label: '🫁 Respiratory', color: '#8b5cf6' },
  { value: 'general', label: '🏥 General emergency', color: '#3b82f6' },
  { value: 'non_emergency', label: '💊 Non-emergency', color: '#64748b' },
];

const STATUS_STEPS = ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'hospital_bound', 'completed'];
const STATUS_LABELS = { pending: 'Pending', assigned: 'Assigned', accepted: 'Accepted', en_route: 'En route', arrived: 'Arrived', hospital_bound: 'To hospital', completed: 'Completed' };

export default function PatientDashboard() {
  const { user } = useAuth();
  const token = localStorage.getItem('swiftaid_token');

 const [tab, setTab] = useGlobalTab('request');
  const [emergencyType, setEmergencyType] = useState('cardiac');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRequest, setActiveRequest] = useState(null);
  const [ambulancePos, setAmbulancePos] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [eta, setEta] = useState(null);
  const [firstAid, setFirstAid] = useState(null); // { severityLevel, suspectedCondition, steps }
  const socketRef = useRef(null);

  // Get GPS location
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocation({ lat: 21.2514, lng: 81.6296 }) // Raipur fallback
    );
  }, []);

  // Connect socket when active request exists
  useEffect(() => {
  if (!activeRequest?.tripId) return;

  // Disconnect any existing connection first
  if (socketRef.current) socketRef.current.disconnect();

  socketRef.current = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
    auth: { token: `Bearer ${token}` },
  });

  socketRef.current.on('connect', () => {
    socketRef.current.emit('join_trip', { tripId: activeRequest.tripId });
  });

  socketRef.current.on('ambulance_location', (data) => {
    setAmbulancePos({ lat: data.latitude, lng: data.longitude });
    if (data.etaMinutes) setEta(data.etaMinutes);
  });

  socketRef.current.on('first_aid_instructions', (data) => {
    setFirstAid(data);
  });

  socketRef.current.on('trip_status_update', (data) => {
    setActiveRequest(prev => ({ ...prev, status: data.status }));
    // If trip completed, show completion message
    if (data.status === 'completed') {
      setEta(0);
    }
  });

  socketRef.current.on('connect_error', (err) => {
    console.warn('Socket connection error:', err.message);
  });

  // Always disconnect on cleanup
  return () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };
}, [activeRequest?.tripId]);

  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);

const getLocation = () => new Promise((resolve) => {
  if (!navigator.geolocation) {
    setUsingFallbackLocation(true);
    return resolve({ lat: 21.2514, lng: 81.6296 });
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      setUsingFallbackLocation(false);
      resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    () => {
      setUsingFallbackLocation(true);
      resolve({ lat: 21.2514, lng: 81.6296 }); // Raipur fallback
    },
    { timeout: 5000 }
  );
});

  const requestAmbulance = async () => {
    setError('');
    setLoading(true);
    setFirstAid(null);
    try {
      const loc = await getLocation();
      setLocation(loc);
      const res = await api.post('/requests', {
        emergencyType,
        longitude: loc.lng,
        latitude: loc.lat,
        description,
      });
      // BUGFIX: this used to hardcode status: 'assigned' regardless of
      // what actually happened — even a 202 (queued) response was shown
      // to the patient as if an ambulance had been assigned. Use the
      // real status the backend returned instead.
      setActiveRequest({ ...res.data.data, status: res.data.data.status || (res.status === 202 ? 'pending' : 'assigned') });
      if (res.data.data.aiTriage?.firstAidSteps?.length > 0) {
        setFirstAid({
          severityLevel: res.data.data.aiTriage.severityLevel,
          suspectedCondition: res.data.data.aiTriage.suspectedCondition,
          steps: res.data.data.aiTriage.firstAidSteps,
        });
      }
      setEta(res.data.data.ambulance?.etaMinutes);
      setTab('track');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request ambulance');
    } finally {
      setLoading(false);
    }
  };

  // ── Resume an in-progress request on page load ──────────────────
  // Without this, refreshing the browser (or opening the app fresh
  // after already having an active request) shows nothing — all the
  // trip/first-aid state above only lived in memory. This fetches
  // whatever the patient's actual most recent non-finished request
  // is and rebuilds the UI from real backend data instead.
  const TERMINAL_STATUSES = ['completed', 'cancelled', 'failed'];

  useEffect(() => {
    const resumeActiveRequest = async () => {
      try {
        const res = await api.get('/requests/my');
        const active = res.data.requests?.find((r) => !TERMINAL_STATUSES.includes(r.status));
        if (!active) return;

        const detail = await api.get(`/requests/${active._id}`);
        const req = detail.data.request;
        const trip = detail.data.trip;

        setActiveRequest({
          requestId: req._id,
          tripId: trip?.tripId,
          status: req.status,
          priorityScore: req.priorityScore,
          ambulance: req.assignedAmbulanceId
            ? {
                vehicleNumber: req.assignedAmbulanceId.vehicleNumber,
                driver: req.assignedAmbulanceId.driverId
                  ? { name: req.assignedAmbulanceId.driverId.name, phone: req.assignedAmbulanceId.driverId.phone }
                  : null,
                etaMinutes: trip?.etaMinutes,
              }
            : null,
          hospital: req.assignedHospitalId
            ? {
                name: req.assignedHospitalId.name,
                address: req.assignedHospitalId.address,
                phone: req.assignedHospitalId.phone,
                availableBeds: req.assignedHospitalId.availableBeds,
                latitude: req.assignedHospitalId.location?.coordinates?.[1],
                longitude: req.assignedHospitalId.location?.coordinates?.[0],
              }
            : null,
        });

        if (req.firstAidSteps?.length > 0) {
          setFirstAid({
            severityLevel: req.aiSeverityLevel,
            suspectedCondition: req.aiSuspectedCondition,
            steps: req.firstAidSteps,
          });
        }

        if (trip?.etaMinutes) setEta(trip.etaMinutes);
        setTab('track');
      } catch {
        // No active request, or not logged in yet — nothing to resume
      }
    };

    resumeActiveRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMyRequests = async () => {
    try {
      const res = await api.get('/requests/my');
      setMyRequests(res.data.requests);
    } catch {}
  };

  useEffect(() => { if (tab === 'history') fetchMyRequests(); }, [tab]);

  const currentStepIndex = activeRequest ? STATUS_STEPS.indexOf(activeRequest.status) : -1;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0e1a' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>
              Good {new Date().getHours() < 12 ? 'morning' : 'evening'}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Stay safe. Help is one tap away.</p>
          </div>
        </div>

        {/* REQUEST TAB */}
        {tab === 'request' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="fade-in">
            <div>
              <div className="card" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Select emergency type</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {EMERGENCY_TYPES.map(t => (
                    <button key={t.value} onClick={() => setEmergencyType(t.value)} style={{
                      padding: '12px 16px', borderRadius: '10px', border: `1px solid`,
                      borderColor: emergencyType === t.value ? t.color : 'rgba(255,255,255,0.06)',
                      background: emergencyType === t.value ? t.color + '15' : 'rgba(255,255,255,0.02)',
                      color: emergencyType === t.value ? t.color : '#94a3b8',
                      cursor: 'pointer', textAlign: 'left', fontSize: '13px', fontWeight: emergencyType === t.value ? 600 : 400,
                      transition: 'all 0.15s',
                    }}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="card">
                <label className="input-label">Additional notes (optional)</label>
                <textarea className="input" rows={3} placeholder="Describe the emergency..."
                  value={description} onChange={e => setDescription(e.target.value)}
                  style={{ resize: 'none', marginBottom: '12px' }} />

                {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>⚠️ {error}</div>}

                <button className="btn btn-danger btn-block" onClick={requestAmbulance}
                  disabled={loading} style={{ padding: '16px', fontSize: '15px' }}>
                  {loading ? <><div className="spinner spinner-sm" /> Finding nearest ambulance...</> : '🚨 Request Emergency Ambulance'}
                </button>
                <p style={{ fontSize: '11px', color: '#475569', textAlign: 'center', marginTop: '8px' }}>
                  Max 5 requests per minute • Call 108 if system fails
                </p>
              </div>
            </div>

            {/* Map */}
            <div className="card" style={{ padding: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '10px', paddingLeft: '4px' }}>YOUR LOCATION</h3>
              <div style={{ height: '460px', borderRadius: '10px', overflow: 'hidden' }}>
                {location && (
                  <MapContainer center={[location.lat, location.lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[location.lat, location.lng]} icon={patientIcon}>
                      <Popup>📍 Your location</Popup>
                    </Marker>
                  </MapContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TRACK TAB */}
        {tab === 'track' && (
          <div className="fade-in">
            {!activeRequest ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗺️</div>
                <h3 style={{ color: '#f1f5f9', marginBottom: '8px' }}>No active trip</h3>
                <p style={{ color: '#64748b', fontSize: '14px' }}>Request an ambulance to track it here</p>
                <button className="btn btn-danger" onClick={() => setTab('request')} style={{ marginTop: '16px' }}>Make a request</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
                {/* Info panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* ETA */}
                  <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', fontWeight: 800, color: '#e94560', lineHeight: 1 }}>{eta || activeRequest.ambulance?.etaMinutes || '—'}</div>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>minutes away</div>
                    <span className={`badge badge-${activeRequest.status}`}>
                      {STATUS_LABELS[activeRequest.status] || activeRequest.status}
                    </span>
                  </div>

                  {/* Progress */}
                  <div className="card">
                    <h4 style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trip progress</h4>
                    {STATUS_STEPS.slice(0, 6).map((step, i) => (
                      <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                          background: i <= currentStepIndex ? '#e94560' : 'rgba(255,255,255,0.05)',
                          border: `2px solid ${i <= currentStepIndex ? '#e94560' : 'rgba(255,255,255,0.1)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', color: 'white', fontWeight: 600,
                        }}>
                          {i <= currentStepIndex ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: '13px', color: i === currentStepIndex ? '#f1f5f9' : '#64748b', fontWeight: i === currentStepIndex ? 600 : 400 }}>
                          {STATUS_LABELS[step]}
                        </span>
                        {i === currentStepIndex && <div className="pulse-dot" style={{ marginLeft: 'auto' }} />}
                      </div>
                    ))}
                  </div>

                  {/* AI First-Aid instructions */}
                  {firstAid?.steps?.length > 0 && (
                    <div className="card" style={{ border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.06)' }}>
                      <h4 style={{ fontSize: '12px', color: '#eab308', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        ⚡ While you wait{firstAid.suspectedCondition ? ` — ${firstAid.suspectedCondition}` : ''}
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {firstAid.steps.map((step, i) => (
                          <li key={i} style={{ fontSize: '13px', color: '#f1f5f9', lineHeight: 1.4 }}>{step}</li>
                        ))}
                      </ul>
                      <p style={{ fontSize: '10px', color: '#64748b', marginTop: '10px' }}>
                        AI-generated guidance — not a substitute for professional medical advice.
                      </p>
                    </div>
                  )}

                  {/* Ambulance info */}
                  {activeRequest.ambulance && (
                    <div className="card">
                      <h4 style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ambulance details</h4>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>{activeRequest.ambulance.vehicleNumber}</div>
                      {activeRequest.ambulance.driver && (
                        <>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Driver: {activeRequest.ambulance.driver.name}</div>
                          <a href={`tel:${activeRequest.ambulance.driver.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '8px 14px', background: 'rgba(16,185,129,0.1)', color: '#34d399', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}>
                            📞 Call driver
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  {/* Hospital info */}
                  {activeRequest.hospital && (
                    <div className="card">
                      <h4 style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned hospital</h4>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>{activeRequest.hospital.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{activeRequest.hospital.distanceKm} km • {activeRequest.hospital.availableBeds} beds</div>
                    </div>
                  )}
                </div>

                {/* Live map */}
                <div className="card" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
                    <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live tracking</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                      <div className="pulse-dot" />
                      Live
                    </div>
                  </div>
                  <div style={{ height: '500px', borderRadius: '10px', overflow: 'hidden' }}>
                    {location && (
                      <MapContainer center={[location.lat, location.lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[location.lat, location.lng]} icon={patientIcon}>
                          <Popup>📍 Your location</Popup>
                        </Marker>
                        {ambulancePos && (
                          <Marker position={[ambulancePos.lat, ambulancePos.lng]} icon={ambulanceIcon}>
                            <Popup>🚑 {activeRequest.ambulance?.vehicleNumber}</Popup>
                          </Marker>
                        )}
                        {ambulancePos && (
                          <Polyline positions={[[ambulancePos.lat, ambulancePos.lng], [location.lat, location.lng]]}
                            color="#e94560" weight={3} dashArray="8,6" />
                        )}
                        {activeRequest.hospital?.latitude && activeRequest.hospital?.longitude && (
  <Marker
    position={[activeRequest.hospital.latitude, activeRequest.hospital.longitude]}
    icon={hospitalIcon}
  >
    <Popup>🏥 {activeRequest.hospital.name}</Popup>
  </Marker>
)}
                      </MapContainer>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="fade-in">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myRequests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                  <h3 style={{ color: '#f1f5f9', marginBottom: '8px' }}>No requests yet</h3>
                  <p style={{ color: '#64748b' }}>Your emergency history will appear here</p>
                </div>
              ) : myRequests.map(r => (
                <div key={r._id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '32px' }}>
                    {r.emergencyType === 'cardiac' ? '❤️' : r.emergencyType === 'trauma' ? '🩹' : '🏥'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>{r.emergencyType} emergency</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{new Date(r.createdAt).toLocaleString()}</div>
                    {r.assignedHospitalId && <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '2px' }}>→ {r.assignedHospitalId.name}</div>}
                  </div>
                  <span className={`badge badge-${r.status}`}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}