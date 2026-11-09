import { useState, useEffect } from "react";
import {
  getAttendanceToday, getAttendanceByDate, getWeeklySummary, listEmployees,
  esslSync, esslStatus,
} from "../api/client";

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

const SOURCE_LABELS = {
  face: "Face",
  camera: "Camera",
  essl: "Biometric",
};

const SOURCE_COLORS = {
  face: "dash-source-face",
  camera: "dash-source-camera",
  essl: "dash-source-essl",
};

function SourceBadge({ source }) {
  return (
    <span className={`dash-source-pill ${SOURCE_COLORS[source] || ""}`}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="dash-stat">
      <div className={`dash-stat-val ${color || ""}`}>{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

function WeekChart({ days }) {
  const max = Math.max(...days.map((d) => d.present), 1);
  return (
    <div className="dash-chart">
      <h3 className="dash-section-title">This Week</h3>
      <div className="dash-bars">
        {days.map((d) => {
          const dayName = new Date(d.date + "T12:00:00").toLocaleDateString([], { weekday: "short" });
          const pct = (d.present / max) * 100;
          return (
            <div key={d.date} className="dash-bar-col">
              <div className="dash-bar-wrap">
                <div
                  className="dash-bar"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`${d.present} present, ${d.total_hours.toFixed(1)}h total`}
                >
                  {d.present > 0 && <span className="dash-bar-num">{d.present}</span>}
                </div>
              </div>
              <span className="dash-bar-label">{dayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [attendance, setAttendance] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all");

  // eSSL state
  const [esslDeviceStatus, setEsslDeviceStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  function loadAttendance() {
    const today = new Date().toISOString().split("T")[0];
    const req = selectedDate === today ? getAttendanceToday() : getAttendanceByDate(selectedDate);
    return req.then(setAttendance).catch(() => setAttendance({ employees: [], total_present: 0, total_checked_out: 0 }));
  }

  // Load attendance data
  useEffect(() => {
    setLoading(true);
    loadAttendance().finally(() => setLoading(false));
  }, [selectedDate]);

  useEffect(() => {
    Promise.all([
      listEmployees().then((r) => setTotalEmployees(r.total)),
      getWeeklySummary().then((r) => setWeekly(r.days)),
      esslStatus().then(setEsslDeviceStatus).catch(() => {}),
    ]).catch(() => {});
  }, []);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      loadAttendance();
      esslStatus().then(setEsslDeviceStatus).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await esslSync();
      setSyncResult(result);
      if (result.success) {
        loadAttendance();
        esslStatus().then(setEsslDeviceStatus);
      }
    } catch (e) {
      setSyncResult({ success: false, error: e.message });
    }
    setSyncing(false);
  }

  // Filter employees by source
  const employees = attendance?.employees || [];
  const filtered = sourceFilter === "all"
    ? employees
    : employees.filter((e) => e.source === sourceFilter);

  const present = attendance?.total_present || 0;
  const checkedOut = attendance?.total_checked_out || 0;
  const stillIn = present - checkedOut;
  const absent = totalEmployees - present;
  const avgHours = employees.filter((e) => e.total_hours > 0).length > 0
    ? (employees.reduce((s, e) => s + e.total_hours, 0) / employees.filter((e) => e.total_hours > 0).length)
    : 0;

  // Source breakdown
  const sourceCounts = {};
  for (const e of employees) {
    const s = e.source || "unknown";
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }

  return (
    <div className="dash-page">
      {/* Header */}
      <div className="dash-header">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="dash-header-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="dash-date-input"
          />
          <button onClick={handleSync} disabled={syncing} className="dash-sync-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={syncing ? "dash-spin" : ""}>
              <path d="M14 8A6 6 0 114.8 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M14 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {syncing ? "Syncing…" : "Sync eSSL"}
          </button>
        </div>
      </div>

      {/* Device info bar */}
      {esslDeviceStatus?.configured && (
        <div className="dash-device-info">
          {esslDeviceStatus.live_capture && (
            <span className="dash-live-badge">
              <span className="dash-live-dot" />
              Auto-sync
            </span>
          )}
          <span>eSSL: {esslDeviceStatus.ip}:{esslDeviceStatus.port}</span>
          {esslDeviceStatus.last_sync?.synced_at && (
            <span> · Last sync: {new Date(esslDeviceStatus.last_sync.synced_at).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className={`dash-banner ${syncResult.success ? "dash-banner-ok" : "dash-banner-err"}`}>
          {syncResult.success
            ? `Synced ${syncResult.new_records} new records · ${syncResult.total_users} users`
            : `Sync failed: ${syncResult.error}`}
          <button onClick={() => setSyncResult(null)} className="dash-banner-close">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="dash-stats-row">
        <StatCard label="Total Employees" value={totalEmployees} color="text-gray-600 dark:text-gray-300" />
        <StatCard label="Present" value={present} sub={`${absent} absent`} color="text-green-600 dark:text-green-400" />
        <StatCard label="Still Working" value={stillIn} color="text-blue-600 dark:text-blue-400" />
        <StatCard label="Checked Out" value={checkedOut} color="text-purple-600 dark:text-purple-400" />
        <StatCard label="Avg Hours" value={avgHours > 0 ? avgHours.toFixed(1) + "h" : "—"} color="text-orange-600 dark:text-orange-400" />
      </div>

      {/* Weekly chart */}
      {weekly && <WeekChart days={weekly} />}

      {/* Source filter pills */}
      <div className="dash-source-filters">
        <button
          onClick={() => setSourceFilter("all")}
          className={`dash-filter-pill ${sourceFilter === "all" ? "dash-filter-pill-active" : ""}`}
        >
          All ({employees.length})
        </button>
        {Object.entries(sourceCounts).map(([src, count]) => (
          <button
            key={src}
            onClick={() => setSourceFilter(src)}
            className={`dash-filter-pill ${sourceFilter === src ? "dash-filter-pill-active" : ""}`}
          >
            {SOURCE_LABELS[src] || src} ({count})
          </button>
        ))}
      </div>

      {/* Unified attendance table */}
      <div className="dash-table-section">
        <h3 className="dash-section-title">
          Attendance — {new Date(selectedDate + "T12:00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
        </h3>
        {loading ? (
          <p className="text-gray-400 text-sm py-4">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No attendance records for this date.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Source</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Working Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, i) => {
                  const firstSession = emp.sessions[0];
                  const lastSession = emp.sessions[emp.sessions.length - 1];
                  return (
                    <tr key={emp.employee_id || i}>
                      <td>
                        <div className="dash-emp-cell">
                          <div className="dash-emp-avatar">{emp.name[0]}</div>
                          <div>
                            <div className="dash-emp-name">{emp.name}</div>
                            <div className="dash-emp-id">{emp.employee_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>{emp.department || "—"}</td>
                      <td><SourceBadge source={emp.source} /></td>
                      <td>{formatTime(firstSession?.checked_in_at)}</td>
                      <td>{formatTime(lastSession?.checked_out_at)}</td>
                      <td className="font-mono">{formatHours(emp.total_hours > 0 ? emp.total_hours : null)}</td>
                      <td>
                        <span className={`dash-status dash-status-${emp.status}`}>
                          {emp.status === "checked_in" ? "Working" : emp.status === "checked_out" ? "Done" : "Absent"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
