import React, { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import api from "../../api/axios";

export default function HospitalDashboard() {
  const [hospital, setHospital] = useState(null);
  const [beds, setBeds] = useState("");
  const [emergency, setEmergency] = useState("");
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  useEffect(() => {
    fetchHospital();
  }, []);

  const fetchHospital = async () => {
    try {
      const res = await api.get("/hospitals/my");
      setHospital(res.data.hospital);
      setBeds(res.data.hospital.availableBeds);
      setEmergency(res.data.hospital.emergencyCapacity?.available || 0);
      setNotLinked(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotLinked(true);
      } else {
        setMsg("❌ Failed to load hospital data. Please refresh.");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateBeds = async () => {
    // Validate inputs before sending
    const newBeds = parseInt(beds);
    const newEmergency = parseInt(emergency);

    if (isNaN(newBeds) || newBeds < 0) {
      setMsg("❌ Available beds must be a valid number.");
      return;
    }
    if (newBeds > hospital.totalBeds) {
      setMsg(
        `❌ Available beds cannot exceed total beds (${hospital.totalBeds}).`,
      );
      return;
    }
    if (isNaN(newEmergency) || newEmergency < 0) {
      setMsg("❌ Emergency capacity must be a valid number.");
      return;
    }

    setUpdating(true);
    setMsg("");

    // Optimistic update — update bars immediately before API responds
    setHospital((prev) => ({
      ...prev,
      availableBeds: newBeds,
      emergencyCapacity: { ...prev.emergencyCapacity, available: newEmergency },
      // Auto-set isAcceptingEmergencies based on bed count
      isAcceptingEmergencies: newBeds > 0,
    }));

    try {
      await api.patch("/hospitals/beds", {
        availableBeds: newBeds,
        emergencyAvailable: newEmergency,
      });
      setMsg("✅ Bed count updated successfully");
      // Fetch fresh data from server to confirm
      fetchHospital();
    } catch (err) {
      setMsg("❌ " + (err.response?.data?.message || "Update failed"));
      // Rollback optimistic update on failure
      fetchHospital();
    } finally {
      setUpdating(false);
    }
  };

  const toggleEmergency = async () => {
    try {
      // Optimistic toggle
      setHospital((prev) => ({
        ...prev,
        isAcceptingEmergencies: !prev.isAcceptingEmergencies,
      }));
      await api.patch("/hospitals/toggle-emergency");
      fetchHospital(); // confirm from server
    } catch {
      // Rollback on failure
      fetchHospital();
      setMsg("❌ Failed to toggle emergency status");
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{ display: "flex", minHeight: "100vh", background: "#0a0e1a" }}
      >
        <Sidebar />
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="spinner" />
        </main>
      </div>
    );
  }

  // ── Not linked to hospital ────────────────────────────────────
  if (notLinked) {
    return (
      <div
        style={{ display: "flex", minHeight: "100vh", background: "#0a0e1a" }}
      >
        <Sidebar />
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{ textAlign: "center", padding: "40px", maxWidth: "400px" }}
          >
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏥</div>
            <h2
              style={{
                color: "#f1f5f9",
                marginBottom: "8px",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              No hospital linked
            </h2>
            <p style={{ color: "#64748b", fontSize: "14px", lineHeight: 1.6 }}>
              Your account is not linked to any hospital yet.
            </p>
            <p
              style={{
                color: "#64748b",
                fontSize: "14px",
                marginTop: "8px",
                lineHeight: 1.6,
              }}
            >
              Contact your Super Admin to link your account to a hospital.
            </p>
            <button
              onClick={fetchHospital}
              style={{
                marginTop: "20px",
                padding: "10px 20px",
                background: "rgba(59,130,246,0.15)",
                color: "#60a5fa",
                border: "1px solid rgba(59,130,246,0.3)",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              🔄 Check again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const bedPct = hospital
    ? Math.round((hospital.availableBeds / hospital.totalBeds) * 100)
    : 0;
  const emerPct =
    hospital?.emergencyCapacity?.total > 0
      ? Math.round(
          (hospital.emergencyCapacity.available /
            hospital.emergencyCapacity.total) *
            100,
        )
      : 0;

  const bedBarColor =
    bedPct > 30 ? "#10b981" : bedPct > 10 ? "#f97316" : "#e94560";
  const emerBarColor =
    emerPct > 30 ? "#10b981" : emerPct > 10 ? "#f97316" : "#e94560";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0e1a" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "24px", overflow: "auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9" }}>
              {hospital?.name || "Hospital Dashboard"}
            </h1>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {hospital?.address?.city}, {hospital?.address?.state}
            </p>
          </div>

          {/* Emergency toggle button */}
          <button
            onClick={toggleEmergency}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid",
              borderColor: hospital?.isAcceptingEmergencies
                ? "rgba(16,185,129,0.3)"
                : "rgba(239,68,68,0.3)",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              transition: "all 0.2s",
              background: hospital?.isAcceptingEmergencies
                ? "rgba(16,185,129,0.15)"
                : "rgba(239,68,68,0.15)",
              color: hospital?.isAcceptingEmergencies ? "#34d399" : "#f87171",
            }}
          >
            {hospital?.isAcceptingEmergencies
              ? "✅ Accepting emergencies"
              : "🔴 Not accepting — click to enable"}
          </button>
        </div>

        {/* Low bed warning */}
        {bedPct <= 10 && hospital?.availableBeds > 0 && (
          <div className="alert alert-error" style={{ marginBottom: "16px" }}>
            ⚠️ Critical: Only {hospital.availableBeds} beds remaining ({bedPct}
            %). Consider diverting incoming patients.
          </div>
        )}
        {hospital?.availableBeds === 0 && (
          <div className="alert alert-error" style={{ marginBottom: "16px" }}>
            🚨 No beds available. Hospital is automatically set to not accepting
            emergencies.
          </div>
        )}

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          {[
            {
              label: "Total beds",
              value: hospital?.totalBeds || 0,
              color: "#3b82f6",
            },
            {
              label: "Available beds",
              value: hospital?.availableBeds || 0,
              color: bedPct > 30 ? "#10b981" : "#f97316",
            },
            {
              label: "Emergency slots",
              value: hospital?.emergencyCapacity?.available || 0,
              color: emerPct > 30 ? "#10b981" : "#e94560",
            },
            { label: "Occupancy", value: `${100 - bedPct}%`, color: "#8b5cf6" },
          ].map((s) => (
            <div
              key={s.label}
              className="card card-sm"
              style={{ textAlign: "center" }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "6px",
                }}
              >
                {s.label}
              </div>
              <div
                style={{ fontSize: "28px", fontWeight: 700, color: s.color }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
          }}
        >
          {/* Bed management */}
          <div className="card">
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#f1f5f9",
                marginBottom: "20px",
              }}
            >
              Update bed availability
            </h3>

            {/* General bed bar */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#64748b",
                  marginBottom: "6px",
                }}
              >
                <span>General beds</span>
                <span style={{ color: bedBarColor }}>
                  {hospital?.availableBeds} / {hospital?.totalBeds} available (
                  {bedPct}%)
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${bedPct}%`,
                    background: bedBarColor,
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>

            {/* Emergency capacity bar */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#64748b",
                  marginBottom: "6px",
                }}
              >
                <span>Emergency capacity</span>
                <span style={{ color: emerBarColor }}>
                  {hospital?.emergencyCapacity?.available} /{" "}
                  {hospital?.emergencyCapacity?.total} available ({emerPct}%)
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${emerPct}%`,
                    background: emerBarColor,
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>

            {/* Input fields */}
            <div className="input-group">
              <label className="input-label">Available beds (general)</label>
              <input
                className="input"
                type="number"
                min="0"
                max={hospital?.totalBeds}
                value={beds}
                onChange={(e) => {
                  setBeds(e.target.value);
                  setMsg(""); // clear message on change
                }}
              />
              <div
                style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}
              >
                Max: {hospital?.totalBeds} total beds
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">
                Emergency capacity available
              </label>
              <input
                className="input"
                type="number"
                min="0"
                max={hospital?.emergencyCapacity?.total}
                value={emergency}
                onChange={(e) => {
                  setEmergency(e.target.value);
                  setMsg("");
                }}
              />
              <div
                style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}
              >
                Max: {hospital?.emergencyCapacity?.total} emergency slots
              </div>
            </div>

            {/* Status message */}
            {msg && (
              <div
                className={`alert ${msg.startsWith("✅") ? "alert-success" : "alert-error"}`}
                style={{ marginBottom: "12px" }}
              >
                {msg}
              </div>
            )}

            <button
              className="btn btn-success btn-block"
              onClick={updateBeds}
              disabled={updating}
              style={{ padding: "14px" }}
            >
              {updating ? (
                <>
                  <div
                    className="spinner spinner-sm"
                    style={{ marginRight: "8px" }}
                  />{" "}
                  Saving...
                </>
              ) : (
                "💾 Save bed count"
              )}
            </button>
          </div>

          {/* Hospital info */}
          <div className="card">
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#f1f5f9",
                marginBottom: "16px",
              }}
            >
              Hospital information
            </h3>

            {hospital &&
              [
                {
                  label: "Registration no.",
                  value: hospital.registrationNumber,
                },
                { label: "Phone", value: hospital.phone },
                { label: "Street", value: hospital.address?.street },
                { label: "City", value: hospital.address?.city },
                { label: "State", value: hospital.address?.state },
                { label: "Pincode", value: hospital.address?.pincode },
              ].map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ color: "#64748b" }}>{r.label}</span>
                  <span style={{ color: "#f1f5f9", fontWeight: 500 }}>
                    {r.value || "—"}
                  </span>
                </div>
              ))}

            {/* Specialties */}
            {hospital?.specialties?.length > 0 && (
              <div style={{ marginTop: "14px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "8px",
                  }}
                >
                  Specialties
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {hospital.specialties.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: "4px 10px",
                        background: "rgba(59,130,246,0.15)",
                        color: "#60a5fa",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 500,
                        textTransform: "capitalize",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Last updated */}
            {hospital?.updatedAt && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  fontSize: "11px",
                  color: "#475569",
                }}
              >
                Last updated: {new Date(hospital.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
