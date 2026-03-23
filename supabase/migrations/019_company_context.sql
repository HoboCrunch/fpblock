-- 019_company_context.sql
-- Singleton table for company profile context used in enrichment/generation flows

CREATE TABLE IF NOT EXISTS company_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'FP Block',
  about text,
  icp_criteria text,
  positioning text,
  language_rules text,
  outreach_strategy text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER trg_company_context_updated_at
  BEFORE UPDATE ON company_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE company_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON company_context
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Seed with current hardcoded values
INSERT INTO company_context (company_name, about, icp_criteria, positioning, language_rules) VALUES (
  'FP Block',
  'FP Block is a full-stack engineering firm that builds and rescues mission-critical systems. They use a proprietary framework (Kolme) to give clients the performance of a dedicated infrastructure with the flexibility of a multi-system world — architecting systems where failure is not an option. FP Block provides a third path: application-specific infrastructure with isolation, control, and seamless interoperability — so teams own what they build without being cut off from the broader ecosystem.',
  'FP Block — 2026 ICP One-Pager (Clean)

What Defines Our ICP
We work with teams that need to move fast, but cannot afford to be wrong.
Our ICP is defined by decision pressure under permanence, not by industry, funding stage, or technology choice.

The Core ICP Test
A team is a real ICP when 4 of 5 are true:
1. Being wrong carries a clear financial, reputational, or legal cost
2. That cost is persistent or externally visible
3. They are already aware of this risk
4. Decisions accelerate once clarity appears
5. They value avoiding irreversible regret more than maximising short-term speed
If fewer than 4 are true -> do not advance.

One-Sentence ICP Profiles (2026)
- Regret-Aware Builders — Teams making irreversible system decisions where failure would create lasting financial, reputational, or legal damage.
- Systemically Exposed Operators — Teams running live, persistent systems where failures propagate directly to users and cannot be quietly reset.
- Regulated or Regulation-Bound Teams — Teams whose systems must withstand audits, enforcement, or legal challenge once deployed.
- Infrastructure Stewards — Teams responsible for long-lived systems where ownership, explainability, and failure accountability matter more than feature velocity.
- AI-Accelerated, Decision-Heavy Teams — Teams shipping quickly with AI where execution is cheap but architectural mistakes permanently lock in risk.

Cost of Being Wrong (At Least One Must Be Present)
Financial: Real money, assets, or revenue at risk; Expensive or impossible redesigns
Reputational: Public failure or trust erosion; Long or uncertain recovery timelines
Legal / Regulatory: Compliance scrutiny or audits; Personal or corporate liability
If none are clearly present -> not our ICP.

One-Sentence Firm Disqualifiers
- MVP-to-Get-Funded Teams — Building primarily to raise capital rather than live with consequences.
- Uniform-Speed Thinkers — Treating all decisions as equally reversible.
- "We''ll Fix It Later" Teams — Assuming architectural regret can always be refactored away.
- No Downside Owner — No individual clearly accountable for failure.
- Internal-Only Consequences — Being wrong only causes internal rework.
- Evangelism-Required Prospects — Needing persuasion that correctness or trust matter.
- Tool-First Buyers — Optimising stacks instead of incentives, ownership, and failure modes.
- Judgment-Averse Buyers — Willing to pay for delivery but not thinking.
If any one is dominant -> pause.

Speed Doctrine
We value speed where failure is cheap and correctness where failure is expensive.
Fail fast on reversible decisions. Slow down only where mistakes persist.',
  'FP Block is a full-stack engineering firm that builds and rescues mission-critical systems.
They use a proprietary framework (Kolme) to give clients the performance of a dedicated infrastructure with the flexibility of a multi-system world — architecting systems where failure is not an option.
FP Block provides a third path: application-specific infrastructure with isolation, control, and seamless interoperability — so teams own what they build without being cut off from the broader ecosystem.',
  'Lead with: permanence, ownership, irreversibility, incentives, trust boundaries.
AVOID using these words/phrases unless absolutely essential: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK.
If the problem sounds real without naming blockchain, describe it that way.'
);
