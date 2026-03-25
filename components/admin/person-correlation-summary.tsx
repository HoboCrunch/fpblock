import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface PersonEvent {
  event_id: string;
  event_name: string;
  role: string;
  talk_title: string | null;
  track: string | null;
}

interface PersonOrg {
  org_id: string;
  org_name: string;
  role: string | null;
  is_current: boolean;
  title: string | null;
}

interface OrgEventLink {
  org_id: string;
  org_name: string;
  event_id: string;
  event_name: string;
  tier: string | null;
}

interface PersonCorrelationSummaryProps {
  personEvents: PersonEvent[];
  personOrgs: PersonOrg[];
  orgEventLinks: OrgEventLink[];
}

interface ChainLine {
  parts: Array<{ text: string; href?: string; badge?: string }>;
  priority: number; // lower = show first
}

function buildChains(
  personEvents: PersonEvent[],
  personOrgs: PersonOrg[],
  orgEventLinks: OrgEventLink[]
): ChainLine[] {
  const chains: ChainLine[] = [];

  // Sort orgs: current first, then former
  const sortedOrgs = [...personOrgs].sort((a, b) => {
    if (a.is_current && !b.is_current) return -1;
    if (!a.is_current && b.is_current) return 1;
    return 0;
  });

  // For each event participation, check org sponsorship overlap
  for (const pe of personEvents) {
    const parts: ChainLine["parts"] = [];

    // Person role at event
    const roleLabel = pe.role.charAt(0).toUpperCase() + pe.role.slice(1);
    parts.push({ text: `${roleLabel} at ` });
    parts.push({ text: pe.event_name, href: `/admin/events/${pe.event_id}` });

    if (pe.talk_title) {
      parts.push({ text: ` (${pe.role === "panelist" ? "Panel" : "Talk"}: "${pe.talk_title}")` });
    }

    // Check if any org sponsors this event
    const orgSponsor = orgEventLinks.find((oel) => oel.event_id === pe.event_id);
    if (orgSponsor) {
      const org = sortedOrgs.find((o) => o.org_id === orgSponsor.org_id);
      if (org) {
        const orgRole = org.title || org.role || "";
        parts.push({ text: " · " });
        if (orgRole) parts.push({ text: `${orgRole} at ` });
        parts.push({ text: orgSponsor.org_name, href: `/admin/organizations/${orgSponsor.org_id}` });
        parts.push({ text: " · " });
        parts.push({
          text: orgSponsor.org_name,
          href: `/admin/organizations/${orgSponsor.org_id}`,
        });
        parts.push({ text: " is " });
        if (orgSponsor.tier) {
          const tierLabel = orgSponsor.tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          parts.push({ text: `${tierLabel} Sponsor`, badge: orgSponsor.tier });
        } else {
          parts.push({ text: "Sponsor" });
        }
        parts.push({ text: ` at ` });
        parts.push({ text: orgSponsor.event_name, href: `/admin/events/${orgSponsor.event_id}` });
      }
    }

    chains.push({
      parts,
      priority: orgSponsor ? 0 : 1,
    });
  }

  // Org connections not already mentioned via events
  const eventOrgIds = new Set(orgEventLinks.map((o) => o.org_id));
  const eventIds = new Set(personEvents.map((e) => e.event_id));

  for (const org of sortedOrgs) {
    // Skip if this org was already part of an event chain
    const alreadyMentioned = personEvents.some((pe) =>
      orgEventLinks.some((oel) => oel.org_id === org.org_id && oel.event_id === pe.event_id)
    );

    // If org has event links not covered by person's events, show them
    const orgOnlyEvents = orgEventLinks.filter(
      (oel) => oel.org_id === org.org_id && !eventIds.has(oel.event_id)
    );

    if (!alreadyMentioned && orgOnlyEvents.length === 0 && personEvents.length > 0) continue;

    // Show org-only connections as secondary chains
    for (const oel of orgOnlyEvents) {
      const status = org.is_current ? "" : "Previously ";
      const roleLabel = org.title || org.role || "";
      const parts: ChainLine["parts"] = [];
      parts.push({ text: `${status}${roleLabel ? roleLabel + " at " : "At "}` });
      parts.push({ text: org.org_name, href: `/admin/organizations/${org.org_id}` });
      if (oel.tier) {
        const tierLabel = oel.tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        parts.push({ text: " · " });
        parts.push({ text: `${tierLabel} Sponsor`, badge: oel.tier });
        parts.push({ text: " at " });
        parts.push({ text: oel.event_name, href: `/admin/events/${oel.event_id}` });
      }
      chains.push({ parts, priority: org.is_current ? 2 : 3 });
    }
  }

  // Former org connections without events
  for (const org of sortedOrgs) {
    if (org.is_current) continue;
    const hasChain = chains.some((c) =>
      c.parts.some((p) => p.href === `/admin/organizations/${org.org_id}`)
    );
    if (hasChain) continue;
    const roleLabel = org.title || org.role || "";
    chains.push({
      parts: [
        { text: `Previously ${roleLabel ? roleLabel + " at " : "at "}` },
        { text: org.org_name, href: `/admin/organizations/${org.org_id}` },
      ],
      priority: 4,
    });
  }

  chains.sort((a, b) => a.priority - b.priority);
  return chains;
}

export function PersonCorrelationSummary({
  personEvents,
  personOrgs,
  orgEventLinks,
}: PersonCorrelationSummaryProps) {
  const chains = buildChains(personEvents, personOrgs, orgEventLinks);

  if (chains.length === 0) {
    return null;
  }

  // Split into primary (first chain) and secondary
  const primary = chains[0];
  const secondary = chains.slice(1);

  return (
    <div className="glass rounded-xl px-5 py-4">
      {/* Primary chain */}
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {primary.parts.map((part, i) =>
          part.badge ? (
            <Badge key={`primary-${part.text}-${i}`} variant={part.badge} className="mx-0.5">
              {part.text}
            </Badge>
          ) : part.href ? (
            <Link
              key={`primary-${part.text}-${i}`}
              href={part.href}
              className="text-[var(--accent-indigo)] hover:underline"
            >
              {part.text}
            </Link>
          ) : (
            <span key={`primary-${part.text}-${i}`}>{part.text}</span>
          )
        )}
      </p>

      {/* Secondary chains */}
      {secondary.length > 0 && (
        <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed">
          <span className="text-[var(--text-muted)]">Also: </span>
          {secondary.map((chain, ci) => (
            <span key={`chain-${ci}`}>
              {ci > 0 && <span> · </span>}
              {chain.parts.map((part, pi) =>
                part.badge ? (
                  <Badge key={`sec-${ci}-${part.text}-${pi}`} variant={part.badge} className="mx-0.5">
                    {part.text}
                  </Badge>
                ) : part.href ? (
                  <Link
                    key={`sec-${ci}-${part.text}-${pi}`}
                    href={part.href}
                    className="text-[var(--accent-indigo)] hover:underline"
                  >
                    {part.text}
                  </Link>
                ) : (
                  <span key={`sec-${ci}-${part.text}-${pi}`}>{part.text}</span>
                )
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
