"use client";

import Link from "next/link";
import { Mail, Linkedin, Twitter, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PipelineContact } from "@/lib/types/pipeline";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-3 h-3" />,
  linkedin: <Linkedin className="w-3 h-3" />,
  twitter: <Twitter className="w-3 h-3" />,
  telegram: <MessageCircle className="w-3 h-3" />,
};

function icpColor(score: number | null): string {
  if (!score) return "bg-gray-500/20 text-gray-400";
  if (score >= 90) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 75) return "bg-orange-500/20 text-orange-400";
  if (score >= 50) return "bg-blue-500/20 text-blue-400";
  return "bg-gray-500/20 text-gray-400";
}

type Props = {
  contact: PipelineContact;
  isDragging: boolean;
};

export function DragCard({ contact, isDragging }: Props) {
  return (
    <Link href={`/admin/contacts/${contact.id}`}>
      <div
        className={cn(
          "rounded-lg p-3 bg-white/[0.04] border border-white/[0.08] transition-all duration-200 cursor-grab active:cursor-grabbing",
          "hover:bg-white/[0.07] hover:border-white/[0.12]",
          isDragging && "shadow-lg shadow-black/40 bg-white/[0.08] border-white/[0.15] scale-[1.02]"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {contact.full_name}
            </p>
            {contact.company_name && (
              <p className="text-xs text-white/50 truncate mt-0.5">
                {contact.company_name}
              </p>
            )}
          </div>
          {contact.icp_score != null && (
            <Badge className={cn("text-[10px] px-1.5 py-0.5 shrink-0", icpColor(contact.icp_score))}>
              {contact.icp_score}
            </Badge>
          )}
        </div>
        {contact.channel && (
          <div className="mt-2 flex items-center gap-1 text-white/40">
            {CHANNEL_ICONS[contact.channel] || null}
            <span className="text-[10px] capitalize">{contact.channel}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
