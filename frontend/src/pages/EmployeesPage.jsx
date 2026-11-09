import { useState, useEffect } from "react";
import { listEmployees, deleteEmployee } from "../api/client";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setEmployees((await listEmployees()).employees); } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(emp) {
    if (!confirm(`Delete ${emp.name}? This removes all their face data.`)) return;
    await deleteEmployee(emp.id);
    load();
  }

  if (loading) return <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Employees <span className="text-base font-normal text-gray-400">({employees.length})</span>
      </h1>

      {employees.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <p className="text-gray-400 dark:text-gray-500">No employees enrolled yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">Go to <strong className="text-indigo-500">Enroll</strong> to add the first one.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 hover:border-gray-200 dark:hover:border-gray-700 transition flex flex-col group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
                  {emp.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{emp.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{emp.employee_id}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-y-2 text-sm flex-1">
                <dt className="text-gray-400">Department</dt><dd className="text-gray-900 dark:text-gray-200">{emp.department || "—"}</dd>
                <dt className="text-gray-400">Designation</dt><dd className="text-gray-900 dark:text-gray-200">{emp.designation || "—"}</dd>
                <dt className="text-gray-400">Photos</dt><dd className="text-gray-900 dark:text-gray-200">{emp.photo_count}</dd>
                <dt className="text-gray-400">Enrolled</dt><dd className="text-gray-900 dark:text-gray-200 text-xs">{new Date(emp.enrolled_at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</dd>
              </dl>

              <button onClick={() => handleDelete(emp)} className="mt-4 text-xs text-red-500/70 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 self-end transition">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
