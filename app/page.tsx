import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f13] relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        {/* Logo */}
        <img
          src="https://framerusercontent.com/images/6lHOTAZziUqbnDrqcc8hCM8ps8.png"
          alt="FP Block"
          className="h-12 w-auto"
        />

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)] tracking-tight">
            FP Block
          </h1>
          <p className="text-[#a1a1aa] text-sm mt-2 font-[family-name:var(--font-body)]">
            Mission-critical systems. Built right.
          </p>
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg mt-4">
          <Link
            href="/jb"
            className="group flex flex-col items-center gap-2 rounded-xl p-6 text-center transition-all duration-300 border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.06] hover:border-[#f58327]/20 hover:shadow-[0_0_30px_rgba(245,131,39,0.08)]"
          >
            <span className="text-2xl">🎤</span>
            <span className="text-white font-semibold font-[family-name:var(--font-heading)] text-sm">JB</span>
            <span className="text-[#a1a1aa] text-xs">EthCC Cannes</span>
          </Link>

          <Link
            href="/wes"
            className="group flex flex-col items-center gap-2 rounded-xl p-6 text-center transition-all duration-300 border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.06] hover:border-[#6e86ff]/20 hover:shadow-[0_0_30px_rgba(110,134,255,0.08)]"
          >
            <span className="text-2xl">🤝</span>
            <span className="text-white font-semibold font-[family-name:var(--font-heading)] text-sm">Wes</span>
            <span className="text-[#a1a1aa] text-xs">EthCC Cannes</span>
          </Link>

          <Link
            href="/login"
            className="group flex flex-col items-center gap-2 rounded-xl p-6 text-center transition-all duration-300 border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.06] hover:border-[#f58327]/20 hover:shadow-[0_0_30px_rgba(245,131,39,0.08)]"
          >
            <span className="text-2xl">⚡</span>
            <span className="text-white font-semibold font-[family-name:var(--font-heading)] text-sm">Admin</span>
            <span className="text-[#a1a1aa] text-xs">CRM Dashboard</span>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-[#52525b] text-xs mt-8 font-[family-name:var(--font-body)]">
          © 2026 FP Block. All rights reserved.
        </p>
      </div>
    </div>
  );
}
