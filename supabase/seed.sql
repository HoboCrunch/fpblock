-- seed.sql  –  Initial data for FP Block outreach platform

-- ============================================================
-- Sender Profiles
-- ============================================================
INSERT INTO sender_profiles (id, name, email, tone_notes) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'JB', 'jb@gofpblock.com',
   'Direct and confident. Lead with permanence and ownership. Keep it conversational — no fluff.'),
  ('a0000000-0000-0000-0000-000000000002', 'Wes', 'wes@gofpblock.com',
   'Warm and curious. Ask questions. Emphasise trust boundaries and incentive alignment.');

-- ============================================================
-- Events
-- ============================================================
INSERT INTO events (id, name, location, date_start, date_end, website) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'EthCC 2026', 'Cannes, France',
   '2026-06-30', '2026-07-03', 'https://ethcc.io'),
  ('b0000000-0000-0000-0000-000000000002', 'TOKEN2049 Dubai 2026', 'Dubai, UAE',
   '2026-04-30', '2026-05-01', 'https://token2049.com');

-- ============================================================
-- Prompt Templates
-- ============================================================
INSERT INTO prompt_templates (id, name, channel, system_prompt, user_prompt_template) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'EthCC LinkedIn Intro', 'linkedin',
   'You are a concise outreach copywriter for FP Block, a protocol that gives projects permanent, verifiable ownership of their infrastructure. Write a professional LinkedIn InMail (3-5 sentences). Lead with permanence, ownership, irreversibility, incentives, or trust boundaries. NEVER use: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless absolutely essential. Match the sender tone notes.',
   'Write a LinkedIn intro message for {{contact_name}} ({{contact_title}} at {{company_name}}).
Company context: {{company_context}}
Sender: {{sender_name}}
Sender tone: {{sender_tone}}
CTA: {{cta_text}} — {{cta_url}}
Event: {{event_name}}'),
  ('c0000000-0000-0000-0000-000000000002', 'EthCC Email Intro', 'email',
   'You are a concise outreach copywriter for FP Block, a protocol that gives projects permanent, verifiable ownership of their infrastructure. Write a professional email (3-5 sentences) with a subject line. Lead with permanence, ownership, irreversibility, incentives, or trust boundaries. NEVER use: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless absolutely essential. Match the sender tone notes.',
   'Write an intro email for {{contact_name}} ({{contact_title}} at {{company_name}}).
Company context: {{company_context}}
Sender: {{sender_name}}
Sender tone: {{sender_tone}}
CTA: {{cta_text}} — {{cta_url}}
Event: {{event_name}}');

-- ============================================================
-- Event Config
-- ============================================================
INSERT INTO event_config (event_id, sender_id, prompt_template_id) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001');
