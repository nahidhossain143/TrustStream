import { useState, useEffect } from "react";
import { onAccountChange, onChainChange } from "../services/wallet";
import { useTheme } from "../context/ThemeContext";

export default function Navbar() {
  const [address, setAddress] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    setAddress(null);
    onAccountChange((addr) => setAddress(addr || null));
    onChainChange(() => setAddress(null));
  }, []);

  const handleConnect = async () => {
    if (!window.ethereum) {
      alert("MetaMask installed নেই!");
      return;
    }
    setConnecting(true);
    try {
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (e) {
        console.log("Revoke not supported, continuing...");
      }
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0] || null);
    } catch (err) {
      console.error("Wallet connect error:", err);
    }
    setConnecting(false);
  };

  const shortAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : null;

  return (
    <div className={`sticky top-0 z-50 backdrop-blur-xl border-b px-8 py-4 flex justify-between items-center transition-colors duration-300 ${
      isDark
        ? "bg-[#080808]/80 border-white/8"
        : "bg-white/90 border-neutral-200"
    }`}>
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-blue-900/30">
          TS
        </div>
        <h1 className={`text-xl font-bold tracking-tight transition-colors ${
          isDark ? "text-white" : "text-neutral-900"
        }`}>
          TrustStream
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
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
            // Sun icon
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
              />
            </svg>
          ) : (
            // Moon icon
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>

        {/* MetaMask */}
        {address ? (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
            isDark
              ? "bg-emerald-950/40 border-emerald-700/40"
              : "bg-emerald-50 border-emerald-200"
          }`}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className={`text-[11px] font-mono font-semibold ${
              isDark ? "text-emerald-400" : "text-emerald-700"
            }`}>
              {shortAddress(address)}
            </span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-[11px] font-semibold rounded-full transition-all shadow-lg shadow-orange-900/30"
          >
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
              alt="MetaMask"
              className="w-3.5 h-3.5"
            />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-900/20" />
      </div>
    </div>
  );
}