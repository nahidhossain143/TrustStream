export default function Navbar() {
  return (
    <div className="sticky top-0 z-50 bg-gray-900/70 backdrop-blur-xl border-b border-gray-800 px-8 py-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold tracking-wide text-white">
        TrustStream
      </h1>

      <div className="flex items-center gap-4">
        <span className="px-3 py-1 bg-red-600 text-xs font-semibold rounded-full animate-pulse">
          LIVE
        </span>
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
      </div>
    </div>
  );
}