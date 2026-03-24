"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Mail, Linkedin, Twitter, Send, Phone, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactLink {
  type: "email" | "linkedin" | "twitter" | "telegram" | "phone" | "website";
  value: string | null;
}

interface IdentityCardProps {
  name: string;
  subtitle?: string;
  secondaryLine?: string;
  imageUrl?: string | null;
  imageShape?: "circle" | "square";
  contacts: ContactLink[];
  footer?: React.ReactNode;
  stats?: React.ReactNode;
  icpScore?: number | null;
}

const contactIcons: Record<ContactLink["type"], typeof Mail> = {
  email: Mail,
  linkedin: Linkedin,
  twitter: Twitter,
  telegram: Send,
  phone: Phone,
  website: Globe,
};

const contactLabels: Record<ContactLink["type"], string> = {
  email: "Email",
  linkedin: "LinkedIn",
  twitter: "Twitter",
  telegram: "Telegram",
  phone: "Phone",
  website: "Website",
};

function getContactHref(type: ContactLink["type"], value: string): string {
  if (type === "email") return `mailto:${value}`;
  if (type === "phone") return `tel:${value}`;
  return value;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function icpBadgeVariant(score: number): { color: string; label: string } {
  if (score >= 90) return { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "ICP " + score };
  if (score >= 75) return { color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", label: "ICP " + score };
  return { color: "bg-gray-500/10 text-gray-400 border-gray-500/20", label: "ICP " + score };
}

export function IdentityCard({
  name,
  subtitle,
  secondaryLine,
  imageUrl,
  imageShape = "circle",
  contacts,
  footer,
  stats,
  icpScore,
}: IdentityCardProps) {
  return (
    <GlassCard>
      <div className="flex flex-col items-center text-center">
        {/* Avatar / Logo */}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className={cn(
              "w-16 h-16 object-cover",
              imageShape === "circle" ? "rounded-full" : "rounded-lg"
            )}
          />
        ) : (
          <div
            className={cn(
              "w-16 h-16 flex items-center justify-center glass text-lg font-semibold text-white",
              imageShape === "circle" ? "rounded-full" : "rounded-lg"
            )}
          >
            {getInitials(name)}
          </div>
        )}

        {/* Name + subtitle */}
        <h2 className="mt-3 text-lg font-semibold text-white">{name}</h2>
        {subtitle && (
          <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>
        )}
        {secondaryLine && (
          <p className="text-xs text-[var(--text-muted)]">{secondaryLine}</p>
        )}

        {/* ICP Badge */}
        {icpScore != null && (
          <div className="mt-2">
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                icpBadgeVariant(icpScore).color
              )}
            >
              {icpBadgeVariant(icpScore).label}
            </span>
          </div>
        )}
      </div>

      {/* Contact links */}
      <div className="mt-4 space-y-2">
        {contacts.map((contact) => {
          const Icon = contactIcons[contact.type];
          const label = contactLabels[contact.type];

          if (contact.value) {
            return (
              <a
                key={contact.type}
                href={getContactHref(contact.type, contact.value)}
                target={contact.type !== "email" && contact.type !== "phone" ? "_blank" : undefined}
                rel={contact.type !== "email" && contact.type !== "phone" ? "noopener noreferrer" : undefined}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
              >
                <Icon className="w-4 h-4 text-[var(--accent-orange)]" />
                <span className="truncate">{contact.value}</span>
              </a>
            );
          }

          return (
            <div
              key={contact.type}
              className="flex items-center gap-2 text-sm text-[var(--text-muted)]"
            >
              <Icon className="w-4 h-4" />
              <span>{label} not available</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      {stats && (
        <div className="mt-4 pt-3 border-t border-[var(--glass-border)]">
          {stats}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
          {footer}
        </div>
      )}
    </GlassCard>
  );
}
