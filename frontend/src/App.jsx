import { Routes, Route, NavLink } from "react-router-dom";
import { useTheme } from "./hooks/useTheme";
import LivePage from "./pages/LivePage";
import EnrollPage from "./pages/EnrollPage";
import EmployeesPage from "./pages/EmployeesPage";
import DashboardPage from "./pages/DashboardPage";

const nav = [
  { to: "/", label: "Live", d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { to: "/dashboard", label: "Dashboard", d: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { to: "/enroll", label: "Enroll", d: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
  { to: "/employees", label: "People", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function App() {
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="sticky top-0 z-50 border-b border-gray-200/60 dark:border-white/[0.06] bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-5 flex items-center h-12 gap-3 sm:gap-8">
          <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-white select-none shrink-0">
            AutoCheckIn
          </span>

          <div className="flex gap-0.5 flex-1 overflow-x-auto no-scrollbar">
            {nav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
                  }`
                }
              >
                <svg className="w-3.5 h-3.5 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={l.d} />
                </svg>
                {l.label}
              </NavLink>
            ))}
          </div>

          <button
            onClick={toggle}
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors shrink-0"
            title={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-5">
        <Routes>
          <Route path="/" element={<LivePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/enroll" element={<EnrollPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
        </Routes>
      </main>
    </div>
  );
}
