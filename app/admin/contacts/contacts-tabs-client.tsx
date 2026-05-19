"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PersonsTableClient } from "@/app/admin/persons/persons-table-client";
import { OrganizationsTableClient } from "@/app/admin/organizations/organizations-table-client";
import type { LoadPersonRowsResult } from "@/lib/data/load-person-rows";
import type { LoadOrgRowsResult } from "@/lib/data/load-org-rows";

export type ContactsTab = "persons" | "organizations";

interface ContactsTabsClientProps {
  initialTab: ContactsTab;
  personData: LoadPersonRowsResult;
  orgData: LoadOrgRowsResult;
}

export function ContactsTabsClient({
  initialTab,
  personData,
  orgData,
}: ContactsTabsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ContactsTab>(initialTab);

  const handleSelect = useCallback(
    (tab: ContactsTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      router.replace(`/admin/contacts?tab=${tab}`, { scroll: false });
    },
    [activeTab, router],
  );

  const personCount = personData.rows.length;
  const orgCount = orgData.rows.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-1 pb-3 shrink-0">
        <div
          role="tablist"
          aria-label="Contacts type"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--glass-bg)]/60 backdrop-blur-md border border-[var(--glass-border)]"
        >
          <TabButton
            label="Persons"
            count={personCount}
            active={activeTab === "persons"}
            onClick={() => handleSelect("persons")}
          />
          <TabButton
            label="Organizations"
            count={orgCount}
            active={activeTab === "organizations"}
            onClick={() => handleSelect("organizations")}
          />
        </div>
      </div>

      <div className={cn("flex-1 min-h-0", activeTab === "persons" ? "block" : "hidden")}>
        <PersonsTableClient
          rows={personData.rows}
          eventOptions={personData.eventOptions}
          sourceOptions={personData.sourceOptions}
          seniorityOptions={personData.seniorityOptions}
          departmentOptions={personData.departmentOptions}
        />
      </div>

      <div className={cn("flex-1 min-h-0", activeTab === "organizations" ? "block" : "hidden")}>
        <OrganizationsTableClient
          rows={orgData.rows}
          filterOptions={orgData.filterOptions}
          orgPeopleMap={orgData.orgPeopleMap}
        />
      </div>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-3.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
        "flex items-center gap-2",
        active
          ? "bg-[var(--accent-orange)]/[0.14] text-[var(--accent-orange)] shadow-[inset_0_0_0_1px_var(--accent-orange)]/30"
          : "text-[var(--text-muted)] hover:text-white hover:bg-white/[0.04]",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "text-xs tabular-nums px-1.5 py-0.5 rounded",
          active
            ? "bg-[var(--accent-orange)]/[0.18] text-[var(--accent-orange)]"
            : "bg-white/[0.05] text-[var(--text-muted)]/80",
        )}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}
