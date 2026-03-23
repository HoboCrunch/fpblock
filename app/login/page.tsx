"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f13] relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo + back link */}
        <div className="flex flex-col items-center gap-6 mb-8">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <img
              src="https://framerusercontent.com/images/6lHOTAZziUqbnDrqcc8hCM8ps8.png"
              alt="FP Block"
              className="h-10 w-auto"
            />
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white font-[family-name:var(--font-heading)]">
              Sign in to Admin
            </h1>
            <p className="text-[#a1a1aa] text-xs mt-1 font-[family-name:var(--font-body)]">
              FP Block CRM Dashboard
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleLogin}
          className="rounded-xl p-6 space-y-4 border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl"
        >
          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 p-3 rounded-lg">
              {error}
            </p>
          )}

          <div>
            <label className="text-xs text-[#a1a1aa] mb-1.5 block font-[family-name:var(--font-body)]">
              Email
            </label>
            <input
              type="email"
              placeholder="admin@gofpblock.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#52525b] bg-white/[0.04] border border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-[#f58327]/40 focus:border-[#f58327]/50 transition-all duration-200 font-[family-name:var(--font-body)]"
              required
            />
          </div>

          <div>
            <label className="text-xs text-[#a1a1aa] mb-1.5 block font-[family-name:var(--font-body)]">
              Password
            </label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#52525b] bg-white/[0.04] border border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-[#f58327]/40 focus:border-[#f58327]/50 transition-all duration-200 font-[family-name:var(--font-body)]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-[#f58327] bg-[#f58327]/15 border border-[#f58327]/20 hover:bg-[#f58327]/25 disabled:opacity-50 transition-all duration-200 font-[family-name:var(--font-heading)]"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-xs text-[#52525b] hover:text-[#a1a1aa] transition-colors font-[family-name:var(--font-body)]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
