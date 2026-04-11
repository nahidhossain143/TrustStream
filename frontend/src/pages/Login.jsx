import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Login() {
  const { isDark } = useTheme();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await login(username, password);
      navigate("/admin");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/60 border-white/8" : "bg-white border-neutral-200";
  const inputBg = isDark
    ? "bg-neutral-800 border-neutral-700 text-white placeholder-neutral-600 focus:border-blue-500/60 focus:ring-blue-500/20"
    : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-blue-500 focus:ring-blue-500/20";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  return (
    <div className={`min-h-screen ${bg} flex items-center justify-center px-4 transition-colors duration-300`}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-xl mx-auto shadow-xl shadow-blue-900/30">
            📡
          </div>
          <h1 className={`text-xl font-bold tracking-tight ${text}`}>TrustStream</h1>
          <p className={`text-[11px] font-mono ${textMuted}`}>Admin Access · Sepolia Testnet</p>
        </div>

        {/* Card */}
        <div className={`rounded-2xl border shadow-2xl overflow-hidden ${cardBg}`}>
          <div className={`px-5 py-3 border-b ${isDark ? "border-white/6 bg-white/2" : "border-neutral-100 bg-neutral-50"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
              🔐 Secure Admin Login
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
                Username
              </label>
              <input
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                disabled={loading}
                autoComplete="username"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-40 transition-all ${inputBg}`}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  disabled={loading}
                  autoComplete="current-password"
                  className={`w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 disabled:opacity-40 transition-all ${inputBg}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${textMuted} hover:opacity-70`}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
                <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-red-400 text-xs">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Login
                </>
              )}
            </button>
          </form>

          <div className={`px-6 py-3 border-t ${isDark ? "border-white/6" : "border-neutral-100"}`}>
            <p className={`text-[9px] font-mono text-center ${textMuted}`}>
              TrustStream Admin · JWT Auth · 24h session
            </p>
          </div>
        </div>

        <p className={`text-center text-[10px] font-mono mt-6 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
          ← <a href="/" className="hover:underline">Back to viewer</a>
        </p>
      </div>
    </div>
  );
}