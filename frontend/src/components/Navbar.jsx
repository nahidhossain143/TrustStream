import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div
      className={`sticky top-0 z-50 backdrop-blur-xl border-b px-8 py-4 flex justify-between items-center transition-colors duration-300 ${
        isDark
          ? "bg-[#080808]/80 border-white/8"
          : "bg-white/90 border-neutral-200"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        {/* logo-mark is the emblem cropped out of the full artwork; the
            original 3:2 illustration was unreadable squeezed into this box. */}
        <img
          src="/logo-mark.png"
          alt="TrustStream"
          className="w-10 h-10 rounded-xl object-cover shadow-sm"
        />

        <h1
          className={`text-xl font-bold tracking-tight transition-colors ${
            isDark ? "text-white" : "text-neutral-900"
          }`}
        >
          TrustStream
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Public verify-by-upload link */}
        <Link
          to="/verify"
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            isDark
              ? "border-neutral-700 text-neutral-300 hover:border-blue-500 hover:text-blue-400"
              : "border-neutral-200 text-neutral-600 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          🔍 Verify Content
        </Link>

        {/* LIVE badge */}
        <span className="flex items-center gap-1.5 px-3 py-1 bg-red-600/90 text-white text-[10px] font-bold rounded-full shadow-lg shadow-red-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300 ${
            isDark
              ? "bg-neutral-800 border-neutral-700 text-yellow-400 hover:bg-neutral-700"
              : "bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-neutral-200"
          }`}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-900/20" />
      </div>
    </div>
  );
}
