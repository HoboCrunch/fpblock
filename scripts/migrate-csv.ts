import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!
);

const BASE = process.cwd();
const SCRAPING = `${BASE}/scraping/data`;
const MATRIX = `${BASE}/app/data/matrix/base`;

function readCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) {
    console.log(`  ⚠ File not found: ${path}, skipping`);
    return [];
  }
  return parse(readFileSync(path, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

// Dedup maps
const companyMap = new Map<string, string>(); // name -> uuid
const contactMap = new Map<string, string>(); // "fullname|company" -> uuid

async function upsertCompany(
  name: string,
  fields: Record<string, any> = {}
): Promise<string> {
  const key = name.toUpperCase().trim();
  if (companyMap.has(key)) {
    const existingId = companyMap.get(key)!;
    if (Object.keys(fields).length > 0) {
      await supabase.from("companies").update(fields).eq("id", existingId);
    }
    return existingId;
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", key)
    .limit(1)
    .single();

  if (existing) {
    companyMap.set(key, existing.id);
    if (Object.keys(fields).length > 0) {
      await supabase.from("companies").update(fields).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: inserted } = await supabase
    .from("companies")
    .insert({ name: name.trim(), ...fields })
    .select("id")
    .single();

  companyMap.set(key, inserted!.id);
  return inserted!.id;
}

async function upsertContact(
  fullName: string,
  companyName: string,
  fields: Record<string, any> = {}
): Promise<string> {
  const key = `${fullName.toUpperCase().trim()}|${companyName.toUpperCase().trim()}`;
  if (contactMap.has(key)) {
    const existingId = contactMap.get(key)!;
    if (Object.keys(fields).length > 0) {
      await supabase.from("contacts").update(fields).eq("id", existingId);
    }
    return existingId;
  }

  const names = fullName.trim().split(/\s+/);
  const firstName = names[0];
  const lastName = names.slice(1).join(" ");

  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .ilike("full_name", fullName.trim())
    .limit(1)
    .single();

  if (existing) {
    contactMap.set(key, existing.id);
    if (Object.keys(fields).length > 0) {
      await supabase.from("contacts").update(fields).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: inserted } = await supabase
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName.trim(),
      ...fields,
    })
    .select("id")
    .single();

  contactMap.set(key, inserted!.id);
  return inserted!.id;
}

async function main() {
  console.log("Starting migration...");

  // Get event IDs (seeded)
  const { data: events } = await supabase.from("events").select("id, name");
  const ethccId = events?.find((e) => e.name === "EthCC 2026")?.id;
  if (!ethccId)
    throw new Error("EthCC 2026 event not found — run seed.sql first");

  // ── 1. Sponsors ──────────────────────────────────────────────────────
  console.log("1. Importing sponsors...");
  const sponsors = readCsv(`${SCRAPING}/sponsors.csv`);
  // columns: tier, name, website, description
  for (const s of sponsors) {
    const companyId = await upsertCompany(s.name, {
      website: s.website || null,
      description: s.description || null,
    });
    await supabase
      .from("company_event")
      .upsert(
        {
          company_id: companyId,
          event_id: ethccId,
          relationship_type: "sponsor",
          sponsor_tier: s.tier || null,
        },
        { onConflict: "company_id,event_id" }
      )
      .select();
  }
  console.log(`  → ${sponsors.length} sponsors imported`);

  // ── 2. Company research ──────────────────────────────────────────────
  console.log("2. Importing company research...");
  const research = readCsv(`${SCRAPING}/company_research.csv`);
  // columns: icp_score, company, usp, icp_reason
  for (const r of research) {
    await upsertCompany(r.company, {
      usp: r.usp || null,
      icp_score: r.icp_score ? parseInt(r.icp_score) : null,
      icp_reason: r.icp_reason || null,
    });
  }
  console.log(`  → ${research.length} companies enriched with ICP data`);

  // ── 3. Company news / signals ────────────────────────────────────────
  console.log("3. Importing company signals...");
  const newsPath = `${SCRAPING}/company_news_cache.json`;
  let signalCount = 0;
  if (existsSync(newsPath)) {
    const news: Record<string, string> = JSON.parse(
      readFileSync(newsPath, "utf-8")
    );
    for (const [companyName, description] of Object.entries(news)) {
      if (
        description.includes("No notable recent news") ||
        description.includes("No recent 2025-2026 news")
      )
        continue;
      const companyId = await upsertCompany(companyName, {
        context: description,
      });
      await supabase.from("company_signals").insert({
        company_id: companyId,
        signal_type: "news",
        description,
        source: "company_news_cache",
      });
      signalCount++;
    }
  }
  console.log(`  → ${signalCount} signals imported`);

  // ── 4. Cannes-Grid view (speakers) ───────────────────────────────────
  console.log("4. Importing speakers...");
  const grid = readCsv(`${MATRIX}/Cannes-Grid view.csv`);
  // columns: Score, Name, Open URL, Message, Email, Emails Sent, Role,
  //          Role_Type, Role_2, Company, Category (from Company), Subject,
  //          LinkedIn, LinkedIn_Sent, X, X_Sent, Cat 1, Notes, Reply,
  //          Comment, Messages Sent
  for (const row of grid) {
    const name = row.Name?.trim();
    const company = row.Company?.trim();
    if (!name) continue;

    const companyId = company
      ? await upsertCompany(company, {
          category: row["Category (from Company)"] || row["Cat 1"] || null,
          description: row.Notes || null,
        })
      : null;

    const contactId = await upsertContact(name, company || "", {
      title: row.Role || null,
      email: row.Email || null,
      linkedin: row.LinkedIn || null,
      twitter: row.X || null,
      source: "speakers",
    });

    if (companyId) {
      await supabase
        .from("contact_company")
        .upsert(
          {
            contact_id: contactId,
            company_id: companyId,
            role: row.Role || null,
            role_type: row.Role_Type || null,
            is_primary: true,
            source: "speakers",
          },
          { onConflict: "contact_id,company_id" }
        )
        .select();
    }

    await supabase
      .from("contact_event")
      .upsert(
        {
          contact_id: contactId,
          event_id: ethccId,
          participation_type: "speaker",
        },
        { onConflict: "contact_id,event_id" }
      )
      .select();

    if (row.Message?.trim()) {
      await supabase.from("messages").insert({
        contact_id: contactId,
        company_id: companyId,
        event_id: ethccId,
        channel: "email",
        sequence_number: 1,
        iteration: 1,
        subject: row.Subject || null,
        body: row.Message.trim(),
        status: "draft",
      });
    }
  }
  console.log(`  → ${grid.length} speaker rows imported`);

  // ── 5. Sponsor contacts ──────────────────────────────────────────────
  console.log("5. Importing sponsor contacts...");
  const sponsorContacts = readCsv(`${SCRAPING}/sponsor_contacts.csv`);
  // columns: company, tier, person_name, first_name, last_name, title,
  //          seniority, department, email, linkedin, twitter, phone,
  //          org_name, apollo_id
  for (const sc of sponsorContacts) {
    const companyId = await upsertCompany(sc.company);
    const contactId = await upsertContact(sc.person_name, sc.company || "", {
      first_name: sc.first_name || null,
      last_name: sc.last_name || null,
      title: sc.title || null,
      seniority: sc.seniority || null,
      department: sc.department || null,
      email: sc.email || null,
      linkedin: sc.linkedin || null,
      twitter: sc.twitter || null,
      phone: sc.phone || null,
      apollo_id: sc.apollo_id || null,
      source: "apollo",
    });

    await supabase
      .from("contact_company")
      .upsert(
        {
          contact_id: contactId,
          company_id: companyId,
          role: sc.title || null,
          source: "apollo",
        },
        { onConflict: "contact_id,company_id" }
      )
      .select();

    await supabase
      .from("contact_event")
      .upsert(
        {
          contact_id: contactId,
          event_id: ethccId,
          participation_type: "sponsor_rep",
        },
        { onConflict: "contact_id,event_id" }
      )
      .select();
  }
  console.log(`  → ${sponsorContacts.length} sponsor contacts imported`);

  console.log("\nMigration complete!");
}

main().catch(console.error);
