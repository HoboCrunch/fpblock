# FP Block CRM — Documentation

Outreach management & enrichment HQ for FP Block's conference preparation. Built with Next.js 16, Supabase, and Tailwind CSS v4. Features a glassmorphic CRM interface for managing persons, organizations, events, initiatives, interactions, and inbound email correlation. Uses a unified interaction timeline, a correlation engine for deduplication (pg_trgm fuzzy matching), event participation with roles, and initiative-based campaign tracking.

## Core Entities

- **Persons** — individuals (speakers, founders, partners, etc.) with ICP scoring
- **Organizations** — companies, DAOs, protocols, funds
- **Events** — conferences and gatherings with participation roles (speaker, sponsor, attendee, organizer, etc.)
- **Initiatives** — campaign tracking units (e.g., "EthCC 2026 Outreach") that group interactions
- **Interactions** — unified timeline of all touchpoints (cold_email, cold_linkedin, reply, meeting, note, etc.), replacing the old messages table

## Key Subsystems

- **Organization Enrichment Pipeline** — three-stage enrichment: Apollo (firmographics) + Perplexity Sonar (deep research) run in parallel, then Gemini 2.0 Flash synthesizes both into structured fields + ICP score (0-100). Each stage runnable independently or as a full pipeline. See [Architecture](./architecture.md) and [Edge Functions & API Routes](./edge-functions.md).
- **Inbox System** — Fastmail JMAP sync for jb@gofpblock.com and wes@gofpblock.com with auto-correlation against persons, pipeline-aware styling, and pg_cron auto-sync every 15 minutes.
- **Correlation Engine** — pg_trgm fuzzy matching for deduplication of persons and organizations with merge/dismiss workflow.

## Quick Links

- [Architecture Overview](./architecture.md)
- [Database Schema](./database.md)
- [Edge Functions](./edge-functions.md)
- [Setup & Deployment Guide](./setup.md)
- [Admin CRM Guide](./admin-panel.md)
