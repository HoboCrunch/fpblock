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
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] tracking-tight" style={{ letterSpacing: "-0.3px" }}>
          <span className="text-white">FP </span>
          <span className="text-[#f58327]">Block</span>
        </h1>
        <p className="text-[#a1a1aa] text-sm -mt-4 font-[family-name:var(--font-body)]">
          Mission-critical systems. Built right.
        </p>

        {/* Profile cards */}
        <div className="flex flex-col gap-4 w-full max-w-md mt-4">
          <Link
            href="/wes"
            className="group rounded-xl p-5 transition-all duration-300 border border-[#f58327]/15 bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.06] hover:border-[#f58327]/30 hover:shadow-[0_0_40px_rgba(245,131,39,0.1)]"
          >
            <div className="flex items-center gap-4">
              <img
                src="https://nbpyunavtweourytwcrq.supabase.co/storage/v1/object/public/misc/wes.jpg"
                alt="Wesley Crook"
                className="h-14 w-14 rounded-full object-cover ring-2 ring-[#f58327]/20 group-hover:ring-[#f58327]/40 transition-all"
              />
              <div className="flex-1 min-w-0">
                <span className="text-white font-semibold font-[family-name:var(--font-heading)] text-base block">Wesley Crook</span>
                <span className="text-[#a1a1aa] text-xs font-[family-name:var(--font-body)]">CEO, FP Block</span>
              </div>
              <span className="text-[#52525b] group-hover:text-[#f58327] transition-colors">&rarr;</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[#a1a1aa] text-xs font-[family-name:var(--font-body)] leading-relaxed">
                Up next &mdash; <span className="text-[#f58327]">Consensus 2026</span>. Building systems where failure is not an option.
              </p>
            </div>
          </Link>

          <Link
            href="/jb"
            className="group rounded-xl p-5 transition-all duration-300 border border-[#f58327]/15 bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.06] hover:border-[#f58327]/30 hover:shadow-[0_0_40px_rgba(245,131,39,0.1)]"
          >
            <div className="flex items-center gap-4">
              <img
                src="/landing/jb.png"
                alt="JB"
                className="h-14 w-14 rounded-full object-cover ring-2 ring-[#f58327]/20 group-hover:ring-[#f58327]/40 transition-all"
              />
              <div className="flex-1 min-w-0">
                <span className="text-white font-semibold font-[family-name:var(--font-heading)] text-base block">JB</span>
                <span className="text-[#a1a1aa] text-xs font-[family-name:var(--font-body)]">Head of BD, FP Block</span>
              </div>
              <span className="text-[#52525b] group-hover:text-[#f58327] transition-colors">&rarr;</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[#a1a1aa] text-xs font-[family-name:var(--font-body)] leading-relaxed">
                Up next &mdash; <span className="text-[#f58327]">Consensus 2026</span>. Let&apos;s talk infrastructure, ownership, and what comes next.
              </p>
            </div>
          </Link>
        </div>

        {/* Admin link */}
        <Link
          href="/login"
          className="text-xs text-[#f58327] hover:text-[#f58327]/80 transition-colors font-[family-name:var(--font-body)] mt-4"
        >
          Login as admin &rarr;
        </Link>

        {/* Footer */}
        <p className="text-[#52525b] text-xs mt-6 font-[family-name:var(--font-body)]">
          &copy; 2026 FP Block. All rights reserved.
        </p>
      </div>
    </div>
  );
}
