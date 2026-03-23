"""
Aggregate all research agent results and join with speakers.csv.
Outputs:
  company_research.csv  — one row per company, sorted by ICP score desc
  enriched_speakers.csv — one row per speaker, enriched with company USP + ICP score
"""

import csv, json

# ── ALL AGENT RESULTS ────────────────────────────────────────────────────────
# Keys normalised to UPPER for matching.  First occurrence wins on duplicates.

RAW = [
  # BATCH 1
  {"company":"0X / MATCHA","usp":"0x provides the leading DEX aggregator API (Matcha) and liquidity infrastructure powering token swaps across DeFi, used by hundreds of apps routing billions in volume.","icp_score":52,"icp_reason":"On-chain infra but swaps are reversible, no locked funds"},
  {"company":"0XBOW","usp":"0xbow builds privacy-preserving compliance tooling for DeFi, enabling protocols to meet regulatory requirements without sacrificing decentralization.","icp_score":72,"icp_reason":"Regulatory/compliance stakes but still early-stage"},
  {"company":"21SHARES","usp":"21Shares is a leading issuer of regulated crypto ETPs listed on major European exchanges, giving institutional and retail investors compliant exposure to digital assets.","icp_score":88,"icp_reason":"Regulated ETP issuer; errors have legal and financial consequence"},
  {"company":"AAVE LABS","usp":"Aave Labs develops and maintains Aave, the largest decentralized lending protocol with billions in TVL across multiple chains where smart contract errors mean permanent loss.","icp_score":78,"icp_reason":"Billions locked in on-chain protocol; high-cost mistakes"},
  {"company":"ADAN","usp":"ADAN is the French industry association representing crypto and digital asset businesses, advocating for favorable regulation across Europe.","icp_score":18,"icp_reason":"Lobby/advocacy org; no deployed financial systems"},
  {"company":"AERODROME FINANCE / DROMOS LABS","usp":"Aerodrome is Base's central liquidity hub and AMM, built by Dromos Labs, designed to direct liquidity emissions efficiently across the Base ecosystem.","icp_score":58,"icp_reason":"DeFi protocol with real TVL; upgradeable AMM design"},
  {"company":"AKTIONARIAT","usp":"Aktionariat enables Swiss SMEs to tokenize their equity on-chain, providing compliant shareholder registries and secondary market infrastructure for private company shares.","icp_score":82,"icp_reason":"Tokenized equity with legal binding; errors are legally consequential"},
  {"company":"ALEPH CLOUD","usp":"Aleph Cloud is a decentralized cloud computing and storage network providing censorship-resistant infrastructure for Web3 applications.","icp_score":38,"icp_reason":"Infra layer; mistakes recoverable, no financial lock-in"},
  {"company":"AMBER GROUP","usp":"Amber Group is a global digital asset trading and financial services firm offering OTC trading, market making, and structured products to institutional clients.","icp_score":85,"icp_reason":"Institutional trading desk; financial errors are persistent and costly"},
  {"company":"AMBIRE","usp":"Ambire is a smart account / account abstraction wallet enabling users to manage crypto with Web2-style UX while maintaining self-custody and advanced DeFi access.","icp_score":48,"icp_reason":"Wallet infra; high stakes per user but upgradeable product"},
  {"company":"ANOMA","usp":"Anoma is an intent-centric blockchain protocol enabling private, counterparty-discovery-free transactions using ZK proofs and a novel distributed architecture.","icp_score":70,"icp_reason":"ZK/intent protocol; high technical stakes but pre-mainnet"},
  {"company":"APOLLO","usp":"Apollo Global Management has launched tokenized credit and RWA funds on-chain, bridging institutional private credit markets with blockchain-based distribution.","icp_score":92,"icp_reason":"Institutional RWA with legal/financial stakes; top-tier regulated entity"},
  {"company":"ARBITRUM","usp":"Arbitrum is Ethereum's leading L2 scaling solution, securing tens of billions in TVL across its optimistic rollup chains used by thousands of DeFi applications.","icp_score":75,"icp_reason":"L2 with massive TVL; sequencer errors have broad financial impact"},
  {"company":"AVAIL","usp":"Avail is a modular data availability layer enabling rollups and appchains to publish and verify transaction data without running a full chain, reducing cost and increasing scalability.","icp_score":55,"icp_reason":"Critical infra layer; mistakes impactful but open-source and upgradeable"},
  {"company":"AVANTGARDE FINANCE","usp":"Avantgarde Finance builds on-chain asset management infrastructure using the Enzyme protocol, enabling fund managers to run regulated, transparent investment vehicles on-chain.","icp_score":80,"icp_reason":"On-chain fund management with locked AUM; errors are costly"},
  {"company":"BABYLON","usp":"Babylon enables native Bitcoin staking without bridging, letting BTC holders earn yield by securing PoS chains while keeping BTC on the Bitcoin mainnet.","icp_score":83,"icp_reason":"Non-custodial BTC at stake; slashing/bugs carry irreversible financial loss"},
  {"company":"BELEM CAPITAL","usp":"Belem Capital is a digital asset investment firm focused on early-stage ventures and liquid crypto strategies for institutional allocators.","icp_score":65,"icp_reason":"Investment firm; financial stakes but errors often reversible at fund level"},
  {"company":"BITCOIN SUISSE AG","usp":"Bitcoin Suisse is a Swiss-regulated crypto financial services firm offering brokerage, custody, staking, and structured products to institutional and private clients.","icp_score":90,"icp_reason":"Regulated Swiss custodian/broker; compliance errors are legally severe"},
  {"company":"BITGO","usp":"BitGo is the leading institutional digital asset custodian and infrastructure provider, securing hundreds of billions in assets under custody for exchanges, funds, and fintechs.","icp_score":95,"icp_reason":"Regulated custodian with billions AUC; mistakes are catastrophic and irreversible"},
  {"company":"BITMART","usp":"BitMart is a global centralized cryptocurrency exchange offering spot and futures trading across hundreds of token pairs to retail and institutional users.","icp_score":70,"icp_reason":"CEX with user funds at risk; operational but historically breach-prone"},
  # BATCH 2
  {"company":"BITWISE ASSET MANAGEMENT","usp":"Bitwise manages regulated crypto index funds and ETFs, giving institutional investors compliant exposure to digital assets at scale.","icp_score":82,"icp_reason":"Regulated asset manager; errors carry legal/fiduciary cost"},
  {"company":"BLOCK ANALITICA","usp":"Block Analitica builds risk models and analytics dashboards for DeFi protocols, helping teams like MakerDAO manage on-chain financial risk in real time.","icp_score":90,"icp_reason":"Risk infra for live DeFi protocols with locked capital; MakerDAO exposure"},
  {"company":"BLOCKSIGHT.DEV & AMGI STUDIOS","usp":"Blocksight.dev provides on-chain analytics tooling under AMGI Studios, enabling teams to monitor and interpret blockchain activity.","icp_score":38,"icp_reason":"Analytics tooling; limited deployed financial system exposure"},
  {"company":"BOTANIX","usp":"Botanix builds an EVM-compatible layer on top of Bitcoin using a decentralized multisig protocol, enabling DeFi with BTC as the native collateral.","icp_score":72,"icp_reason":"BTC-backed DeFi; significant but still early/upgradeable"},
  {"company":"BOUNCE TECH","usp":"Bounce Finance operates decentralized auction and token sale infrastructure, enabling on-chain fundraising and asset distribution for crypto projects.","icp_score":52,"icp_reason":"On-chain auctions with real funds but smaller protocol scale"},
  {"company":"BOUNDLESS","usp":"Boundless is a ZK proof marketplace that lets developers outsource proof generation on demand, making verifiable computation economically viable at scale.","icp_score":80,"icp_reason":"ZK infra; correctness failures break dependent on-chain systems"},
  {"company":"BPCE","usp":"BPCE is France's second-largest banking group, operating retail, corporate, and investment banking with growing digital asset and tokenization initiatives.","icp_score":90,"icp_reason":"Major regulated bank; errors carry persistent legal/financial cost"},
  {"company":"BREVIS","usp":"Brevis is a ZK coprocessor that lets smart contracts trustlessly access and compute over historical on-chain data, unlocking powerful data-driven contract logic.","icp_score":82,"icp_reason":"ZK infra powering live contracts; bugs corrupt dependent protocols"},
  {"company":"BYBIT","usp":"Bybit is a top-tier centralized derivatives and spot exchange processing billions in daily volume, serving retail and institutional traders globally.","icp_score":85,"icp_reason":"Custodial exchange; breaches/errors cost users real funds"},
  {"company":"CAFE","usp":"CAFE focuses on crypto security tooling and auditing, helping teams identify and mitigate vulnerabilities before deployment.","icp_score":70,"icp_reason":"Security focus is high-stakes but limited public deployment data"},
  {"company":"CAMBRIAN","usp":"Cambrian builds modular blockchain infrastructure and tooling aimed at accelerating protocol development and interoperability.","icp_score":42,"icp_reason":"Infra/tooling layer; stakes depend on what runs on top"},
  {"company":"CENTRIFUGE","usp":"Centrifuge tokenizes real-world assets like invoices, loans, and trade finance on-chain, bridging institutional credit markets to DeFi liquidity.","icp_score":88,"icp_reason":"RWA tokenization of regulated credit assets; legal/financial stakes"},
  {"company":"CERTORA","usp":"Certora provides formal verification tooling for smart contracts, mathematically proving correctness before deployment to prevent exploits in high-value protocols.","icp_score":90,"icp_reason":"Formal verification for protocols holding billions; errors are catastrophic"},
  {"company":"CERTOTA","usp":"Security firm providing smart contract auditing and formal verification for DeFi protocols where exploits result in irreversible fund loss.","icp_score":85,"icp_reason":"Audit misses cause direct, unrecoverable client losses"},
  {"company":"CHRONICLE","usp":"Chronicle Protocol is a verifiable oracle network originally built for MakerDAO, delivering cryptographically attested price feeds to DeFi protocols on-chain.","icp_score":85,"icp_reason":"Oracle feeds underpin collateral pricing; wrong data = protocol insolvency"},
  {"company":"CIRCLE","usp":"Circle issues USDC, a regulated fiat-backed stablecoin used as critical financial infrastructure across DeFi, payments, and institutional settlement globally.","icp_score":95,"icp_reason":"Regulated stablecoin issuer; systemic financial and legal exposure"},
  {"company":"COINFELLO","usp":"Coinfello offers crypto portfolio tracking and wallet management tools for retail investors, simplifying multi-asset monitoring.","icp_score":22,"icp_reason":"Retail-facing portfolio tracker; low financial or legal stakes"},
  {"company":"COLIBRI.STATELESS","usp":"Colibri is a stateless Ethereum client implementation designed to reduce node hardware requirements by eliminating the need to store full state locally.","icp_score":75,"icp_reason":"Core Ethereum client infra; bugs affect network-wide consensus"},
  {"company":"CORPUS.CORE GMBH / COLIBRI.STATELESS","usp":"Builds a high-performance, stateless Ethereum execution client to strengthen protocol-layer client diversity and network resilience.","icp_score":68,"icp_reason":"Ethereum client software; bugs have network-level impact"},
  {"company":"CONSENSYS","usp":"ConsenSys is the leading Ethereum software company, building MetaMask, Infura, Linea, and developer tooling that underpins vast swaths of the Ethereum ecosystem.","icp_score":83,"icp_reason":"Critical Ethereum infra provider; failures affect millions of users"},
  {"company":"COVALENTHQ.COM","usp":"Covalent provides a unified blockchain data API across 200+ chains, giving developers structured access to on-chain history without running their own nodes.","icp_score":55,"icp_reason":"Data API layer; important but not directly holding funds"},
  {"company":"COW DAO","usp":"CoW Protocol is a DEX aggregator and intent-based trading system that uses batch auctions and MEV protection to get users the best on-chain trade execution.","icp_score":76,"icp_reason":"On-chain DEX routing real user funds; solver errors cost traders"},
  # BATCH 3
  {"company":"CR3DENTIALS","usp":"Blockchain-based credential verification platform that makes academic and professional credentials tamper-proof and instantly verifiable on-chain.","icp_score":52,"icp_reason":"Credential fraud is costly but system is largely reversible"},
  {"company":"CREDA NETWORK","usp":"Decentralized credit scoring protocol for AI agents and DeFi users that enables on-chain reputation and undercollateralized lending.","icp_score":62,"icp_reason":"Credit mispricing is costly but protocol is upgradeable"},
  {"company":"CRYSTALITY","usp":"Blockchain infrastructure company providing transparent supply-chain and asset provenance solutions for enterprise clients.","icp_score":45,"icp_reason":"Enterprise blockchain but limited deployed financial exposure"},
  {"company":"CURVY","usp":"Privacy-preserving crypto protocol enabling confidential transactions and shielded DeFi interactions without sacrificing composability.","icp_score":68,"icp_reason":"Privacy infra errors expose users; partially upgradeable"},
  {"company":"CYSIC","usp":"Specialized ZK proof hardware accelerator that makes zero-knowledge computation fast and affordable enough for real-time production systems.","icp_score":88,"icp_reason":"ZK hardware bugs break proof systems with irreversible trust loss"},
  {"company":"DAO LEADERSHIP","usp":"Governance and leadership consultancy helping DAOs build effective decision-making structures and contributor coordination frameworks.","icp_score":18,"icp_reason":"Community/governance advisory; low financial stakes"},
  {"company":"DE GAULLE FLEURANCE","usp":"Leading French law firm with a dedicated digital assets and blockchain practice advising regulated entities on crypto compliance and structuring.","icp_score":82,"icp_reason":"Legal errors in regulated crypto carry persistent liability"},
  {"company":"DGRS LABS","usp":"Blockchain development studio building custom on-chain infrastructure and smart contract systems for Web3 protocols and enterprises.","icp_score":55,"icp_reason":"Smart contract dev has stakes but varies by client deployment"},
  {"company":"DIGITAL FINANCE GROUP (DFG)","usp":"Asia-based crypto venture capital and investment group deploying capital across early-stage blockchain, DeFi, and Web3 infrastructure projects.","icp_score":72,"icp_reason":"VC misjudgment is costly but loss is financial not irreversible systemic"},
  {"company":"DOGEOS","usp":"Stablecoin protocol building a decentralized, algorithmically stabilized currency layer designed for cross-chain payments and settlement.","icp_score":80,"icp_reason":"Stablecoin failures cause permanent user fund loss"},
  {"company":"DOWGO","usp":"RWA tokenization platform that brings real-world assets like treasury bills and private credit on-chain for institutional and retail investors.","icp_score":90,"icp_reason":"RWA tokenization errors cause irreversible legal and financial loss"},
  {"company":"DRAGONFLY","usp":"Top-tier global crypto venture capital firm investing in foundational blockchain infrastructure, DeFi, and Web3 protocols at all stages.","icp_score":70,"icp_reason":"VC errors are costly but not operationally irreversible"},
  {"company":"DUNE","usp":"On-chain analytics platform that lets analysts and teams query, visualize, and share blockchain data through community-built dashboards.","icp_score":42,"icp_reason":"Analytics infra; downstream decisions carry stakes, not platform itself"},
  {"company":"DYDX","usp":"Decentralized perpetuals exchange running on its own Cosmos appchain, handling billions in trading volume with on-chain order books and settlement.","icp_score":88,"icp_reason":"DEX with locked funds; bugs cause irreversible trader losses"},
  {"company":"ELATA BIOSCIENCES","usp":"Decentralized biotech organization using blockchain-based coordination to fund and govern early-stage neuroscience and drug discovery research.","icp_score":35,"icp_reason":"Research-stage org; deployed capital limited, mostly reversible"},
  {"company":"ENSCRIBE","usp":"Blockchain notarization and document integrity platform that creates immutable on-chain proof of authenticity for legal and enterprise documents.","icp_score":65,"icp_reason":"Document fraud is costly but platform has limited locked funds"},
  {"company":"ENTERPRISE ETHEREUM ALLIANCE","usp":"Industry standards body connecting Fortune 500 enterprises with Ethereum ecosystem to develop interoperability specs and compliance frameworks for enterprise blockchain adoption.","icp_score":38,"icp_reason":"Standards org; influence is high but no deployed financial systems"},
  {"company":"ENVIO","usp":"High-performance blockchain indexing and data infrastructure platform enabling developers to query on-chain data with low latency for production dApps.","icp_score":55,"icp_reason":"Infra layer; failures cascade to dApps but indexer is replaceable"},
  {"company":"ESPRESSO SYSTEMS","usp":"Decentralized sequencer and confirmation layer for L2 rollups that removes single points of failure and enables cross-rollup interoperability with credible neutrality.","icp_score":85,"icp_reason":"Sequencer failures freeze L2 funds; persistent systemic risk"},
  {"company":"ETHEREAL VENTURES","usp":"Early-stage crypto venture fund focused on backing foundational Web3 infrastructure, DeFi primitives, and developer tooling at the seed stage.","icp_score":68,"icp_reason":"VC with DeFi infra focus; some irreversible exposure via portfolio"},
  # BATCH 4
  {"company":"ETHEREUM FOUNDATION","usp":"Stewards the development and long-term health of the Ethereum protocol, funding research and core development that underpins hundreds of billions in on-chain value.","icp_score":62,"icp_reason":"High stakes but research/grant org, not deployed financial infra"},
  {"company":"ETHSTORAGE","usp":"Provides programmable, decentralized storage on Ethereum using data availability layers, enabling persistent on-chain data without centralized dependencies.","icp_score":58,"icp_reason":"Infra layer; stakes real but early-stage and upgradeable"},
  {"company":"EULER LABS","usp":"Builds modular, permissionless lending markets on Ethereum where misconfiguration or exploits can result in irreversible loss of pooled user funds.","icp_score":82,"icp_reason":"Lending protocol; exploits caused $200M+ real loss in 2023"},
  {"company":"EUROPEAN CRYPTO INITIATIVE","usp":"Advocates for crypto-friendly regulation in Europe, shaping policy frameworks that determine legal operating conditions for the entire industry.","icp_score":22,"icp_reason":"Policy/advocacy org, no deployed financial systems"},
  {"company":"EVERSTAKE","usp":"Operates institutional-grade staking infrastructure across 60+ blockchains, where validator downtime or slashing carries direct, unrecoverable financial penalties for clients.","icp_score":78,"icp_reason":"Slashing risk and custodied assets make errors costly"},
  {"company":"FILECOIN","usp":"Runs a decentralized storage marketplace with cryptographic proofs of storage, where storage provider failures result in slashed collateral and data loss for clients.","icp_score":65,"icp_reason":"Real economic penalties but primarily open infra, not custodial"},
  {"company":"FLASHBOTS","usp":"Builds MEV infrastructure including block builders and the SUAVE platform that routes billions in transaction value daily, where bugs can result in validator losses or systemic chain instability.","icp_score":80,"icp_reason":"Critical ordering infra; bugs affect chain-level value extraction"},
  {"company":"FLASHBOTS X","usp":"Flashbots X advances MEV research and decentralized block building, shaping how billions in Ethereum block value is extracted and redistributed.","icp_score":82,"icp_reason":"MEV bugs affect live chain value; protocol errors are costly and public"},
  {"company":"FLUENCE","usp":"Provides a decentralized serverless compute marketplace where developers can run verifiable compute jobs without relying on centralized cloud providers.","icp_score":45,"icp_reason":"Decentralized infra but compute tasks are generally re-runnable"},
  {"company":"FLUID","usp":"Combines lending and DEX liquidity in a unified protocol where collateral and liquidity positions interact, amplifying the cost of any logic or liquidation errors.","icp_score":78,"icp_reason":"Unified money market; bad debt is persistent and unrecoverable"},
  {"company":"FRANKENCOIN ASSOCIATION","usp":"Issues a collateral-backed, governance-minimized stablecoin on Ethereum where peg failures or collateral misconfiguration directly harm holders with no backstop.","icp_score":80,"icp_reason":"Stablecoin issuer; de-peg or exploit is permanent user harm"},
  {"company":"GAIB","usp":"Tokenizes AI compute infrastructure as real-world assets, bridging GPU revenue streams on-chain so investors hold yield-bearing tokens backed by physical hardware.","icp_score":82,"icp_reason":"RWA tokenization; legal and financial errors are persistent"},
  {"company":"GEO","usp":"Builds a decentralized, open knowledge graph protocol that incentivizes structured data contributions on-chain, aiming to replace centralized information silos.","icp_score":30,"icp_reason":"Data/community layer; mistakes are editable, low financial stakes"},
  {"company":"GK8 BY GALAXY","usp":"Provides institutional self-custody technology with an air-gapped cold vault solution, where security failures mean direct, unrecoverable loss of client digital assets.","icp_score":95,"icp_reason":"Custodian; breach = permanent, unrecoverable asset loss"},
  {"company":"GNOSIS","usp":"Builds core Ethereum infrastructure including Safe multisig (securing $100B+ in assets) and the Gnosis Chain, where smart contract bugs result in irreversible fund loss.","icp_score":88,"icp_reason":"Safe secures $100B+; multisig bugs are catastrophic and final"},
  {"company":"GOLDSKY (AND ALSO ERPC OPEN-SOURCE)","usp":"Provides real-time blockchain data indexing and subgraph infrastructure that protocols depend on for accurate on-chain data delivery to end users and dApps.","icp_score":52,"icp_reason":"Data infra dependency risk, but errors are correctable over time"},
  {"company":"GRAYSCALE","usp":"Manages multi-billion dollar regulated crypto investment products including spot Bitcoin and Ethereum ETFs, where compliance failures or mismanagement carry severe legal and financial consequences.","icp_score":90,"icp_reason":"Regulated AUM manager; compliance failures are legally devastating"},
  {"company":"HACKEN","usp":"Delivers smart contract audits, penetration testing, and ongoing security monitoring for blockchain protocols where missed vulnerabilities translate directly into user fund losses.","icp_score":85,"icp_reason":"Security firm; audit misses cause direct, irreversible client losses"},
  {"company":"ICON TRADING","usp":"Operates as a crypto market maker and proprietary trading firm where execution errors, bad risk models, or system failures result in direct, unrecoverable capital losses.","icp_score":83,"icp_reason":"Trading desk; errors mean permanent capital loss, no undo"},
  {"company":"IEXEC","usp":"Provides a decentralized marketplace for cloud computing resources with confidential computing support, enabling verifiable off-chain workloads for sensitive data applications.","icp_score":50,"icp_reason":"Compute marketplace with some sensitive use cases but reversible tasks"},
  {"company":"IMMUNEFI","usp":"Operates the largest crypto bug bounty platform, intermediating between white-hat hackers and protocols where unpatched critical vulnerabilities directly endanger billions in user funds.","icp_score":87,"icp_reason":"Mediates critical vuln disclosures; mishandling causes protocol collapse"},
  # BATCH 5
  {"company":"INFURA/DIN","usp":"Infura provides battle-tested Ethereum and multi-chain API infrastructure (including its Decentralized Infrastructure Network) that dApps and wallets depend on for reliable, high-availability node access.","icp_score":72,"icp_reason":"Critical infra but upgradeable; outages hurt but funds not directly at risk"},
  {"company":"IVAULT","usp":"iVault offers self-custodial crypto vaulting with time-locks and recovery mechanisms to protect digital assets from theft and impulsive decisions.","icp_score":78,"icp_reason":"Vault errors cause permanent asset loss; high financial stakes"},
  {"company":"KAITO AI","usp":"Kaito AI aggregates and ranks crypto information and social signals using AI to surface actionable intelligence for traders and protocols.","icp_score":35,"icp_reason":"Intelligence/analytics tool; mistakes are advisory, not capital-destructive"},
  {"company":"KEYROCK","usp":"Keyrock is a quantitative crypto market maker deploying proprietary algorithms across exchanges to provide deep liquidity for tokens and protocols.","icp_score":88,"icp_reason":"Algo errors cause direct, persistent financial loss at scale"},
  {"company":"KILN","usp":"Kiln is enterprise staking infrastructure enabling institutions and protocols to stake assets and earn rewards with white-label, non-custodial tooling.","icp_score":82,"icp_reason":"Slashing or smart contract bugs cause irreversible staked asset loss"},
  {"company":"KLEROS","usp":"Kleros is a decentralized dispute resolution protocol using incentivized jurors to arbitrate on-chain agreements and oracle disputes.","icp_score":70,"icp_reason":"Rulings are final and bind funds; some irreversibility but limited scale"},
  {"company":"KLEROS; SEER","usp":"Kleros and Seer combine decentralized arbitration with prediction markets, creating on-chain dispute resolution and information systems where rulings bind real capital.","icp_score":72,"icp_reason":"On-chain rulings bind funds; errors are costly and visible"},
  {"company":"KOMAINU","usp":"Komainu is a regulated institutional digital asset custodian (joint venture of Nomura, Ledger, and CoinShares) providing compliant, insured custody for funds and banks.","icp_score":95,"icp_reason":"Regulated custodian; errors mean permanent loss and legal liability"},
  {"company":"KRAKEN","usp":"Kraken is one of the most regulated and security-focused centralized crypto exchanges, serving retail and institutional clients globally with deep liquidity.","icp_score":90,"icp_reason":"Exchange errors cause financial loss, regulatory sanctions, reputational damage"},
  {"company":"LAGOON.FINANCE","usp":"Lagoon Finance is an on-chain RWA yield protocol that routes stablecoin capital into tokenized real-world assets for institutional-grade returns.","icp_score":85,"icp_reason":"RWA on-chain; smart contract bugs cause persistent, locked capital loss"},
  {"company":"LAGRANGE LABS","usp":"Lagrange Labs builds ZK coprocessor infrastructure enabling smart contracts to run verifiable off-chain computation over historical on-chain state.","icp_score":88,"icp_reason":"ZK proof errors compromise verifiability of systems relying on proofs"},
  {"company":"LEAST AUTHORITY","usp":"Least Authority is a leading cryptography and blockchain security auditing firm that identifies vulnerabilities in protocols before deployment.","icp_score":80,"icp_reason":"Missed vulnerabilities cause irreversible exploits; reputational and financial stakes"},
  {"company":"LID","usp":"LID Protocol provides liquid staking wrappers that let users stake tokens while retaining liquidity, with smart contract bugs carrying direct risk to pooled principal.","icp_score":66,"icp_reason":"Pooled staking funds at risk; less institutional scale than top-tier"},
  {"company":"LINEA","usp":"Linea is ConsenSys's zkEVM Ethereum L2 rollup offering EVM-equivalent scaling with ZK validity proofs for lower fees and inherited Ethereum security.","icp_score":78,"icp_reason":"L2 bugs lock or lose user funds; some upgradeability mitigates risk"},
  {"company":"LOEB & LOEB","usp":"Loeb & Loeb is a prominent US law firm with a dedicated digital assets and blockchain practice advising on token offerings, regulatory compliance, and crypto M&A.","icp_score":72,"icp_reason":"Legal errors cause regulatory and financial liability; high but indirect stakes"},
  {"company":"LUMIS","usp":"Lumis is a crypto-native asset management and trading infrastructure platform focused on institutional portfolio management and execution.","icp_score":80,"icp_reason":"AUM management errors cause direct, persistent financial loss for clients"},
  {"company":"MAASVENTURES","usp":"Maas Ventures is a crypto-focused venture capital firm investing in early-stage Web3 infrastructure and protocol teams.","icp_score":28,"icp_reason":"VC firm; deploys capital but not building systems where bugs cause loss"},
  {"company":"MAMORI","usp":"Mamori provides real-time DeFi security monitoring and transaction guardrails to detect and block exploits before they drain protocol funds.","icp_score":83,"icp_reason":"Security failures directly cause irreversible on-chain fund loss"},
  {"company":"MASK NETWORK","usp":"Mask Network is a browser extension that layers encrypted messaging, token payments, and DeFi access directly into mainstream social platforms like Twitter.","icp_score":42,"icp_reason":"Social/privacy layer; some financial features but primarily consumer UX"},
  {"company":"MATTER LABS (ZKSYNC)","usp":"Matter Labs builds zkSync, a high-throughput zkEVM L2 with native account abstraction and a ZK-secured ecosystem of rollups (Elastic Chain).","icp_score":85,"icp_reason":"ZK L2 with billions locked; proof or bridge bugs cause irreversible loss"},
  {"company":"MEMORY PROTOCOL","usp":"Memory Protocol is building decentralized on-chain storage infrastructure where data availability guarantees are a hard dependency for downstream smart contract correctness.","icp_score":55,"icp_reason":"Data infra layer; data loss is costly but funds not directly at stake"},
  {"company":"MIDEN","usp":"Miden is Polygon's STARK-based ZK virtual machine enabling private, provable smart contract execution with client-side proving for maximum privacy and scalability.","icp_score":87,"icp_reason":"ZK VM bugs undermine proof validity and privacy guarantees at protocol level"},
  # BATCH 6
  {"company":"MME LEGAL","usp":"Switzerland's leading crypto-native law firm advising on regulatory compliance, token structuring, and blockchain transactions where legal errors carry permanent financial and reputational consequences.","icp_score":82,"icp_reason":"Regulated legal services; mistakes carry persistent legal/reputational cost"},
  {"company":"MONAD FOUNDATION","usp":"Builds a high-performance, EVM-compatible L1 blockchain achieving 10,000+ TPS through parallel execution, enabling DeFi and dApps to scale without sacrificing Ethereum compatibility.","icp_score":55,"icp_reason":"L1 infra with real stakes but still pre-mainnet/upgradeable"},
  {"company":"MOONWELL","usp":"Open DeFi lending and borrowing protocol deployed on Base and Moonbeam where users supply and borrow assets against collateral, with smart contract risk directly tied to locked user funds.","icp_score":68,"icp_reason":"DeFi lending with locked funds but upgradeable governance"},
  {"company":"MORPHO","usp":"Decentralized lending protocol offering optimized peer-to-peer interest rate matching on top of Aave and Compound, managing billions in user deposits where contract bugs mean irreversible fund loss.","icp_score":78,"icp_reason":"Billions in locked DeFi funds; exploits are irreversible"},
  {"company":"NETHERMIND","usp":"Builds and maintains a production Ethereum execution client and provides smart contract auditing, research, and infrastructure services critical to Ethereum network consensus and security.","icp_score":80,"icp_reason":"Client bugs affect Ethereum consensus; high systemic stakes"},
  {"company":"NOMAD CAPITAL; BUIDLPAD","usp":"Crypto-native venture capital and launchpad accelerating early-stage blockchain protocols with capital and go-to-market support.","icp_score":30,"icp_reason":"Capital allocator, not a builder; mistakes are financial not technical"},
  {"company":"OAK RESEARCH","usp":"Independent crypto research organization producing in-depth analysis on blockchain protocols, tokenomics, and market structure to inform investor and builder decision-making.","icp_score":22,"icp_reason":"Pure research, no deployed systems with locked funds"},
  {"company":"OASIS NETWORK - FOUNDING ENGINEER","usp":"Privacy-focused Layer 1 blockchain with confidential smart contract execution (ParaTime architecture), enabling private DeFi and data tokenization for regulated and sensitive use cases.","icp_score":65,"icp_reason":"Privacy L1 with live funds; medium reversibility via governance"},
  {"company":"OBOL","usp":"Builds distributed validator technology (DVT) for Ethereum staking, splitting validator keys across multiple nodes to eliminate single points of failure and protect billions in staked ETH.","icp_score":85,"icp_reason":"Validator key security; slashing mistakes are permanent and costly"},
  {"company":"OFFCHAIN LABS","usp":"Develops Arbitrum, Ethereum's largest L2 rollup by TVL, processing billions in transactions with fraud proofs and now decentralizing sequencing, where a bug can freeze or drain locked assets.","icp_score":82,"icp_reason":"Billions in L2 TVL; sequencer or bridge bugs are irreversible"},
  {"company":"OLYMPIX","usp":"AI-powered smart contract security platform that detects vulnerabilities during development in real time, reducing audit cycles and preventing costly exploits before deployment.","icp_score":75,"icp_reason":"Security tooling; their errors lead to client fund loss"},
  {"company":"OPENFORT","usp":"Provides blockchain account abstraction infrastructure for Web3 games, enabling seamless embedded wallets and transaction management so developers can onboard players without crypto friction.","icp_score":42,"icp_reason":"Gaming infra; funds at stake but consumer-grade reversibility"},
  {"company":"OPENZEPPELIN","usp":"The industry-standard smart contract security library and audit firm whose open-source code underpins hundreds of billions in DeFi TVL, making their correctness decisions systemic to the ecosystem.","icp_score":90,"icp_reason":"Library bugs affect ecosystem-wide TVL; highest systemic stakes"},
  {"company":"OPTIMUM","usp":"Builds a decentralized storage and mempool optimization layer for blockchains, improving data availability and throughput for L1/L2 networks where data integrity is foundational to consensus.","icp_score":60,"icp_reason":"Infra layer with real stakes; still relatively early-stage"},
  {"company":"OWN","usp":"Blockchain platform focused on capital markets and asset ownership, enabling regulated issuance and transfer of financial assets on-chain for institutional and enterprise clients.","icp_score":78,"icp_reason":"Regulated capital markets on-chain; legal and financial cost of errors"},
  {"company":"PARITY TECHNOLOGIES","usp":"Core blockchain infrastructure company behind the Polkadot ecosystem and Substrate framework, whose clients build sovereign blockchains where runtime bugs can halt entire networks.","icp_score":83,"icp_reason":"Blockchain runtime bugs halt networks; systemic and irreversible"},
  {"company":"PAXOS LABS","usp":"Regulated blockchain infrastructure company issuing regulated stablecoins (USDP, PYUSD) and tokenized gold under NYDFS oversight, where compliance failures carry direct legal and financial consequence.","icp_score":95,"icp_reason":"Regulated stablecoin issuer; legal, financial, reputational stakes maximal"},
  {"company":"PENNY BY B2C2","usp":"Institutional crypto market-making and liquidity platform by B2C2, providing programmatic OTC trading where pricing errors or system failures result in direct, immediate financial loss.","icp_score":88,"icp_reason":"Market-making errors are immediate, quantifiable financial losses"},
  {"company":"PERPL","usp":"Decentralized perpetuals exchange built for high-performance on-chain derivatives trading, where smart contract or oracle bugs directly expose user margin and protocol liquidity to irreversible loss.","icp_score":70,"icp_reason":"Perps protocol with locked margin; exploits are irreversible"},
  {"company":"PLUME NETWORK","usp":"RWA-native Layer 2 blockchain purpose-built for tokenizing and trading real-world assets, operating in a compliance-heavy space where on-chain errors have direct legal and financial permanence.","icp_score":88,"icp_reason":"RWA tokenization with legal/financial stakes; highly persistent errors"},
  # BATCH 7
  {"company":"POAP","usp":"POAP issues NFT badges that verifiably record attendance at real-world and virtual events, creating a portable on-chain record of lived experiences.","icp_score":18,"icp_reason":"Community/engagement tool; low financial stakes, no locked funds"},
  {"company":"PONOS TECHNOLOGY","usp":"Ponos Technology builds ZK-proof hardware and acceleration infrastructure that makes cryptographic verification faster and cheaper for proof-generating networks.","icp_score":78,"icp_reason":"ZK infra correctness errors break downstream proof security"},
  {"company":"PROPY","usp":"Propy enables end-to-end real estate transactions on-chain, including title transfer and deed recording, reducing fraud risk and settlement time in property sales.","icp_score":80,"icp_reason":"On-chain property title transfers carry persistent legal and financial cost if wrong"},
  {"company":"PROTOCOL GUILD","usp":"Protocol Guild is a collective funding mechanism that routes onchain donations directly to active Ethereum core protocol contributors, sustaining public-goods development.","icp_score":35,"icp_reason":"Funding/coordination org; core output is research and dev, not deployed financial systems"},
  {"company":"PROTOCOL LABS FILECOIN IMPACT FUND (PLFIF)","usp":"Deploys grants and investments to accelerate decentralized storage and Web3 open-source ecosystems built on Filecoin and IPFS.","icp_score":30,"icp_reason":"Grant/investment org; no deployed financial systems at stake"},
  {"company":"QUARKCHAIN","usp":"QuarkChain is a sharded, high-throughput blockchain platform designed for scalable decentralized applications with heterogeneous sharding architecture.","icp_score":42,"icp_reason":"General-purpose L1; moderate stakes but largely upgradeable infra"},
  {"company":"QUIDLI","usp":"Quidli provides crypto payroll and token-based compensation tools that let companies pay employees and contractors in digital assets compliantly and automatically.","icp_score":62,"icp_reason":"Payroll errors have financial/legal cost but scope is limited per transaction"},
  {"company":"REDBELLY NETWORK / THE UNIVERSITY OF SYDNEY","usp":"Redbelly Network is a university-research-backed, deterministic blockchain designed for enterprise and regulated-asset use cases with formally verified consensus.","icp_score":70,"icp_reason":"Regulated-asset focus and formal verification signal high-stakes intent, but still maturing"},
  {"company":"REILABS","usp":"ReiLabs builds ZK cryptography tooling and proving systems that power secure, verifiable computation for next-generation blockchain protocols.","icp_score":82,"icp_reason":"ZK cryptography bugs are irreversible; correctness is existential"},
  {"company":"S&P GLOBAL RATINGS","usp":"S&P Global Ratings provides authoritative credit risk assessments on debt instruments and issuers that institutional investors and regulators rely on globally for capital allocation decisions.","icp_score":92,"icp_reason":"Ratings errors trigger massive, persistent financial and legal liability"},
  {"company":"SAFE","usp":"Safe (formerly Gnosis Safe) is the dominant multi-signature smart account platform securing billions of dollars in on-chain assets for DAOs, institutions, and individuals.","icp_score":95,"icp_reason":"Smart account bugs mean permanent loss of locked funds at massive scale"},
  {"company":"SAGA","usp":"Saga is a blockchain platform that provisions dedicated app-chains (Chainlets) for gaming and consumer applications, reducing gas costs and latency for high-throughput use cases.","icp_score":38,"icp_reason":"Gaming infra; mistakes are recoverable and financial stakes per error are low"},
  {"company":"SCROLL","usp":"Scroll is a zkEVM-based Ethereum Layer 2 that uses zero-knowledge proofs to inherit Ethereum's security while enabling faster and cheaper transactions.","icp_score":80,"icp_reason":"ZK proof bugs or rollup errors could freeze or drain bridged user funds"},
  {"company":"SECUREUM","usp":"Secureum is a smart contract security education platform that trains auditors and developers to identify vulnerabilities in Ethereum code through bootcamps and competitive challenges.","icp_score":30,"icp_reason":"Education org; no deployed financial systems, output is knowledge not product"},
  {"company":"SEI LABS","usp":"Sei Labs builds the Sei blockchain, a high-performance Layer 1 optimized for trading and financial applications with native order-book primitives and sub-second finality.","icp_score":72,"icp_reason":"Financial trading chain; errors costly but ecosystem still maturing"},
  {"company":"SENTIENT","usp":"Sentient is building an open-source AI development platform on blockchain that allows model contributors to retain economic rights and share in downstream revenue.","icp_score":45,"icp_reason":"Novel intersection of AI and crypto; high ambition but deployed stakes still early"},
  {"company":"SESSION","usp":"Session is a decentralized, end-to-end encrypted private messenger that requires no phone number or personal data, routing messages through a staked node network.","icp_score":55,"icp_reason":"Privacy/security product with staked infrastructure; metadata leaks carry reputational cost"},
  {"company":"SG FORGE","usp":"SG-Forge is Societe Generale's regulated digital assets subsidiary that issues tokenized bonds and structured products on public blockchains under full regulatory compliance.","icp_score":97,"icp_reason":"Regulated bank issuing tokenized securities; errors carry severe legal and financial cost"},
  {"company":"SOCIETE GENERALE-FORGE","usp":"SG-Forge is the regulated digital asset subsidiary of Societe Generale that issues security tokens and structured products on public blockchains under full banking supervision.","icp_score":95,"icp_reason":"Regulated bank; errors carry legal and financial consequence"},
  {"company":"SHUTTER NETWORK","usp":"Shutter Network uses threshold encryption and distributed key generation to prevent front-running and MEV exploitation on Ethereum by hiding transaction content until block inclusion.","icp_score":76,"icp_reason":"MEV/front-running protection for live funds; cryptographic failure has direct financial impact"},
  {"company":"SIGMA PRIME","usp":"Sigma Prime is an Ethereum security firm that builds the Lighthouse consensus client and delivers smart contract audits, directly underpinning the security of Ethereum's staked assets.","icp_score":94,"icp_reason":"Consensus client bugs and missed audits risk billions in staked ETH"},
  {"company":"SKALE LABS","usp":"SKALE Labs operates a modular, gas-free Ethereum-compatible Layer 2 network of elastic sidechains designed to scale dApps without per-transaction fees.","icp_score":48,"icp_reason":"L2 infra with real deployments, but gas-free model reduces per-error financial stakes"},
  # BATCH 8
  {"company":"SPACE ID","usp":"Space ID is a multi-chain web3 naming and identity protocol that lets users register human-readable domain names across BNB Chain, Arbitrum, and other networks.","icp_score":45,"icp_reason":"Useful infra but identity errors are largely reversible"},
  {"company":"SPACECOMPUTER","usp":"SpaceComputer builds applied zero-knowledge cryptography tooling and infrastructure that enables private, verifiable computation for sensitive on-chain use cases.","icp_score":85,"icp_reason":"ZK systems; cryptographic correctness failures are catastrophic"},
  {"company":"SPARK","usp":"Spark is a MakerDAO-affiliated DeFi lending and savings protocol that allows users to borrow DAI and earn yield against on-chain collateral at scale.","icp_score":72,"icp_reason":"Large TVL DeFi protocol; some upgradeability softens risk"},
  {"company":"SPIKO","usp":"Spiko tokenizes EU-regulated money market funds and T-bills on-chain, giving institutional and retail investors permissioned access to low-risk yield instruments via blockchain.","icp_score":90,"icp_reason":"Regulated tokenized RWA funds; errors carry legal/financial cost"},
  {"company":"STEREUM SERVICES FLEXCO","usp":"Stereum is an open-source Ethereum node management platform that simplifies validator and staking node setup for solo stakers and institutional operators.","icp_score":55,"icp_reason":"Node infra matters but mistakes are largely recoverable"},
  {"company":"SWARMS","usp":"Swarms is an AI agent orchestration framework that enables developers to build and deploy autonomous multi-agent pipelines for complex task automation.","icp_score":22,"icp_reason":"Developer tooling; no persistent financial or legal stakes"},
  {"company":"SYNDICATE","usp":"Syndicate provides L2 blockchain infrastructure and smart account tooling that lets product teams embed on-chain features and gasless transactions into applications at scale.","icp_score":50,"icp_reason":"L2 infra with real users but highly upgradeable"},
  {"company":"TAURUS","usp":"Taurus is a Swiss-regulated digital asset custody and tokenization platform serving banks and financial institutions with institutional-grade infrastructure for holding and issuing crypto assets.","icp_score":96,"icp_reason":"Regulated custodian; loss of assets is permanent and legal"},
  {"company":"TELLOR","usp":"Tellor is a decentralized oracle protocol that provides tamper-resistant off-chain data feeds to on-chain smart contracts via a crypto-economic dispute layer.","icp_score":70,"icp_reason":"Oracle manipulation causes real losses; medium-scale deployment"},
  {"company":"TEZOS","usp":"Tezos is a self-amending Layer 1 blockchain with formal verification support and on-chain governance, used for NFTs, tokenized assets, and institutional applications.","icp_score":60,"icp_reason":"L1 with institutional use cases; broadly upgradeable by design"},
  {"company":"THEDAO SECURITY FUND & GIVETH","usp":"TheDAO Security Fund and Giveth are Ethereum-aligned nonprofits focused on crypto ecosystem grants, public goods funding, and community-driven charitable giving rails.","icp_score":18,"icp_reason":"Grants and community org; mistakes are low-stakes and reversible"},
  {"company":"TOKAMAK NETWORK / HASHED OPEN RESEARCH","usp":"Tokamak Network is an Ethereum Layer 2 protocol and on-demand rollup platform built on the OP Stack, enabling teams to launch customized L2 chains with native TON staking.","icp_score":52,"icp_reason":"L2 infra with locked funds but still relatively upgradeable"},
  {"company":"UNISWAP LABS","usp":"Uniswap Labs builds and maintains the leading decentralized exchange protocol handling hundreds of billions in annual trading volume across multiple chains.","icp_score":78,"icp_reason":"Massive TVL DEX; smart contract bugs cause irreversible losses"},
  {"company":"WACHSMAN","usp":"Wachsman is a leading crypto and Web3 public relations and communications agency serving blockchain companies, exchanges, and protocols with strategic media and comms.","icp_score":12,"icp_reason":"PR/comms firm; no persistent financial or technical risk"},
  {"company":"WALLETCONNECT","usp":"WalletConnect is an open-source communications protocol that securely connects crypto wallets to decentralized applications across web and mobile environments.","icp_score":65,"icp_reason":"Security-critical infra but open-source and widely distributable"},
  {"company":"WASDER","usp":"Wasder is a Web3 gaming social platform and community hub that connects gamers, enables NFT-based rewards, and provides discovery tools for blockchain games.","icp_score":15,"icp_reason":"Gaming community app; low financial stakes and fully reversible"},
  {"company":"WBTC","usp":"WBTC (Wrapped Bitcoin) is a tokenized representation of Bitcoin on Ethereum backed 1:1 by custodied BTC, enabling Bitcoin liquidity to flow into DeFi protocols.","icp_score":92,"icp_reason":"Custodied BTC backing; errors cause irreversible asset loss at scale"},
  {"company":"WORLD FOUNDATION","usp":"World Foundation (Worldcoin) operates a global decentralized identity and financial network using iris-biometric proof-of-personhood to onboard humans to crypto.","icp_score":80,"icp_reason":"Biometric identity at scale; errors carry legal and reputational cost"},
  {"company":"WORLD LIBERTY FINANCIAL","usp":"World Liberty Financial is a Trump-affiliated DeFi protocol focused on dollar-denominated lending and stablecoin products aimed at mainstream crypto adoption.","icp_score":74,"icp_reason":"High-profile DeFi with political and reputational exposure"},
  # BATCH 9
  {"company":"YAP GLOBAL","usp":"A crypto-native PR and communications agency helping blockchain projects build narrative and media presence at scale.","icp_score":15,"icp_reason":"Marketing/PR firm, mistakes are reputational not financial"},
  {"company":"ZEAM","usp":"A next-generation Ethereum execution client built for performance, diversity, and client decentralization of the network.","icp_score":62,"icp_reason":"Infra client software, bugs have network impact but upgradeable"},
  {"company":"ZENITH","usp":"A platform tokenizing real-world assets on-chain, bridging traditional finance capital with programmable blockchain rails.","icp_score":82,"icp_reason":"RWA tokenization with persistent legal and financial exposure"},
  {"company":"ZERO GRAVITY LABS (0G.AI)","usp":"A modular AI blockchain providing decentralized storage and compute infrastructure purpose-built for AI applications.","icp_score":55,"icp_reason":"Infra layer with stakes but still early and upgradeable"},
  {"company":"ZIRCUIT","usp":"A ZK-rollup L2 built on Ethereum with AI-powered sequencer-level security to quarantine malicious transactions before finalization.","icp_score":85,"icp_reason":"ZK L2 with locked funds and novel sequencer security model"},
  {"company":"ZIRCUIT L2","usp":"A ZK-rollup L2 built on Ethereum with AI-powered sequencer-level security to quarantine malicious transactions before finalization.","icp_score":85,"icp_reason":"ZK L2 with locked funds and novel sequencer security model"},
  {"company":"ZISK","usp":"A high-performance ZK proving system designed to generate proofs faster and more efficiently for ZK application developers.","icp_score":80,"icp_reason":"ZK proving infra; proof failures have downstream financial consequence"},
  {"company":"ZKM","usp":"A universal ZK proof layer enabling any chain to become verifiable, powering a hybrid on-chain/off-chain settlement network.","icp_score":78,"icp_reason":"Universal ZK infra with cross-chain settlement finality risk"},
  {"company":"ZKNEXUS","usp":"A ZK-powered blockchain infrastructure layer focused on enabling scalable and privacy-preserving decentralized applications.","icp_score":65,"icp_reason":"ZK infra with some stakes but limited deployed capital exposure"},
  {"company":"ZKSECURITY","usp":"A specialized security auditing firm focused exclusively on zero-knowledge proof systems and ZK circuit correctness.","icp_score":92,"icp_reason":"Auditing ZK systems where bugs cause irreversible financial loss"},
  {"company":"ZKWHISTLEBLOWER","usp":"A privacy-preserving protocol enabling anonymous, verifiable whistleblowing using zero-knowledge proofs on-chain.","icp_score":45,"icp_reason":"High-stakes use case but limited deployed financial infrastructure"},
  {"company":"ZODIA CUSTODY","usp":"A regulated institutional crypto custodian backed by Standard Chartered, providing compliant digital asset safekeeping for institutions.","icp_score":97,"icp_reason":"Regulated custodian; errors mean permanent loss of institutional funds"},
  {"company":"ZUITZERLAND","usp":"A crypto community event and gathering series fostering collaboration and networking among Web3 builders and researchers.","icp_score":12,"icp_reason":"Community org, no financial or legal cost to mistakes"},
  {"company":"ZYFAI","usp":"An AI-powered DeFi platform automating yield strategies and portfolio management across decentralized finance protocols.","icp_score":68,"icp_reason":"DeFi with user funds at risk but strategies are adjustable"},
  {"company":"エーアイ.コム","usp":"A Japan-based AI and crypto convergence project building AI-native blockchain applications for the Asian market.","icp_score":38,"icp_reason":"Early-stage, market unclear, likely MVP-stage without locked capital"},
  {"company":"NEVERLOCAL","usp":"A ZK research organization advancing the theoretical and applied foundations of zero-knowledge proof systems.","icp_score":42,"icp_reason":"Pure ZK research without directly deployed production systems"},
  {"company":"EVVM.ORG","usp":"A payment channel and meta-transaction infrastructure layer enabling gasless and efficient micropayments on Ethereum.","icp_score":72,"icp_reason":"Payment infra with funds in channels but limited scale deployed"},
  # BATCH 10 extras (not duplicates)
  {"company":"BLOCKSIGHT.DEV & AMGI STUDIOS","usp":"Blocksight.dev provides on-chain analytics tooling under AMGI Studios, enabling teams to monitor and interpret blockchain activity.","icp_score":38,"icp_reason":"Analytics tooling; limited deployed financial system exposure"},
  {"company":"DUCT TAPE / ETHPRAGUE","usp":"ETHPrague is a developer-focused Ethereum hackathon and community event in Prague that accelerates ecosystem growth through in-person collaboration and prototype building.","icp_score":14,"icp_reason":"Community/events org; no financial systems at stake"},
  {"company":"ANYENK","usp":"Anyenk builds blockchain-based infrastructure for enterprise data verification and compliance workflows.","icp_score":48,"icp_reason":"Enterprise tooling; stakes depend on compliance criticality of client"},
  {"company":"ETHBELGIUM","usp":"ETHBelgium is a Belgian Ethereum community and hackathon organization connecting local builders to the broader Web3 ecosystem.","icp_score":12,"icp_reason":"Community/events org; no financial systems at stake"},
  {"company":"PLACEHOLDER NETWORK","usp":"Placeholder is a venture capital firm investing in decentralized networks and open cryptographic systems at the earliest stages.","icp_score":30,"icp_reason":"VC/investor network; no deployed system with financial finality risk"},
  {"company":"ROCKLOGIC GMBH","usp":"Rocklogic builds Ethereum staking and validator management tools including Stereum, helping node operators run reliable staking infrastructure.","icp_score":58,"icp_reason":"Staking infra; validator errors cause slashing risk but tooling is recoverable"},
  {"company":"STRATO","usp":"Strato provides enterprise blockchain infrastructure and consulting for regulated industries integrating distributed ledger technology.","icp_score":45,"icp_reason":"Enterprise blockchain consulting; stakes vary by client deployment"},
  {"company":"WEB3 AUTHOR","usp":"Independent author and researcher producing educational content on blockchain, crypto, and Web3 for broad audiences.","icp_score":12,"icp_reason":"Content creator; no deployed systems or financial stakes"},
  {"company":"HTTPS://GITHUB.COM/REAMLABS/REAM","usp":"REAM is an open-source Ethereum consensus client implementation aiming to increase client diversity and network resilience at the protocol layer.","icp_score":65,"icp_reason":"Consensus client; bugs have network-wide impact but open-source and upgradeable"},
  {"company":"EUROPEAN ALUMINIUM","usp":"European Aluminium is exploring blockchain-based traceability and sustainability certification for the aluminium supply chain, where data integrity affects regulatory compliance and trade finance.","icp_score":55,"icp_reason":"Regulated industry pilot; compliance risk present but system is early-stage"},
  {"company":"FLIGHT3","usp":"Flight3 is an early-stage web3 gaming startup building blockchain-integrated gaming experiences where in-game asset ownership and economy design are encoded on-chain.","icp_score":21,"icp_reason":"MVP-stage gaming startup; primarily building to raise"},
  {"company":"SPAGHETTETH, HYPE","usp":"SpaghettiETH is an Italian Ethereum community and events organization that promotes Web3 education and ecosystem engagement across Italy.","icp_score":11,"icp_reason":"Community/PR org; no financial or legal stakes"},
  {"company":"LEADERSHIP COACHING | ZUZA ZUBER","usp":"Executive and leadership coaching practice supporting Web3 founders and teams in navigating organizational and decision-making challenges.","icp_score":20,"icp_reason":"Coaching service; no deployed systems or financial stakes"},
  {"company":"BELEM CAPITAL AND ROCKAWAYX","usp":"Joint digital asset investment vehicle combining Belem Capital and RockawayX's crypto expertise to back early-stage blockchain ventures.","icp_score":50,"icp_reason":"VC portfolio; financial stakes but no deployed system risk"},
  {"company":"MAX PLANCK INSTITUTE FOR SOFTWARE SYSTEMS (MPI-SWS)","usp":"MPI-SWS conducts foundational distributed systems and blockchain security research that underpins the theoretical correctness of production protocols.","icp_score":22,"icp_reason":"Academic research org; outputs are papers not deployed systems"},
  {"company":"IMPERIAL COLLEGE LONDON / FLASHBOTS","usp":"Imperial's crypto research group produces peer-reviewed blockchain research informing protocol design and regulatory policy at a global academic level.","icp_score":28,"icp_reason":"Pure academic research; no deployed capital at stake"},
  {"company":"INDEPENDENT RESEARCHER","usp":"Independent academic or practitioner contributing original research to blockchain, cryptography, or distributed systems fields.","icp_score":15,"icp_reason":"Individual researcher; no deployed systems or financial stakes"},
  {"company":"ANGEL INVESTOR & ADVISOR AT LARGE","usp":"Individual angel investor and advisor providing strategic guidance to early-stage blockchain and Web3 startups.","icp_score":20,"icp_reason":"Advisor/investor; no deployed system risk"},
  {"company":"WEB3 COMMS","usp":"Communications and marketing consultancy specialising in Web3 and blockchain brand strategy for protocols and startups.","icp_score":14,"icp_reason":"Comms agency; no financial or technical deployment risk"},
]

# ── BUILD LOOKUP: normalised company name → first entry ──────────────────────
lookup = {}
for entry in RAW:
    key = entry["company"].upper().strip()
    if key not in lookup:
        lookup[key] = entry

# ── ALSO BUILD FUZZY-MATCH ALIASES ───────────────────────────────────────────
# Some speaker.csv org names differ slightly from agent keys
ALIASES = {
    "AERODROME FINANCE / DROMOS LABS": "AERODROME FINANCE / DROMOS LABS",
    "APOLLO": "APOLLO",
    "AVAIL (BLOCKCHAIN)": "AVAIL",
    "BABYLON (BITCOIN STAKING)": "BABYLON",
    "BLOCKSIGHT.DEV & AMGI STUDIOS": "BLOCKSIGHT.DEV & AMGI STUDIOS",
    "CERTOTA": "CERTOTA",
    "COLIBRI.STATELESS": "COLIBRI.STATELESS",
    "CORPUS.CORE GMBH / COLIBRI.STATELESS": "CORPUS.CORE GMBH / COLIBRI.STATELESS",
    "DIGITAL FINANCE GROUP (DFG)": "DIGITAL FINANCE GROUP (DFG)",
    "DYDX": "DYDX",
    "ELATA BIOSCIENCES": "ELATA BIOSCIENCES",
    "ETHEREUM FOUNDATION": "ETHEREUM FOUNDATION",
    "ETHSTORAGE": "ETHSTORAGE",
    "EULER LABS": "EULER LABS",
    "EVVM.ORG": "EVVM.ORG",
    "FLASHBOTS X": "FLASHBOTS X",
    "GOLDSKY (AND ALSO ERPC OPEN-SOURCE)": "GOLDSKY (AND ALSO ERPC OPEN-SOURCE)",
    "HTTPS://GITHUB.COM/REAMLABS/REAM": "HTTPS://GITHUB.COM/REAMLABS/REAM",
    "IEXEC": "IEXEC",
    "IMPERIAL COLLEGE LONDON / FLASHBOTS": "IMPERIAL COLLEGE LONDON / FLASHBOTS",
    "KLEROS; SEER": "KLEROS; SEER",
    "LAGOON.FINANCE": "LAGOON.FINANCE",
    "LID": "LID",
    "MAX PLANCK INSTITUTE FOR SOFTWARE SYSTEMS (MPI-SWS)": "MAX PLANCK INSTITUTE FOR SOFTWARE SYSTEMS (MPI-SWS)",
    "NEVERLOCAL": "NEVERLOCAL",
    "NOMAD CAPITAL; BUIDLPAD": "NOMAD CAPITAL; BUIDLPAD",
    "OASIS NETWORK - FOUNDING ENGINEER": "OASIS NETWORK - FOUNDING ENGINEER",
    "PENNY BY B2C2": "PENNY BY B2C2",
    "PLUME NETWORK": "PLUME NETWORK",
    "PROTOCOL GUILD": "PROTOCOL GUILD",
    "PROTOCOL LABS FILECOIN IMPACT FUND (PLFIF)": "PROTOCOL LABS FILECOIN IMPACT FUND (PLFIF)",
    "REDBELLY NETWORK / THE UNIVERSITY OF SYDNEY": "REDBELLY NETWORK / THE UNIVERSITY OF SYDNEY",
    "S&P GLOBAL RATINGS": "S&P GLOBAL RATINGS",
    "SG FORGE": "SG FORGE",
    "SOCIETE GENERALE-FORGE": "SOCIETE GENERALE-FORGE",
    "SPAGHETTETH, HYPE": "SPAGHETTETH, HYPE",
    "STEREUM SERVICES FLEXCO": "STEREUM SERVICES FLEXCO",
    "THEDAO SECURITY FUND & GIVETH": "THEDAO SECURITY FUND & GIVETH",
    "TOKAMAK NETWORK / HASHED OPEN RESEARCH": "TOKAMAK NETWORK / HASHED OPEN RESEARCH",
    "WBTC": "WBTC",
    "WORLD FOUNDATION": "WORLD FOUNDATION",
    "WORLD LIBERTY FINANCIAL": "WORLD LIBERTY FINANCIAL",
    "YAP GLOBAL": "YAP GLOBAL",
    "ZERO GRAVITY LABS (0G.AI)": "ZERO GRAVITY LABS (0G.AI)",
    "ZIRCUIT L2": "ZIRCUIT L2",
    "エーアイ.コム": "エーアイ.コム",
    "DUCT TAPE / ETHPRAGUE": "DUCT TAPE / ETHPRAGUE",
    "EUROPEAN ALUMINIUM": "EUROPEAN ALUMINIUM",
    "BELEM CAPITAL AND ROCKAWAYX": "BELEM CAPITAL AND ROCKAWAYX",
    "LEADERSHIP COACHING | ZUZA ZUBER": "LEADERSHIP COACHING | ZUZA ZUBER",
    "HTTPS://GITHUB.COM/REAMLABS/REAM": "HTTPS://GITHUB.COM/REAMLABS/REAM",
}

def find_entry(org):
    key = org.upper().strip()
    if key in lookup:
        return lookup[key]
    # Try alias map
    alias = ALIASES.get(org.upper().strip()) or ALIASES.get(org)
    if alias and alias.upper() in lookup:
        return lookup[alias.upper()]
    return None

# ── READ SPEAKERS.CSV ─────────────────────────────────────────────────────────
speakers = []
with open("speakers.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        speakers.append(row)

# ── WRITE enriched_speakers.csv ──────────────────────────────────────────────
missing = set()
with open("enriched_speakers.csv", "w", newline="", encoding="utf-8") as f:
    fields = ["name", "org", "track", "social", "usp", "icp_score", "icp_reason"]
    w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for s in speakers:
        org = s.get("org", "").strip()
        entry = find_entry(org)
        row = {**s}
        if entry:
            row["usp"] = entry["usp"]
            row["icp_score"] = entry["icp_score"]
            row["icp_reason"] = entry["icp_reason"]
        else:
            row["usp"] = ""
            row["icp_score"] = ""
            row["icp_reason"] = ""
            missing.add(org)
        w.writerow(row)

print(f"enriched_speakers.csv written ({len(speakers)} rows)")
if missing:
    print(f"  No match for: {sorted(missing)}")

# ── WRITE company_research.csv ───────────────────────────────────────────────
# Unique companies sorted by ICP score desc
seen_companies = set()
companies_out = []
for entry in sorted(RAW, key=lambda x: -x["icp_score"]):
    k = entry["company"].upper()
    if k not in seen_companies:
        seen_companies.add(k)
        companies_out.append(entry)

with open("company_research.csv", "w", newline="", encoding="utf-8") as f:
    fields = ["icp_score", "company", "usp", "icp_reason"]
    w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    w.writerows(companies_out)

print(f"company_research.csv written ({len(companies_out)} unique companies)")
