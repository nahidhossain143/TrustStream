import { useState, useEffect } from "react";
import { onAccountChange, onChainChange } from "../services/wallet";

export default function Navbar() {
  const [address, setAddress] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Page load এ wallet সবসময় disconnect — auto-connect নেই
    setAddress(null);

    // Account change listen করো
    onAccountChange((addr) => setAddress(addr || null));

    // Chain change এ disconnect করো
    onChainChange(() => setAddress(null));
  }, []);

  const handleConnect = async () => {
    if (!window.ethereum) {
      alert("MetaMask installed নেই!");
      return;
    }
    setConnecting(true);
    try {
      // আগের permission revoke করো
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (e) {
        console.log("Revoke not supported, continuing...");
      }

      // Sepolia network এ switch করো
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });

      // নতুন করে connect করো
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
    <div className="sticky top-0 z-50 bg-gray-900/70 backdrop-blur-xl border-b border-gray-800 px-8 py-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold tracking-wide text-white">
        TrustStream
      </h1>
      <div className="flex items-center gap-4">
        <span className="px-3 py-1 bg-red-600 text-xs font-semibold rounded-full animate-pulse">
          LIVE
        </span>

        {/* MetaMask Connect Button */}
        {address ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/50 border border-green-500/50 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-green-400 text-xs font-mono font-semibold">
              {shortAddress(address)}
            </span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-full transition-all"
          >
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
              alt="MetaMask"
              className="w-4 h-4"
            />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}

        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
      </div>
    </div>
  );
}