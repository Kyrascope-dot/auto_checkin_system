import { useState, useEffect } from "react";
import { esslSync, esslStatus, esslUsers, esslPairs } from "../api/client";

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHours(h) {
  if (h == null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export default function EsslPage() {
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("attendance");

  useEffect(() => {
    esslStatus().then(setStatus).catch(() => {});
    esslUsers().then((r) => setUsers(r.users || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    esslPairs(showAll ? "" : selectedDate)
      .then((r) => setPairs(r.pairs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate, showAll]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await esslSync();
      setSyncResult(result);
      if (result.success) {
        esslStatus().then(setStatus);
        esslUsers().then((r) => setUsers(r.users || []));
        esslPairs(selectedDate).then((r) => setPairs(r.pairs || []));
      }
    } catch (e) {
      setSyncResult({ success: false, error: e.message });
    }
    setSyncing(false);
  }

  const totalPresent = pairs.length;
  const totalCheckedOut = pairs.filter((p) => p.check_out).length;
  const avgHours = pairs.filter((p) => p.working_hours > 0).length > 0
    ? (pairs.reduce((s, p) => s + (p.working_hours || 0), 0) / pairs.filter((p) => p.working_hours > 0).length).toFixed(1)
    : "—";

  return (
    <div className="essl-page">
      {/* Header */}
      <div className="essl-header">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">eSSL Biometric Device</h1>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            {status?.configured
              ? `Device at ${status.ip}:${status.port}`
              : "Not configured — set ESSL_IP in backend/.env"}
            {status?.last_sync?.synced_at && (
              <> · Last sync: {new Date(status.last_sync.synced_at).toLocaleString()}</>
            )}
          </p>
        </div>
        <div className="essl-header-actions">
          {!showAll && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="essl-date-input"
            />
          )}
          <button
            onClick={() => setShowAll(!showAll)}
            className={`essl-all-btn ${showAll ? "essl-all-btn-active" : ""}`}
          >
            {showAll ? "Filter by date" : "Show all"}
          </button>
          <button onClick={handleSync} disabled={syncing} className="essl-sync-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={syncing ? "essl-spin" : ""}>
              <path d="M14 8A6 6 0 114.8 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M14 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`essl-banner ${syncResult.success ? "essl-banner-ok" : "essl-banner-err"}`}>
          {syncResult.success
            ? `Synced ${syncResult.new_records} new records · ${syncResult.total_users} users · ${syncResult.total_records} total records`
            : `Sync failed: ${syncResult.error}`}
          <button onClick={() => setSyncResult(null)} className="essl-banner-close">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="essl-stats">
        <div className="essl-stat">
          <div className="essl-stat-val text-blue-600 dark:text-blue-400">{users.length}</div>
          <div className="essl-stat-label">Device Users</div>
        </div>
        <div className="essl-stat">
          <div className="essl-stat-val text-green-600 dark:text-green-400">{totalPresent}</div>
          <div className="essl-stat-label">Present</div>
        </div>
        <div className="essl-stat">
          <div className="essl-stat-val text-purple-600 dark:text-purple-400">{totalCheckedOut}</div>
          <div className="essl-stat-label">Checked Out</div>
        </div>
        <div className="essl-stat">
          <div className="essl-stat-val text-orange-600 dark:text-orange-400">{avgHours}h</div>
          <div className="essl-stat-label">Avg Hours</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="essl-tabs">
        <button onClick={() => setTab("attendance")} className={`essl-tab ${tab === "attendance" ? "essl-tab-active" : ""}`}>
          Attendance
        </button>
        <button onClick={() => setTab("users")} className={`essl-tab ${tab === "users" ? "essl-tab-active" : ""}`}>
          Device Users ({users.length})
        </button>
      </div>

      {/* Attendance tab */}
      {tab === "attendance" && (
        <div className="essl-card">
          <h3 className="essl-card-title">
            {showAll
              ? `All Records (${pairs.length})`
              : new Date(selectedDate + "T12:00:00").toLocaleDateString([], {
                  weekday: "long", day: "numeric", month: "short", year: "numeric",
                })}
          </h3>
          {loading ? (
            <p className="text-gray-400 text-sm py-4">Loading…</p>
          ) : pairs.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">
              No records{showAll ? "" : " for this date"}. {!status?.last_sync && "Try syncing the device first."}
            </p>
          ) : (
            <div className="essl-table-wrap">
              <table className="essl-table">
                <thead>
                  <tr>
                    {showAll && <th>Date</th>}
                    <th>User</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Working Hours</th>
                    <th>Punches</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p, i) => (
                    <tr key={i}>
                      {showAll && <td className="text-sm whitespace-nowrap">{formatDate(p.date)}</td>}
                      <td>
                        <div className="essl-user-cell">
                          <div className="essl-user-avatar">{(p.name || "?")[0]}</div>
                          <div>
                            <div className="essl-user-name">{p.name}</div>
                            <div className="essl-user-id">ID: {p.user_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-sm">{formatTime(p.check_in)}</td>
                      <td className="font-mono text-sm">{formatTime(p.check_out)}</td>
                      <td className="font-mono text-sm">{formatHours(p.working_hours)}</td>
                      <td className="text-center">{p.total_punches}</td>
                      <td>
                        <span className={`essl-status ${p.check_out ? "essl-status-out" : "essl-status-in"}`}>
                          {p.check_out ? "Done" : "Working"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="essl-card">
          <h3 className="essl-card-title">Enrolled Users on Device</h3>
          {users.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">
              No users found. {!status?.last_sync && "Sync the device first."}
            </p>
          ) : (
            <div className="essl-users-grid">
              {users.map((u, i) => (
                <div key={i} className="essl-user-card">
                  <div className="essl-user-avatar-lg">{(u.name || "?")[0]}</div>
                  <div className="essl-user-card-info">
                    <div className="essl-user-name">{u.name || `User ${u.user_id}`}</div>
                    <div className="essl-user-id">ID: {u.user_id} · UID: {u.uid}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
