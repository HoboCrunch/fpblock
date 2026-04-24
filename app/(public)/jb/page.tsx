import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JB @ Consensus Miami \u00b7 FP Block",
  icons: {
    icon: [
      {
        url: "https://framerusercontent.com/images/2vUL1qAHkrPvzqkmjnKR7T0rhc.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "https://framerusercontent.com/images/6lHOTAZziUqbnDrqcc8hCM8ps8.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple:
      "https://framerusercontent.com/images/GvrYmJ8p5IJ3vUuLYTIaz24CykM.png",
  },
};

export default function JBPage() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f13;
  --surface: #16181f;
  --surface-2: #1e2029;
  --border: rgba(255,255,255,0.07);
  --orange: #f58327;
  --orange-dim: rgba(245,131,39,0.12);
  --indigo: #6e86ff;
  --indigo-dim: rgba(110,134,255,0.1);
  --text: #ffffff;
  --text-2: rgba(255,255,255,0.55);
  --text-3: rgba(255,255,255,0.3);
  --radius: 14px;
  --radius-sm: 8px;
}

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
}

body::after {
  content: '';
  position: fixed;
  top: -20%;
  right: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(245,131,39,0.06) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}

.wrap {
  position: relative;
  z-index: 1;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
}

header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(15,15,19,0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.logo-mark {
  width: 32px;
  height: 32px;
  background: var(--orange);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-mark svg { display: block; }

.logo-text {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: var(--text);
  letter-spacing: -0.3px;
}

.logo-text span { color: var(--orange); }

.header-socials {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  text-decoration: none;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.icon-link:hover {
  color: var(--text);
  border-color: rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.05);
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 32px;
  padding: 56px 0 80px;
  align-items: start;
}

.main-col { display: flex; flex-direction: column; gap: 40px; }

.sidebar {
  position: sticky;
  top: 88px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 100px;
  background: var(--indigo-dim);
  color: var(--indigo);
  border: 1px solid rgba(110,134,255,0.2);
}

.pill-orange {
  background: var(--orange-dim);
  color: var(--orange);
  border-color: rgba(245,131,39,0.2);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-identity {
  display: flex;
  align-items: stretch;
  gap: 24px;
}

.jb-photo {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  object-position: top center;
  border: 2px solid var(--orange);
  flex-shrink: 0;
  background: var(--surface);
  transform: scaleX(-1);
}

.hero-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-social-icons {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.hero-name {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.1;
  letter-spacing: -1px;
  color: var(--text);
}

.hero-role {
  font-size: 14px;
  color: var(--text-2);
}

.hero-role strong {
  color: var(--orange);
  font-weight: 600;
}

.hero-body {
  font-size: 17px;
  line-height: 1.75;
  color: rgba(255,255,255,0.8);
  max-width: 580px;
}

.hero-body p + p { margin-top: 14px; }

.hero-video {
  position: relative;
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  display: block;
  text-decoration: none;
  background: #000;
}

.hero-video img {
  display: block;
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  opacity: 0.85;
  transition: opacity 0.2s;
}

.hero-video:hover img { opacity: 1; }

.hero-video-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.hero-video-play-btn {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: rgba(0,0,0,0.65);
  border: 2px solid rgba(255,255,255,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, transform 0.15s;
}

.hero-video:hover .hero-video-play-btn {
  background: var(--orange);
  border-color: transparent;
  transform: scale(1.08);
}

.plain-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.section-title {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 20px;
  line-height: 1.3;
  letter-spacing: -0.3px;
  color: var(--orange);
}

.plain-section p {
  font-size: 15px;
  line-height: 1.75;
  color: rgba(255,255,255,0.72);
}

.plain-section .note {
  font-size: 13px;
  color: var(--text-3);
}

.proof-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.proof-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 10px 14px;
  border-left: 2px solid var(--border);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.2s, transform 0.15s;
}

.proof-link:hover {
  border-color: var(--orange);
  transform: translateX(3px);
}

.proof-link-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.proof-link-icon { display: none; }

.proof-link-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.proof-link-title {
  font-weight: 600;
  font-size: 14px;
}

.proof-link-sub {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
}

.proof-link-arrow {
  color: var(--text-3);
  flex-shrink: 0;
  transition: color 0.2s;
}

.proof-link:hover .proof-link-arrow { color: var(--orange); }

.cta-card {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: var(--radius);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.cta-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--orange), #ff6b00);
}

.cta-card h3 {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.3px;
}

.cta-location-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}

.cta-location-addr {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
}

.cta-proximity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #4ade80;
}

.cta-location {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cta-location-text { display: flex; flex-direction: column; gap: 6px; }

.cta-cafe-logo {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
}

.cta-divider {
  height: 1px;
  background: var(--border);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: var(--radius-sm);
  font-family: 'Poppins', sans-serif;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}

.btn-primary {
  background: var(--orange);
  color: #fff;
  box-shadow: 0 4px 20px rgba(245,131,39,0.3);
}

.btn-primary:hover {
  background: #ff8f2e;
  transform: translateY(-1px);
  box-shadow: 0 8px 30px rgba(245,131,39,0.4);
}

.btn-ghost {
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  background: rgba(255,255,255,0.04);
  color: var(--text);
  border-color: rgba(255,255,255,0.15);
}

.cta-contact-row {
  display: flex;
  gap: 10px;
}

.event-details {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.event-details-intro {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}

.event-details-intro strong {
  color: var(--text);
  font-weight: 600;
}

.event-details-heading {
  font-family: 'Poppins', sans-serif;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.03em;
  color: var(--orange);
  margin-top: 2px;
}

.event-agenda,
.event-expect {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-agenda li {
  font-size: 12.5px;
  color: var(--text-2);
  padding-left: 0;
  display: flex;
  gap: 8px;
  line-height: 1.5;
}

.agenda-time {
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  min-width: 72px;
  font-size: 12px;
}

.event-expect li {
  font-size: 12.5px;
  color: var(--text-2);
  padding-left: 14px;
  position: relative;
  line-height: 1.5;
}

.event-expect li::before {
  content: '\u2013';
  position: absolute;
  left: 0;
  color: var(--orange);
}

.event-details-tagline {
  font-size: 12px;
  font-style: italic;
  color: var(--text-3);
  line-height: 1.5;
}

.sidebar-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-link {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  text-decoration: none;
  padding: 7px 0 7px 12px;
  border-left: 2px solid rgba(245,131,39,0.25);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: color 0.15s, border-left-color 0.15s;
}

.sidebar-link:last-child { border-bottom: none; }

.sidebar-link:hover {
  color: var(--orange);
  border-left-color: var(--orange);
}

footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid var(--border);
  padding: 32px 0;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.footer-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.footer-brand {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}

.footer-brand span { color: var(--orange); }

.footer-copy {
  font-size: 12px;
  color: var(--text-3);
}

.footer-socials {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-hero {
  display: none;
}

@media (max-width: 800px) {
  .main-grid {
    grid-template-columns: 1fr;
    padding: 36px 0 64px;
    gap: 32px;
  }

  .mobile-hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    order: -2;
  }

  .sidebar { order: -1; position: static; }

  .hero .pill,
  .hero .hero-identity { display: none; }

  .hero-name { font-size: 38px; }

  .hero-identity { gap: 16px; }

  .jb-photo { width: 76px; height: 76px; }
}

@media (max-width: 480px) {
  .wrap { padding: 0 16px; }
  .cta-card, .section-card { padding: 20px; }
  .hero-name { font-size: 32px; }
}
`,
        }}
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <header>
        <div className="wrap">
          <div className="header-inner">
            <a
              href="https://fpblock.com"
              target="_blank"
              rel="noopener"
              className="logo"
            >
              <span className="logo-text">
                FP <span>Block</span>
              </span>
            </a>
            <div className="header-socials">
              {/* X / Twitter */}
              <a
                href="https://x.com/settingthetempo"
                target="_blank"
                rel="noopener"
                className="icon-link"
                aria-label="JB on X"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.836L2 2.25h6.63l4.254 5.62 5.36-5.62zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/jbcarthy/"
                target="_blank"
                rel="noopener"
                className="icon-link"
                aria-label="JB on LinkedIn"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        <div className="wrap">
          <div className="main-grid">
            {/* Mobile-only hero header */}
            <div className="mobile-hero">
              <div className="pill pill-orange">Consensus &middot; Miami 2026</div>
              <div className="hero-identity">
                <img
                  src="/landing/jb.png"
                  alt="JB — FP Block"
                  className="jb-photo"
                />
                <div className="hero-meta">
                  <h1 className="hero-name">Hey, I&apos;m JB.</h1>
                  <p className="hero-role">
                    CMO &middot;{" "}
                    <strong>
                      <a
                        href="https://fpblock.com"
                        target="_blank"
                        rel="noopener"
                        style={{
                          color: "var(--orange)",
                          textDecoration: "none",
                        }}
                      >
                        FP Block
                      </a>
                    </strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Left column */}
            <div className="main-col">
              {/* Hero */}
              <section className="hero">
                <div className="pill pill-orange">
                  Consensus &middot; Miami 2026
                </div>
                <div className="hero-identity">
                  <img
                    src="/landing/jb.png"
                    alt="JB — FP Block"
                    className="jb-photo"
                  />
                  <div className="hero-meta">
                    <h1 className="hero-name">Hey, I&apos;m JB.</h1>
                    <p className="hero-role">
                      CMO &middot;{" "}
                      <strong>
                        <a
                          href="https://fpblock.com"
                          target="_blank"
                          rel="noopener"
                          style={{
                            color: "var(--orange)",
                            textDecoration: "none",
                          }}
                        >
                          FP Block
                        </a>
                      </strong>
                    </p>
                  </div>
                </div>
                <a
                  href="https://www.youtube.com/watch?v=IooVtqLhphI"
                  target="_blank"
                  rel="noopener"
                  className="hero-video"
                >
                  <img
                    src="https://img.youtube.com/vi/IooVtqLhphI/maxresdefault.jpg"
                    alt="Watch on YouTube"
                  />
                  <div className="hero-video-play">
                    <div className="hero-video-play-btn">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="white"
                      >
                        <polygon points="6,3 20,12 6,21" />
                      </svg>
                    </div>
                  </div>
                </a>
                <div className="hero-body">
                  <p>
                    Bad architecture decisions don&apos;t just slow you down
                    &mdash; they follow you.
                  </p>
                  <p>
                    If you&apos;re running systems where getting it wrong has
                    permanent consequences, we should talk.
                  </p>
                  <p>
                    Catch me at one of the FP Block events below &mdash; or
                    drop me a line.
                  </p>
                </div>
              </section>

              {/* About FP Block */}
              <section className="plain-section">
                <h2 className="section-title">
                  Architecture where failure isn&apos;t an option.
                </h2>
                <p>
                  FP Block is a full-stack engineering firm that builds and
                  rescues mission-critical systems. Using our proprietary{" "}
                  <strong>Kolme</strong> framework, we give your application the
                  isolation and performance of a dedicated chain &mdash; with
                  seamless interoperability across Ethereum, Solana, and Cosmos.
                </p>
                <p>
                  This is the third path: you control your own chain without
                  being cut off from the world. No compromises on performance.
                  No shared infrastructure risk. No loss of control when it
                  matters most.
                </p>
                <p className="note">
                  We&apos;ve worked with teams running systems where the stakes
                  are permanent &mdash; custodians, regulated platforms,
                  settlement infrastructure. Teams that can&apos;t afford to be
                  wrong.
                </p>
              </section>
            </div>
            {/* /main-col */}

            {/* Right sidebar */}
            <aside className="sidebar">
              <div className="cta-card">
                <h3>FP Block in Miami</h3>

                <div className="cta-divider"></div>

                <div className="event-details">
                  <h4
                    className="event-details-heading"
                    style={{ fontSize: "15px", marginTop: 0 }}
                  >
                    Penthouse Networking with FP Block
                  </h4>
                  <p className="event-details-intro">
                    <strong>Daytime, 1:00 &ndash; 5:00 PM.</strong> Miami
                    Beach penthouse with views over the city.
                  </p>
                  <ul className="event-expect">
                    <li>Check-in, drinks &amp; networking</li>
                    <li>
                      Panel discussion featuring Wesley Crook, CEO, FP Block
                    </li>
                    <li>Optional on-camera interviews to close out</li>
                  </ul>

                  <a
                    href="https://luma.com/00kpa20f"
                    target="_blank"
                    rel="noopener"
                    className="btn btn-primary"
                    style={{ marginTop: "4px" }}
                  >
                    RSVP on Luma
                  </a>

                  <div
                    className="cta-divider"
                    style={{ margin: "10px 0" }}
                  ></div>

                  <h4
                    className="event-details-heading"
                    style={{ fontSize: "15px" }}
                  >
                    FP Block Private Dinner
                  </h4>
                  <p className="event-details-intro">
                    <strong>
                      Wednesday, May 6, 2026 &middot; Evening.
                    </strong>{" "}
                    Miami Beach (venue shared upon confirmation).
                  </p>
                  <ul className="event-expect">
                    <li>
                      Hosted by Aaron Contorer, Founder &amp; Chair, FP Block
                    </li>
                    <li>
                      Curated, invite-only &mdash; founders, funds, and
                      institutional builders
                    </li>
                    <li>
                      Applications reviewed by the FP Block team directly
                    </li>
                  </ul>

                  <a
                    href="https://luma.com/k0y45b3p"
                    target="_blank"
                    rel="noopener"
                    className="btn btn-primary"
                    style={{ marginTop: "4px" }}
                  >
                    Apply for a seat
                  </a>
                </div>

                <div className="cta-divider"></div>

                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "var(--text)",
                    margin: 0,
                  }}
                >
                  Get in touch
                </h3>

                <div className="cta-contact-row" style={{ gap: "8px" }}>
                  <a
                    href="https://x.com/settingthetempo"
                    target="_blank"
                    rel="noopener"
                    className="icon-link"
                    aria-label="X"
                    style={{ flex: 1, height: "44px" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.836L2 2.25h6.63l4.254 5.62 5.36-5.62zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a
                    href="https://www.linkedin.com/in/jbcarthy/"
                    target="_blank"
                    rel="noopener"
                    className="icon-link"
                    aria-label="LinkedIn"
                    style={{ flex: 1, height: "44px" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                  <a
                    href="https://t.me/settingthetempo"
                    target="_blank"
                    rel="noopener"
                    className="icon-link"
                    aria-label="Telegram"
                    style={{ flex: 1, height: "44px" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 0C5.374 0 0 5.373 0 12s5.374 12 12 12 12-5.373 12-12S18.626 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394a.755.755 0 0 1-.6.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.941z" />
                    </svg>
                  </a>
                  <a
                    href="mailto:jbcarthy@fpcomplete.com"
                    className="icon-link"
                    aria-label="Email"
                    style={{ flex: 1, height: "44px" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* FP Block in the wild */}
              <div className="cta-card" style={{ marginTop: "16px" }}>
                <a
                  href="https://fpblock.com"
                  target="_blank"
                  rel="noopener"
                  className="logo"
                  style={{ textDecoration: "none" }}
                >
                  <span className="logo-text">
                    FP <span>Block</span>
                  </span>
                </a>
                <div className="sidebar-links">
                  <a
                    href="https://www.fpblock.com/casestudies"
                    target="_blank"
                    rel="noopener"
                    className="sidebar-link"
                  >
                    Case Studies
                  </a>
                  <a
                    href="https://www.fpblock.com/articles/kolme-architecture-for-founders-who-want-to-win"
                    target="_blank"
                    rel="noopener"
                    className="sidebar-link"
                  >
                    Kolme: Architecture for Founders Who Want to Win
                  </a>
                  <a
                    href="https://www.fpblock.com/articles/fp-complete-corporation-announces-partnership-with-portworx-by-pure-storage"
                    target="_blank"
                    rel="noopener"
                    className="sidebar-link"
                  >
                    FP Complete &times; Portworx by Pure Storage
                  </a>
                  <a
                    href="https://x.com/FP_Block"
                    target="_blank"
                    rel="noopener"
                    className="sidebar-link"
                  >
                    FP Block on X
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer>
        <div className="wrap">
          <div className="footer-inner">
            <div className="footer-left">
              <span className="footer-brand">
                FP <span>Block</span>
              </span>
              <span className="footer-copy">
                Consensus Miami 2026 &middot;{" "}
                <a
                  href="https://fpblock.com"
                  target="_blank"
                  rel="noopener"
                  style={{
                    color: "inherit",
                    textDecoration: "underline",
                    textDecorationColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  fpblock.com
                </a>
              </span>
            </div>
            <div className="footer-socials">
              <a
                href="https://x.com/settingthetempo"
                target="_blank"
                rel="noopener"
                className="icon-link"
                aria-label="JB on X"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.836L2 2.25h6.63l4.254 5.62 5.36-5.62zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/in/jbcarthy/"
                target="_blank"
                rel="noopener"
                className="icon-link"
                aria-label="JB on LinkedIn"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href="https://x.com/FP_Block"
                target="_blank"
                rel="noopener"
                className="icon-link"
                aria-label="FP Block on X"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.836L2 2.25h6.63l4.254 5.62 5.36-5.62zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
