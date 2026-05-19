// Export email-napalm.csv: every person with email, classified into 4 quadrants.
//
// Quadrants:
//   1 = Consensus speaker
//   2 = C-suite / founder / engineering at a Consensus sponsor or partner org
//   3 = Speaker OR C-suite/eng-at-sponsor for any non-Consensus event (EthCC 9, DC Blockchain)
//   4 = Everyone else with email
//
// Run with env loaded:
//   set -a && source .env.local && set +a && node scripts/export_email_napalm.mjs

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars');
const sb = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;

async function paginate(table, columns, filterFn) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const ENG_TITLE_RE = /(engineer|engineering|developer|cto|chief technolog|head of (engineering|tech|product|protocol)|architect|tech lead|principal|protocol|technical|founder)/i;
const CSUITE_SENIORITY = new Set(['c_suite', 'founder']);
const CSUITE_ROLE_TYPE = new Set(['founder', 'executive']);
const CSUITE_TITLE_RE = /(chief\s|^ceo$|^cto$|^cfo$|^coo$|^cio$|^cmo$|^cso$|founder|president|partner)/i;

const SUBJECT = (firstName) => `Invite For ${firstName} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`;

function renderTemplate(quadrant, firstName, company) {
  const subject = SUBJECT(firstName);
  let body;
  if (quadrant === 1) {
    body = `Hi ${firstName},

Saw you're speaking at Consensus. Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner in Miami next Tuesday evening, upmarket restaurant, hand-picked room — real conversation about what it takes to build and scale networks & applications securely and on time.

Invite-and-apply only; the link below is yours. Time and venue go out on confirmation.

https://luma.com/k0y45b3p

Wes
CEO, FP Block`;
  } else if (quadrant === 2) {
    const opener = company ? `Saw ${company} is at Consensus.` : `Saw your team is at Consensus.`;
    body = `Hi ${firstName},

${opener} Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner in Miami next Tuesday evening, upmarket restaurant, hand-picked room — built around the conversation people actually want to have about scaling networks & applications that ship securely and on time.

Closed event, by application. Link is yours; venue details go out on confirmation.

https://luma.com/k0y45b3p

Wes
CEO, FP Block`;
  } else if (quadrant === 3) {
    const work = company ? `your work at ${company}` : `your work`;
    body = `Hi ${firstName},

Long shot — not sure if you're in Miami next week. Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner Tuesday May 6 evening, upmarket restaurant, hand-picked room — real conversation about what it takes to build networks & applications that ship securely and on time, even under pressure.

Came across ${work} and thought you'd belong at the table. If you happen to be in town, the link below is yours.

https://luma.com/k0y45b3p

Wes
CEO, FP Block`;
  } else {
    const work = company ? `Your work at ${company}` : `Your work`;
    body = `Hi ${firstName},

Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++, 18 patents) and I are hosting a private dinner in Miami on Tuesday May 6 evening. Upmarket restaurant, hand-picked room — the kind of evening where you actually get to think out loud with people building things that have to work.

${work} put you on the list. If you're in Miami that week, the link below is yours.

https://luma.com/k0y45b3p

Wes
CEO, FP Block`;
  }
  return { subject, body };
}

function isCsuiteOrEng({ seniority, role_type, title }) {
  if (seniority && CSUITE_SENIORITY.has(seniority)) return true;
  if (role_type && CSUITE_ROLE_TYPE.has(role_type)) return true;
  if (title && (CSUITE_TITLE_RE.test(title) || ENG_TITLE_RE.test(title))) return true;
  return false;
}

const csv = (v) => {
  if (v == null) return '';
  const s = String(v).replace(/\r\n/g, '\n');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

console.log('Loading events...');
const { data: events } = await sb.from('events').select('id, slug, name');
const eventBySlug = Object.fromEntries(events.map(e => [e.slug, e]));
const consensusId = eventBySlug.consensus.id;
const otherEventIds = events.filter(e => e.slug !== 'consensus').map(e => e.id);
const eventNameById = Object.fromEntries(events.map(e => [e.id, e.name]));

console.log('Loading event_participations...');
const eps = await paginate('event_participations', 'event_id, person_id, organization_id, role, sponsor_tier');

const consensusSpeakerPersonIds = new Set(eps.filter(e => e.event_id === consensusId && e.role === 'speaker' && e.person_id).map(e => e.person_id));
const consensusSponsorOrgIds = new Set(eps.filter(e => e.event_id === consensusId && (e.role === 'sponsor' || e.role === 'partner') && e.organization_id).map(e => e.organization_id));
const otherSpeakerPersonIds = new Set(eps.filter(e => otherEventIds.includes(e.event_id) && e.role === 'speaker' && e.person_id).map(e => e.person_id));
const otherSponsorOrgIds = new Set(eps.filter(e => otherEventIds.includes(e.event_id) && (e.role === 'sponsor' || e.role === 'partner') && e.organization_id).map(e => e.organization_id));

const personEventLabels = new Map();
for (const ep of eps) {
  if (!ep.person_id || !ep.role) continue;
  const label = `${eventNameById[ep.event_id]} ${ep.role}`;
  if (!personEventLabels.has(ep.person_id)) personEventLabels.set(ep.person_id, []);
  personEventLabels.get(ep.person_id).push(label);
}

console.log(`  consensus speakers: ${consensusSpeakerPersonIds.size}`);
console.log(`  consensus sponsor/partner orgs: ${consensusSponsorOrgIds.size}`);
console.log(`  other-event speakers: ${otherSpeakerPersonIds.size}`);
console.log(`  other-event sponsor orgs: ${otherSponsorOrgIds.size}`);

console.log('Loading organizations...');
const orgs = await paginate('organizations', 'id, name, website, icp_score, icp_reason, description, context, usp');
const orgById = Object.fromEntries(orgs.map(o => [o.id, o]));

console.log('Loading person_organization...');
const pos = await paginate('person_organization', 'person_id, organization_id, role, role_type, is_current, is_primary');
const personPrimaryOrg = new Map();
const personOrgs = new Map();
for (const po of pos) {
  if (!personOrgs.has(po.person_id)) personOrgs.set(po.person_id, []);
  personOrgs.get(po.person_id).push(po);
  if (po.is_primary || (!personPrimaryOrg.has(po.person_id) && po.is_current !== false)) {
    if (!personPrimaryOrg.has(po.person_id) || po.is_primary) {
      personPrimaryOrg.set(po.person_id, po);
    }
  }
}

console.log('Loading persons...');
const persons = await paginate('persons', 'id, full_name, first_name, last_name, email, linkedin_url, twitter_handle, telegram_handle, phone, title, seniority, department, bio');
const SENDER_EMAIL = process.env.NAPALM_SENDER_EMAIL || 'wes@gofpblock.com';
console.log(`  ${persons.length} persons total`);

const rows = [];
const counts = { 1: 0, 2: 0, 3: 0, 4: 0, skipped_no_email: 0 };

for (const p of persons) {
  if (!p.email) { counts.skipped_no_email++; continue; }

  const primary = personPrimaryOrg.get(p.id);
  const allOrgs = personOrgs.get(p.id) || [];
  const org = primary ? orgById[primary.organization_id] : null;
  const orgIds = allOrgs.map(o => o.organization_id);

  const inConsensusSponsorOrg = orgIds.some(id => consensusSponsorOrgIds.has(id));
  const inOtherSponsorOrg = orgIds.some(id => otherSponsorOrgIds.has(id));
  const csuiteOrEng = isCsuiteOrEng({
    seniority: p.seniority,
    role_type: primary?.role_type,
    title: p.title,
  });

  let quadrant;
  let relationship;

  if (consensusSpeakerPersonIds.has(p.id)) {
    quadrant = 1;
    relationship = 'Consensus speaker';
  } else if (inConsensusSponsorOrg && csuiteOrEng) {
    quadrant = 2;
    const sponsorOrgs = orgIds.filter(id => consensusSponsorOrgIds.has(id)).map(id => orgById[id]?.name).filter(Boolean);
    relationship = `Consensus sponsor employee (${sponsorOrgs.join('; ')})`;
  } else if (otherSpeakerPersonIds.has(p.id) || (inOtherSponsorOrg && csuiteOrEng)) {
    quadrant = 3;
    const labels = personEventLabels.get(p.id) || [];
    const sponsorOrgs = orgIds.filter(id => otherSponsorOrgIds.has(id)).map(id => orgById[id]?.name).filter(Boolean);
    if (labels.length && sponsorOrgs.length) relationship = `${labels.join(' / ')}; sponsor employee at ${sponsorOrgs.join('; ')}`;
    else if (labels.length) relationship = labels.join(' / ');
    else relationship = `Sponsor employee at ${sponsorOrgs.join('; ')}`;
  } else {
    quadrant = 4;
    relationship = '';
  }
  counts[quadrant]++;

  const tg = p.telegram_handle || (p.twitter_handle ? `@${p.twitter_handle.replace(/^@/, '')} (inferred from X)` : '');
  const x = p.twitter_handle ? `@${p.twitter_handle.replace(/^@/, '')}` : '';
  const role = p.title || primary?.role || '';

  const firstName = (p.first_name || (p.full_name || '').trim().split(/\s+/)[0] || 'there');
  const company = org?.name || '';
  const { subject, body } = renderTemplate(quadrant, firstName, company);

  rows.push({
    quadrant,
    person_id: p.id,
    sender_email: SENDER_EMAIL,
    full_name: p.full_name,
    role,
    seniority: p.seniority || '',
    company,
    relationship,
    icp_score: org?.icp_score ?? '',
    icp_reason: org?.icp_reason || '',
    website: org?.website || '',
    email: p.email,
    telegram: tg,
    x,
    linkedin: p.linkedin_url || '',
    subject,
    body,
    company_description: org?.description || '',
    company_usp: org?.usp || '',
    company_context: org?.context || '',
    person_bio: p.bio || '',
  });
}

console.log('\nQuadrant counts:', counts);

rows.sort((a, b) => a.quadrant - b.quadrant || (b.icp_score || 0) - (a.icp_score || 0) || a.full_name.localeCompare(b.full_name));

const headers = ['quadrant','person_id','sender_email','full_name','role','seniority','company','relationship','icp_score','icp_reason','website','email','telegram','x','linkedin','subject','body','company_description','company_usp','company_context','person_bio'];
const lines = [headers.join(',')];
for (const r of rows) lines.push(headers.map(h => csv(r[h])).join(','));

const outPath = process.argv[2] || 'email-napalm.csv';
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\nWrote ${rows.length} rows to ${outPath}`);
