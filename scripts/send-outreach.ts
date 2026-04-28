import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { config } from "dotenv";
import { sendEmail } from "../lib/sendgrid";

config({ path: ".env.local" });

const CSV_PATH = process.argv.includes("--csv")
  ? process.argv[process.argv.indexOf("--csv") + 1]
  : "consensus/outreach_messages.csv";
const SEND_LOG = "consensus/send_log.jsonl";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : Infinity;
const TEST_TO = process.argv.includes("--test-to") ? process.argv[process.argv.indexOf("--test-to") + 1] : null;

const SENDER_NAMES: Record<string, string> = {
  "wes@gofpblock.com": "Wes Crook",
  "jb@gofpblock.com": "JB at FP Block",
};

type Row = Record<string, string>;

function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // URL-ify bare URLs
  const linked = escaped.replace(
    /(https?:\/\/[^\s<)]+)/g,
    '<a href="$1" style="color:#f58327;text-decoration:underline;">$1</a>'
  );
  // Split on blank lines → paragraphs; within paragraphs preserve single line breaks
  const paras = linked.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#111;">${paras}</div>`;
}

async function main() {
  const rows = parse(readFileSync(CSV_PATH, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Row[];

  // Load existing send log to skip already-sent
  const alreadySent = new Set<string>();
  if (existsSync(SEND_LOG)) {
    const lines = readFileSync(SEND_LOG, "utf-8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.status === "success" && !entry.dry_run) alreadySent.add(entry.person_id);
      } catch {
        // skip malformed
      }
    }
  }

  const queue = rows.filter((r) => {
    if (!r.email) return false;
    if (alreadySent.has(r.person_id)) return false;
    if (!r.subject || !r.body) return false;
    return true;
  });

  const capped = queue.slice(0, LIMIT);

  console.log(`Total rows:          ${rows.length}`);
  console.log(`Rows with email:     ${rows.filter((r) => r.email).length}`);
  console.log(`Already sent:        ${alreadySent.size}`);
  console.log(`In queue this run:   ${queue.length}`);
  console.log(`Will send this run:  ${capped.length}${LIMIT < queue.length ? ` (capped by --limit ${LIMIT})` : ""}`);
  console.log(`Dry run:             ${DRY_RUN ? "YES — no API calls" : "NO — LIVE SENDS"}`);
  if (TEST_TO) console.log(`⚠️  TEST REDIRECT:    All emails will go to ${TEST_TO} instead of recipients`);
  console.log(`Pacing:              1 per second`);
  console.log(`Log:                 ${SEND_LOG}`);
  console.log();

  if (!DRY_RUN && !TEST_TO) {
    // Final safety: require explicit --yes flag
    if (!process.argv.includes("--yes")) {
      console.log("❌ Refusing to live-send without --yes flag. Re-run with --yes to proceed.");
      process.exit(1);
    }
  }

  let successes = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  const startTime = Date.now();

  for (let i = 0; i < capped.length; i++) {
    const r = capped[i];
    const to = TEST_TO ?? r.email;
    const fromName = SENDER_NAMES[r.sender_email] ?? "FP Block";
    const subject = TEST_TO ? `[TEST → ${r.email}] ${r.subject}` : r.subject;

    let result: { success: boolean; messageId?: string; error?: string };

    if (DRY_RUN) {
      result = { success: true, messageId: "dry-run" };
    } else {
      result = await sendEmail({
        to,
        from: { email: r.sender_email, name: fromName },
        subject,
        html: bodyToHtml(r.body),
        replyTo: r.sender_email,
      });
    }

    const logEntry = {
      ts: new Date().toISOString(),
      person_id: r.person_id,
      full_name: r.full_name,
      email: r.email,
      to_actual: to,
      sender: r.sender_email,
      subject: r.subject,
      status: result.success ? "success" : "failure",
      messageId: result.messageId,
      error: result.error,
      dry_run: DRY_RUN,
    };
    appendFileSync(SEND_LOG, JSON.stringify(logEntry) + "\n");

    if (result.success) {
      successes++;
      consecutiveFailures = 0;
    } else {
      failures++;
      consecutiveFailures++;
      console.log(`  ✗ [${i + 1}/${capped.length}] ${r.full_name} <${r.email}>: ${result.error?.slice(0, 150) ?? "unknown"}`);
    }

    if ((i + 1) % 10 === 0 || i === capped.length - 1) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  … ${i + 1}/${capped.length} | ✓ ${successes} / ✗ ${failures} | ${elapsed}s elapsed`);
    }

    // Abort if we're seeing consecutive failures early — probably an auth/config issue
    if (consecutiveFailures >= 3 && i < 5) {
      console.error(`\n🛑 Aborting — ${consecutiveFailures} consecutive failures in first ${i + 1} sends. Likely auth/sender-verification issue.`);
      break;
    }

    // Pace: 1 per second, minus the time already spent on the API call
    if (i < capped.length - 1) {
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`✓ Sent:     ${successes}`);
  console.log(`✗ Failed:   ${failures}`);
  console.log(`Duration:   ${Math.round((Date.now() - startTime) / 1000)}s`);
  console.log(`Log:        ${SEND_LOG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
