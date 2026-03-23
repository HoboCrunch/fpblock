/**
 * Seed the database with foundational data and import enriched_speakers.csv
 *
 * Usage: npx tsx scripts/seed-and-import.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Authenticate to satisfy RLS
async function authenticate() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "admin@gofpblock.com",
    password: "changeme",
  });
  if (error) {
    console.error("Auth failed:", error.message);
    console.log("Trying to create user...");
    const { error: signUpErr } = await supabase.auth.signUp({
      email: "admin@gofpblock.com",
      password: "changeme",
    });
    if (signUpErr) {
      console.error("Signup also failed:", signUpErr.message);
      process.exit(1);
    }
    // Try login again
    const { error: retryErr } = await supabase.auth.signInWithPassword({
      email: "admin@gofpblock.com",
      password: "changeme",
    });
    if (retryErr) {
      console.error("Auth retry failed:", retryErr.message);
      process.exit(1);
    }
  }
  console.log("Authenticated as admin@gofpblock.com\n");
}

async function seedFoundational() {
  console.log("Seeding foundational data...");

  // Sender profiles
  const { error: senderErr } = await supabase.from("sender_profiles").upsert([
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "JB",
      email: "jb@gofpblock.com",
      tone_notes: "Direct and confident. Lead with permanence and ownership. Keep it conversational — no fluff.",
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "Wes",
      email: "wes@gofpblock.com",
      tone_notes: "Warm and curious. Ask questions. Emphasise trust boundaries and incentive alignment.",
    },
  ], { onConflict: "id" });
  if (senderErr) console.error("Sender profiles:", senderErr.message);
  else console.log("  Sender profiles: OK");

  // Events
  const { error: eventErr } = await supabase.from("events").upsert([
    {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "EthCC 2026",
      location: "Cannes, France",
      date_start: "2026-06-30",
      date_end: "2026-07-03",
      website: "https://ethcc.io",
    },
    {
      id: "b0000000-0000-0000-0000-000000000002",
      name: "TOKEN2049 Dubai 2026",
      location: "Dubai, UAE",
      date_start: "2026-04-30",
      date_end: "2026-05-01",
      website: "https://token2049.com",
    },
  ], { onConflict: "id" });
  if (eventErr) console.error("Events:", eventErr.message);
  else console.log("  Events: OK");

  // Prompt templates
  const { error: promptErr } = await supabase.from("prompt_templates").upsert([
    {
      id: "c0000000-0000-0000-0000-000000000001",
      name: "EthCC LinkedIn Intro",
      channel: "linkedin",
      system_prompt: "You are a concise outreach copywriter for FP Block, a protocol that gives projects permanent, verifiable ownership of their infrastructure. Write a professional LinkedIn InMail (3-5 sentences). Lead with permanence, ownership, irreversibility, incentives, or trust boundaries. NEVER use: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless absolutely essential. Match the sender tone notes.",
      user_prompt_template: "Write a LinkedIn intro message for {{contact.full_name}} ({{contact.title}} at {{company.name}}).\nCompany context: {{company.context}}\nSender: {{sender.name}}\nSender tone: {{sender.tone_notes}}\nCTA: {{cta}}\nEvent: EthCC 2026",
    },
    {
      id: "c0000000-0000-0000-0000-000000000002",
      name: "EthCC Email Intro",
      channel: "email",
      system_prompt: "You are a concise outreach copywriter for FP Block, a protocol that gives projects permanent, verifiable ownership of their infrastructure. Write a professional email (3-5 sentences) with a subject line. Lead with permanence, ownership, irreversibility, incentives, or trust boundaries. NEVER use: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless absolutely essential. Match the sender tone notes.",
      user_prompt_template: "Write an intro email for {{contact.full_name}} ({{contact.title}} at {{company.name}}).\nCompany context: {{company.context}}\nSender: {{sender.name}}\nSender tone: {{sender.tone_notes}}\nCTA: {{cta}}\nEvent: EthCC 2026",
    },
  ], { onConflict: "id" });
  if (promptErr) console.error("Prompt templates:", promptErr.message);
  else console.log("  Prompt templates: OK");

  // Event config
  const { error: ecErr } = await supabase.from("event_config").upsert([{
    event_id: "b0000000-0000-0000-0000-000000000001",
    sender_id: "a0000000-0000-0000-0000-000000000001",
    prompt_template_id: "c0000000-0000-0000-0000-000000000001",
  }], { onConflict: "event_id" });
  if (ecErr) console.error("Event config:", ecErr.message);
  else console.log("  Event config: OK");

  // Inbox sync state
  const { error: inboxErr } = await supabase.from("inbox_sync_state").upsert([
    { account_email: "jb@gofpblock.com" },
    { account_email: "wes@gofpblock.com" },
  ], { onConflict: "account_email" });
  if (inboxErr) console.error("Inbox sync:", inboxErr.message);
  else console.log("  Inbox sync state: OK");
}

async function importSpeakers() {
  console.log("\nImporting enriched_speakers.csv...");

  const csv = readFileSync("scraping/data/enriched_speakers.csv", "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });

  console.log(`  Parsed ${rows.length} rows`);

  const ethccEventId = "b0000000-0000-0000-0000-000000000001";
  let contactsCreated = 0;
  let companiesCreated = 0;
  let linked = 0;
  let errors = 0;

  // Track companies to avoid duplicates
  const companyMap = new Map<string, string>(); // name -> id

  for (const row of rows) {
    try {
      const name = (row.Name || "").trim();
      if (!name) continue;

      const companyName = (row.Company || "").trim();
      let companyId: string | null = null;

      // Create/get company
      if (companyName) {
        const normalizedName = companyName.toUpperCase();
        if (companyMap.has(normalizedName)) {
          companyId = companyMap.get(normalizedName)!;
        } else {
          // Check if exists
          const { data: existing } = await supabase
            .from("companies")
            .select("id")
            .ilike("name", companyName)
            .limit(1)
            .single();

          if (existing) {
            companyId = existing.id;
          } else {
            const score = parseInt(row.Score) || null;
            const { data: newCo, error: coErr } = await supabase
              .from("companies")
              .insert({
                name: companyName,
                icp_score: score,
                category: (row["Cat 1"] || "").trim() || null,
              })
              .select("id")
              .single();

            if (coErr) {
              console.error(`  Company "${companyName}":`, coErr.message);
            } else if (newCo) {
              companyId = newCo.id;
              companiesCreated++;
            }
          }
          if (companyId) companyMap.set(normalizedName, companyId);
        }
      }

      // Parse name
      const nameParts = name.split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");

      // Create contact
      const email = (row.Email || "").trim() || null;
      const linkedin = (row.LinkedIn || "").trim() || null;
      const twitter = (row.X || "").trim() || null;
      const title = (row.Role || "").trim() || null;

      // Check for existing contact by email or name
      let existingContact = null;
      if (email) {
        const { data } = await supabase
          .from("contacts")
          .select("id")
          .eq("email", email)
          .limit(1)
          .single();
        existingContact = data;
      }
      if (!existingContact) {
        const { data } = await supabase
          .from("contacts")
          .select("id")
          .ilike("full_name", name)
          .limit(1)
          .single();
        existingContact = data;
      }

      let contactId: string;

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Build context from available fields
        const contextParts: string[] = [];
        if (row.Hub) contextParts.push(`Track: ${row.Hub}`);
        if (row.Hub_Title) contextParts.push(`Talk: ${row.Hub_Title}`);
        if (row.Question) contextParts.push(`Key question: ${row.Question}`);
        if (row.Notes) contextParts.push(row.Notes);

        const { data: newContact, error: cErr } = await supabase
          .from("contacts")
          .insert({
            full_name: name,
            first_name: firstName || null,
            last_name: lastName || null,
            email,
            linkedin,
            twitter,
            title,
            seniority: (row.Role_Type || "").trim() || null,
            context: contextParts.join(". ") || null,
            source: "ethcc_speakers",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`  Contact "${name}":`, cErr.message);
          errors++;
          continue;
        }
        contactId = newContact!.id;
        contactsCreated++;
      }

      // Link contact to company
      if (companyId) {
        await supabase.from("contact_company").upsert({
          contact_id: contactId,
          company_id: companyId,
          role: title,
          role_type: (row.Role_Type || "").trim() || null,
          is_primary: true,
          source: "ethcc_speakers",
        }, { onConflict: "contact_id,company_id" });
      }

      // Link contact to EthCC event
      const { error: ceErr } = await supabase.from("contact_event").upsert({
        contact_id: contactId,
        event_id: ethccEventId,
        participation_type: "speaker",
        track: (row.Hub || "").trim() || null,
        notes: (row.Hub_Title || "").trim() || null,
      }, { onConflict: "contact_id,event_id" });

      if (!ceErr) linked++;

      // Link company to EthCC event if not already
      if (companyId) {
        await supabase.from("company_event").upsert({
          company_id: companyId,
          event_id: ethccEventId,
          relationship_type: "speaker",
        }, { onConflict: "company_id,event_id" });
      }

      // Import existing message if available
      const message = (row.Message || "").trim();
      if (message) {
        const sender = (row.Sender || "").trim().toLowerCase();
        const senderId = sender === "wes"
          ? "a0000000-0000-0000-0000-000000000002"
          : "a0000000-0000-0000-0000-000000000001";

        // Determine channel and status from CSV flags
        const linkedinSent = (row.LinkedIn_Sent || "").trim().toLowerCase() === "yes";
        const emailSent = (row.Email_Sent || "").trim().toLowerCase() === "yes";
        const xSent = (row.X_Sent || "").trim().toLowerCase() === "yes";
        const hasReply = (row.Reply || "").trim().length > 0;

        // Create LinkedIn message if we have LinkedIn
        if (linkedin) {
          await supabase.from("messages").insert({
            contact_id: contactId,
            company_id: companyId,
            event_id: ethccEventId,
            channel: "linkedin",
            sequence_number: 1,
            iteration: 1,
            body: message,
            status: hasReply ? "replied" : linkedinSent ? "sent" : "draft",
            sender_id: senderId,
            sent_at: linkedinSent ? new Date().toISOString() : null,
            replied_at: hasReply ? new Date().toISOString() : null,
          });
        }

        // Create email message if we have email
        if (email) {
          await supabase.from("messages").insert({
            contact_id: contactId,
            company_id: companyId,
            event_id: ethccEventId,
            channel: "email",
            sequence_number: 1,
            iteration: 1,
            subject: `Meeting at EthCC?`,
            body: message,
            status: hasReply ? "replied" : emailSent ? "sent" : "draft",
            sender_id: senderId,
            sent_at: emailSent ? new Date().toISOString() : null,
            replied_at: hasReply ? new Date().toISOString() : null,
          });
        }

        // Create Twitter/X message if we have handle
        if (twitter) {
          await supabase.from("messages").insert({
            contact_id: contactId,
            company_id: companyId,
            event_id: ethccEventId,
            channel: "twitter",
            sequence_number: 1,
            iteration: 1,
            body: message,
            status: hasReply ? "replied" : xSent ? "sent" : "draft",
            sender_id: senderId,
            sent_at: xSent ? new Date().toISOString() : null,
            replied_at: hasReply ? new Date().toISOString() : null,
          });
        }
      }
    } catch (err) {
      errors++;
      console.error(`  Row error:`, err);
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Contacts created: ${contactsCreated}`);
  console.log(`  Companies created: ${companiesCreated}`);
  console.log(`  Event links: ${linked}`);
  console.log(`  Errors: ${errors}`);
}

async function main() {
  await authenticate();
  await seedFoundational();
  await importSpeakers();

  // Final counts
  const tables = ["contacts", "companies", "events", "messages", "contact_company", "contact_event", "company_event", "sender_profiles", "prompt_templates"];
  console.log("\nFinal table counts:");
  for (const table of tables) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${table}: ${count}`);
  }
}

main().catch(console.error);
