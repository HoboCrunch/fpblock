"""
Write FP Block outreach messages directly — no external LLM needed.
Messages authored inline based on tweet data + ICP profiles.
"""
import csv, json

MESSAGES = [
    {
        "handle": "@__noided",
        "message": "Running a regulated exchange at Kraken's scale means the cost of a single wrong decision isn't abstract — it's financial loss, regulatory action, or both, at once, in public. That kind of permanence rarely shows up in architecture reviews until it's too late to fix. At FP Block we built Kolme specifically for teams that need the isolation and ownership of their own infrastructure without sacrificing reach. Would you have 20 minutes at EthCC in Cannes to talk through where that pressure shows up for you?"
    },
    {
        "handle": "@josefje",
        "message": "Your note about Ethereum not finalizing for three epochs — but keeping going, with users barely noticing — is exactly the kind of thing that looks fine until capital markets depend on it. Regulated asset issuance has zero tolerance for the gap between 'kept going' and 'guaranteed to settle.' At FP Block we built Kolme so teams running financial infrastructure own their execution environment rather than inherit someone else's liveness assumptions. Would you have 20 minutes at EthCC in Cannes to talk through where that boundary sits for OWN?"
    },
    {
        "handle": "@kiteliudingyue",
        "message": "At the scale Uniswap moves, a contract decision that seemed reasonable during deployment becomes extremely difficult to reason about when the market regime changes and hundreds of billions in liquidity depend on it. The gap between 'deployed and working' and 'owned and understood' is where the permanent costs accumulate. FP Block built Kolme for teams that need the correctness guarantees of dedicated infrastructure without losing ecosystem reach. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@chriseyin",
        "message": "\"Prove it, instead of FOMO\" is the right frame — and it's exactly the problem that RWA tokenization forces into the open, because the legal and financial record is permanent regardless of whether the proof holds. Compliance-heavy markets don't forgive infrastructure that was fast to ship but slow to own. At FP Block, Kolme gives teams their own execution environment — the control of a dedicated chain, with interoperability intact. Would you have 20 minutes at EthCC in Cannes to talk through where Plume's permanence exposure sits?"
    },
    {
        "handle": "@razacodes",
        "message": "Building a scaling layer where ZK proof failures can freeze user funds is exactly the kind of system where correctness stops being a preference and becomes a baseline. The cost of getting it wrong isn't a rollback — it's locked capital and a trust event that's hard to recover from. FP Block built Kolme for teams that need the performance of dedicated infrastructure while keeping full interoperability with the broader ecosystem. Would you have 20 minutes at EthCC in Cannes to compare notes on where Scroll draws those lines?"
    },
    {
        "handle": "@remilm",
        "message": "Routing stablecoin capital into tokenized real-world assets means every smart contract decision Lagoon makes has a legal and financial record that outlasts the sprint that shipped it. On-chain yield protocols live or die on the assumption that nothing that mattered got locked in by mistake. FP Block built Kolme for teams managing capital where the cost of an architectural error is measured in what's irreversible, not what's inconvenient. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@terencechain",
        "message": "Arbitrum carries more L2 TVL than anyone, which means the sequencer and bridge decisions made during development are now load-bearing in ways that are essentially impossible to revisit without a coordinated upgrade. That gap — between 'we shipped this' and 'we own this' — is where the permanent costs accumulate. FP Block built Kolme for teams that need the control of dedicated execution without giving up ecosystem reach. Would you have 20 minutes at EthCC in Cannes to talk through where that pressure shows up?"
    },
    {
        "handle": "@straus_fm",
        "message": "Three days without sleep reviewing 7,000 lines of code on a previously audited codebase — and the thing you're carrying the whole time is the knowledge that if you miss something, the cost lands on people who trusted the audit. That weight is what makes your work matter, and it's exactly why the infrastructure underneath critical protocols needs to be owned, not inherited. FP Block built Kolme for the teams on the other side of that — the ones building systems where what you ship becomes permanent. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@shealtielanzz",
        "message": "Running the Lighthouse client means bugs in your code don't affect one protocol — they affect the consensus layer that everything else depends on, with no clean rollback. That's the definition of a system where correctness and ownership matter more than iteration speed. FP Block builds infrastructure for teams under exactly that kind of permanence pressure, and Kolme gives clients the isolation to own their execution without losing interoperability. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@declanfox14",
        "message": "You mentioned that people don't fully appreciate the gravity of an ecosystem fund Linea's size — and you're right, because the decisions made now about how that capital flows will be very hard to change once the infrastructure that routes it is entrenched. L2s with real TVL carry the same architectural permanence problem as any financial system: what you build first becomes what you live with longest. FP Block built Kolme for teams at that inflection point. Would you have 20 minutes at EthCC in Cannes to talk through it?"
    },
    {
        "handle": "@whileydave",
        "message": "ConsenSys sits at the intersection of more critical Ethereum infrastructure than almost anyone — MetaMask, Infura, Linea — which means architectural decisions made across those layers compound in ways that get harder to untangle with scale. The cost of a wrong assumption at that depth isn't a single incident, it's a pattern that becomes structural. FP Block's Kolme framework gives teams dedicated execution with full ecosystem reach, specifically for systems where the blast radius of being wrong is too large to absorb. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@gswirski",
        "message": "ZK cryptography tooling is one of the few places where a correctness error isn't just a bug — it's a fundamental break in the trust that downstream systems are built on, and it can't be quietly patched. ReiLabs sits at that layer, which puts you in a category where 'ship fast and fix later' simply doesn't apply. FP Block built Kolme for teams like yours — where the permanence of the output demands the ownership of the environment. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@jbaylina",
        "message": "Spinning out from Polygon with seven people to continue ZisK as an independent project is exactly the kind of decision that looks like a speed tradeoff but is really an ownership decision — you chose to control the proving system rather than be a feature inside someone else's roadmap. That instinct is what FP Block is built around: Kolme gives teams dedicated execution so the critical infrastructure they build stays theirs. Would you have 20 minutes at EthCC in Cannes to compare notes on where that boundary sits?"
    },
    {
        "handle": "@jgorzny",
        "message": "Building a ZK rollup with AI-powered sequencer-level quarantining is an interesting architectural bet — you're essentially making the claim that the right place to stop a bad transaction is before it finalizes, not after. The permanence assumption embedded in that design is the right one, and it's rare. FP Block built Kolme for teams building systems under exactly that kind of irreversibility constraint. Would you have 20 minutes at EthCC in Cannes to talk through how Zircuit draws those lines?"
    },
    {
        "handle": "@mona_el_isa",
        "message": "Teaching on-chain asset management at Oxford is the signal that this is no longer a niche infrastructure question — it's a governance and accountability question that institutions are now taking seriously. The gap between 'fund managers using DeFi' and 'fund managers owning what they run on' is where Avantgarde sits, and where the permanent costs of the wrong architecture show up. FP Block built Kolme for teams at that inflection. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@lopatsi",
        "message": "Security auditing at scale means the cost of a miss isn't yours alone — it belongs to every user of the protocol you reviewed, permanently, on a public ledger. That's a different kind of accountability than most professional services carry. FP Block works with the teams on the other side of your audits — the ones building systems where correctness isn't optional — and Kolme gives them the infrastructure ownership that makes your recommendations implementable. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@acaravello",
        "message": "Shutter's bet — that the right time to stop front-running is before the transaction is visible, not after — is an architectural decision that has to be right the first time, because retrofitting cryptographic ordering guarantees into live systems is essentially impossible. Threshold encryption at that layer is load-bearing infrastructure, and its failure is immediate and measurable. FP Block built Kolme for teams making that kind of permanent architectural commitment. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@benafisch",
        "message": "A decentralized sequencer is one of those infrastructure layers that looks optional until an L2 with real TVL has a sequencer failure — and then it becomes obvious that the single point of failure was always load-bearing. Espresso is solving a problem that gets more expensive to ignore with every billion that moves through L2s. FP Block built Kolme for teams at exactly that inflection point between shared infrastructure risk and owned execution. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@0xpenryn",
        "message": "\"I haven't been this bullish on what Ethereum can achieve since TheDAO\" — and TheDAO is exactly the reference point worth keeping in mind, because the scale of ambition and the permanence of failure scale together. World Foundation's iris-biometric identity layer is the kind of system where an error in how personhood is recorded isn't fixable with a hotfix. FP Block built Kolme for teams operating at that intersection of scale and irreversibility. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@reka_eth",
        "message": "Launching a ZK proof marketplace because you're most bullish on the underlying technology is the right reason — and it's also the moment where foundational architectural decisions get locked in before the market fully understands what it's depending on. The choices you make now about how proof generation is owned and verified become very hard to revisit once protocols build on top. FP Block's Kolme framework is built for exactly that window. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@charlesdhaussy",
        "message": "Running a perpetuals exchange on its own appchain means every architectural decision dYdX has made is now load-bearing across billions in daily trading volume, with on-chain settlement that's final by design. The gap between 'we control our sequencer' and 'we own the infrastructure underneath it' is where the permanent costs live. FP Block built Kolme for exactly that type of team — full ownership, full interoperability. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@nahimdhaney",
        "message": "OpenZeppelin's libraries are the foundation that hundreds of billions in deployed contracts depend on — which means a correctness decision made in the library propagates to every protocol that imports it, silently, permanently. That's the most consequential form of systemic exposure in the ecosystem. FP Block works with the teams building on top of that foundation, and Kolme gives them dedicated infrastructure so the contracts they ship stay owned and auditable. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@nadianaise",
        "message": "Wrapping Bitcoin 1:1 on Ethereum means the custodied BTC is the backing, and an error in custody or in the bridge is measured in actual Bitcoin — irreversibly, at scale. WBTC sits at the intersection of two different finality models, and the cost of getting the interface between them wrong doesn't announce itself until it's too late. FP Block built Kolme for teams operating across that kind of permanent exposure. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@vollmond_sterne",
        "message": "The day you helped recover $4.1M was the most stressful day in three and a half years — which is the signal that formal verification isn't just a quality metric, it's the difference between a day like that and one where recovery isn't possible. Certora sits at the top of the stack where correctness is existential. FP Block works with the teams your work protects, and Kolme gives them infrastructure ownership that makes formal guarantees implementable end to end. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@tomer_ganor",
        "message": "Smart contract auditing is one of the few disciplines where the output of your work becomes someone else's permanent operational reality — if you miss something, it doesn't surface as a PR comment, it surfaces as a protocol incident. Certora's formal verification approach raises the bar specifically because it makes that risk calculable before deployment. FP Block works with teams building systems that need to survive that standard. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@s_shravan",
        "message": "A ZK coprocessor that lets contracts run verifiable computation over historical state is elegant until you consider that the protocols depending on its proofs have no recourse if the proofs are wrong — correctness is the entire product. Lagrange sits at a layer where the blast radius of a proof error is measured by what's built on top. FP Block built Kolme for teams operating under that kind of permanence constraint. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@jonk93",
        "message": "A governance-minimized stablecoin is a deliberate bet that the collateral mechanism is correct and doesn't need a committee to fix it — which means the initial design carries more permanent weight than most financial products. Frankencoin's peg is only as good as the assumptions baked in at launch. FP Block built Kolme for teams making that kind of irreversible architectural commitment, where ownership of the execution environment is the only real safety net. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@aliceandb0b",
        "message": "Formal verification exists because certain systems can't afford to learn from failure at runtime — the correctness has to be proven before anything runs. Certora occupies the highest-stakes position in the stack, and the teams that benefit most from your work are the ones where a missed property isn't a bug, it's a permanent loss event. FP Block builds infrastructure for exactly those teams. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@zk_evm",
        "message": "A zkEVM L2 inherits Ethereum's security through validity proofs — which is a stronger guarantee than optimistic rollups, but it also means that a flaw in the proof system isn't correctable with a fraud proof window. The permanence is the product, and the correctness of the proving system is load-bearing. FP Block built Kolme for teams at that inflection point. Would you have 20 minutes at EthCC in Cannes to compare notes on where Linea draws those lines?"
    },
    {
        "handle": "@maxlomu",
        "message": "You spent a weekend thinking through governance criteria for Arbitrum DAO grants — which is exactly the right instinct, because the capital allocation decisions made by a governance system at that scale become structural in ways that are hard to reverse once the ecosystem builds around them. FP Block works with teams at that inflection between fast-moving and load-bearing. Kolme gives them dedicated infrastructure to own. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@defi_made_here",
        "message": "Your breakdown of the Terra/Luna collapse — and its consequences outside the ecosystem — is one of the clearest accounts of what happens when a system built on interlocking assumptions meets the edge case those assumptions didn't account for. Fluid's unified lending/DEX design amplifies that dynamic: good debt and bad debt share the same liquidity, which means errors propagate in both directions permanently. FP Block built Kolme for teams building systems where that kind of failure isn't an option. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@conormcmenamin9",
        "message": "Maintaining a production Ethereum execution client means a bug in your code doesn't affect a single protocol — it affects network consensus, with no clean rollback and no quiet fix. Nethermind sits at the layer where correctness is existential and ownership of the client is the only meaningful safety net. FP Block builds infrastructure for teams operating under that kind of permanence pressure. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@_deanstef",
        "message": "Consensus client bugs are one of the few failure modes in this space that can't be localized — they propagate across the network before anyone can intervene, and the recovery is coordinated at a level that makes 'move fast' genuinely dangerous. Nethermind's position in that stack means the correctness decisions you make carry permanent weight. FP Block built Kolme for teams building systems with that kind of irreversibility exposure. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@ernestognw",
        "message": "OpenZeppelin's contracts are imported by protocols that collectively hold hundreds of billions — which means a correctness decision made in the library becomes someone else's permanent operational assumption, silently, at scale. That's the most consequential form of trust in the ecosystem. FP Block works with the teams building on top, and Kolme gives them dedicated infrastructure so the systems they ship stay owned and auditable. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@amxx",
        "message": "The correctness decisions made in OpenZeppelin's contracts don't belong to a single protocol — they belong to every protocol that imports them, which means a missed edge case propagates silently across the ecosystem at scale. That's a fundamentally different kind of responsibility than building one system. FP Block builds infrastructure for teams at the other end of that dependency chain, and Kolme gives them the ownership to act on your guarantees. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@nataliepropy",
        "message": "Your point about using settlement contracts as the source of truth for property ownership is exactly right — and it's also the design decision that makes correctness non-optional, because a property record that can't be trusted isn't better than the paper it replaced. Real estate title is one of the few on-chain use cases where an error isn't a bug, it's a legal dispute with permanent consequences. FP Block built Kolme for teams building systems at that standard. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@tw_tter",
        "message": "Safe secures over $100 billion in assets, which means the multisig logic that Gnosis ships is load-bearing infrastructure for a meaningful fraction of institutional capital in this space — and a bug in it isn't a protocol incident, it's a systemic event. That's the definition of a system where ownership and correctness matter more than iteration speed. FP Block built Kolme for teams operating at that layer of permanence. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@sd_eigen",
        "message": "A universal ZK proof layer that makes any chain verifiable is an ambitious claim, and the interesting risk is that the more chains depend on your proofs for settlement finality, the more load-bearing your correctness assumptions become — quietly, incrementally. ZKM sits at a layer where the cost of being wrong is inherited by everything built on top. FP Block built Kolme for exactly that category of team. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@_ericzhong",
        "message": "At the scale Uniswap routes, the smart contract decisions made during deployment are now permanent architectural features that hundreds of billions in annual trading volume depends on. The gap between 'this was the right tradeoff then' and 'this is the right tradeoff now' closes slowly, and expensively. FP Block built Kolme for teams building financial infrastructure where that gap can't be quietly resolved with an upgrade. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@andymooselee",
        "message": "Real-time transaction guardrails are only as good as the speed at which they can intervene — and the systems they're protecting are ones where a missed exploit isn't a learning opportunity, it's a permanent loss event. Mamori sits right at that line. FP Block built Kolme for the teams Mamori protects: systems where the infrastructure underneath needs to be owned, not shared, for the guardrails to actually hold. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@konyk001",
        "message": "Tokenizing AI compute infrastructure as a yield-bearing asset is a genuinely novel intersection — which means the legal and financial permanence of that structure is being defined right now, in real-time, without a lot of precedent to draw from. The decisions GAIB makes in the next year about how that infrastructure is owned and governed will be very hard to revisit later. FP Block built Kolme for teams in exactly that window. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@alexanderlee314",
        "message": "Your observation about CoW swap — one solver profitable, the rest losing — is exactly the kind of thing that looks like a market efficiency story until you realize the execution environment is the variable. Building a zkCLOB on Miden where traders are completely anonymous and orders settle provably is the right architecture, because you're eliminating the category of errors that come from trusting the infrastructure to be neutral. FP Block built Kolme for teams making that kind of commitment to owned execution. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@albicodes",
        "message": "MEV research is interesting precisely because it reveals the gap between what a protocol says it does and what actually happens when block builders optimize for value — and the cost of that gap is borne by the users who trusted the protocol's stated behavior. Flashbots X sits at the layer where that gap is either closed or exploited. FP Block built Kolme for teams that want to own the execution environment rather than inherit someone else's ordering assumptions. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@hongkim__",
        "message": "The care you put into Bitwise's Bitcoin ETF donation mechanism — no strings attached, designed to last beyond any particular market cycle — is the same instinct that matters when you're managing regulated assets at scale: the decisions you make about structure and governance outlast the moment you made them. FP Block works with regulated asset managers and Kolme gives them the infrastructure ownership to match that standard. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@lowbeta_",
        "message": "Managing multi-billion dollar regulated crypto investment products means the compliance decisions Grayscale makes now are load-bearing in ways that will be audited and litigated regardless of what the market does. The cost of an architectural error in a regulated fund isn't a reputational incident — it's a legal one with permanent consequences. FP Block built Kolme for teams operating at that intersection of capital scale and regulatory permanence. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@brevis_zk",
        "message": "A ZK coprocessor that lets contracts trustlessly access historical on-chain state is elegant infrastructure — and the protocols that build on top of it are implicitly trusting that the proofs are correct, permanently, for decisions they've already made on-chain. Brevis sits at a layer where correctness isn't a feature, it's the entire product guarantee. FP Block built Kolme for teams operating under that kind of permanence constraint. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@tradergirlsuki",
        "message": "Proprietary market-making algorithms are one of the few places where an execution error doesn't surface as a warning — it surfaces as a direct, unrecoverable capital loss, in real time, with no appeals process. Icon Trading operates at that edge, which means the infrastructure decisions you make about ownership and failure modes carry a different weight than most engineering problems. FP Block built Kolme for teams that live in that category. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@gioyik",
        "message": "Parity's Substrate framework is the substrate that sovereign blockchains run on — which means a runtime bug doesn't affect one protocol, it can halt entire networks that chose to build on your foundation. That's a fundamentally different kind of accountability than shipping a single product. FP Block built Kolme for teams that sit at that layer of permanence, where correctness is a precondition for everyone building downstream. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@pirapira",
        "message": "ZK circuit auditing is the rarest and most consequential form of security review — because a flaw in a proof circuit isn't a runtime bug, it's a broken guarantee that every system depending on those proofs has inherited silently. ZKSecurity occupies the top of that stack. FP Block works with the teams building the systems your audits protect, and Kolme gives them infrastructure ownership that makes cryptographic correctness enforceable end to end. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@mydogeceo",
        "message": "Building a decentralized, algorithmically stabilized currency layer is one of the most consequential architectural bets in this space — because a de-peg event isn't a product failure, it's a permanent loss for every holder, with no backstop and no undo. DogeOS is making that bet with conviction, which means the infrastructure underneath it needs to match that standard of ownership and correctness. FP Block built Kolme for exactly that kind of team. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@buzea200",
        "message": "Oracle price feeds are the silent assumption that DeFi collateral pricing depends on — wrong data doesn't trigger an error, it triggers a liquidation cascade that looks correct until it isn't. Chronicle's verifiable attestation model is the right architecture precisely because it makes that assumption auditable rather than inherited. FP Block works with the protocols that depend on feeds like yours, and Kolme gives them the infrastructure ownership to match that standard. Would you have 20 minutes at EthCC in Cannes?"
    },
    {
        "handle": "@definikola",
        "message": "Your breakdown of leveraged stETH-ETH risks on Aave — and the way the liquidation mechanics interact at scale — is exactly the kind of analysis that most teams don't do until after the incident. Block Analitica sits upstream of that, which means the risk models you build for protocols like MakerDAO are load-bearing long before anyone tests them under stress. FP Block built Kolme for the teams on the other side of that: the ones whose infrastructure needs to hold when your models say it won't. Would you have 20 minutes at EthCC in Cannes?"
    },
]

# Read existing CSV for metadata
import csv as csvmod
meta = {}
with open("../data/outreach_messages.csv", newline="", encoding="utf-8") as f:
    for row in csvmod.DictReader(f):
        meta[row["handle"]] = row

msg_map = {m["handle"]: m["message"] for m in MESSAGES}

rows = []
for m in MESSAGES:
    h = m["handle"]
    base = meta.get(h, {})
    rows.append({
        "name":       base.get("name", ""),
        "org":        base.get("org", ""),
        "handle":     h,
        "social":     base.get("social", ""),
        "icp_score":  base.get("icp_score", ""),
        "icp_reason": base.get("icp_reason", ""),
        "tweet_count": base.get("tweet_count", ""),
        "outreach_message": m["message"],
    })

fieldnames = ["name","org","handle","social","icp_score","icp_reason","tweet_count","outreach_message"]
with open("../data/outreach_messages.csv", "w", newline="", encoding="utf-8") as f:
    w = csvmod.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

print(f"Written {len(rows)} messages to outreach_messages.csv")
