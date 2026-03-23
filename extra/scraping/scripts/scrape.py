"""
EthCC scraper — speakers + sponsors
Outputs: speakers.csv, sponsors.csv
"""

import asyncio
import csv
import re
from playwright.async_api import async_playwright


SPEAKERS_URL = "https://ethcc.io/ethcc-9/speakers"
SPONSORS_URL = "https://ethcc.io/sponsors"


async def scroll_to_bottom(page):
    """Scroll page incrementally until no new content loads."""
    prev_height = 0
    while True:
        height = await page.evaluate("document.body.scrollHeight")
        if height == prev_height:
            break
        prev_height = height
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(1500)  # wait for lazy-load


async def scrape_speakers(page):
    await page.goto(SPEAKERS_URL, wait_until="networkidle")
    await scroll_to_bottom(page)

    speakers = await page.evaluate("""
        () => {
            const results = [];
            const seen = new Set();
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href;
                if (!(href.includes('x.com') || href.includes('twitter.com') || href.includes('linkedin.com'))) return;

                // Card is 3 levels up: directional-hover-card
                let card = a.parentElement;
                for (let i = 0; i < 6; i++) {
                    if (!card) break;
                    if (card.className && card.className.includes('directional-hover-card')) break;
                    card = card.parentElement;
                }
                if (!card) return;

                // Text structure: "TRACK\\nNAME\\n\\nCOMPANY"
                const lines = card.innerText.split('\\n').map(l => l.trim()).filter(l => l);
                const track  = lines[0] || '';
                const name   = lines[1] || '';
                const org    = lines[2] || '';

                if (name && !seen.has(name)) {
                    seen.add(name);
                    results.push({ name, org, track, social: href });
                }
            });
            return results;
        }
    """)

    return speakers


async def scrape_sponsors(page):
    await page.goto(SPONSORS_URL, wait_until="networkidle")
    await scroll_to_bottom(page)

    sponsors = await page.evaluate("""
        () => {
            const results = [];
            const seen = new Set();

            // Sponsor cards are <a> with class containing 'aspect-square'
            // Parent at depth 3 is a flex-col div whose first text is the tier label
            document.querySelectorAll('a.aspect-square').forEach(a => {
                const url = a.href;
                if (!url || url.includes('ethcc.io')) return;

                // Get sponsor name from the h3 inside the link
                const name = a.querySelector('h3')?.innerText?.trim()
                          || a.innerText.split('\\n')[0].trim();
                if (!name || name === 'Coming Soon' || seen.has(name)) return;
                seen.add(name);

                // Walk up to find the flex-col tier container
                let tierEl = a.parentElement;
                for (let i = 0; i < 5; i++) {
                    if (!tierEl) break;
                    if (tierEl.className && tierEl.className.includes('flex-col')) break;
                    tierEl = tierEl.parentElement;
                }
                const tier = tierEl?.innerText?.split('\\n')[0]?.trim() || '';

                results.push({ tier, name, website: url });
            });

            return results;
        }
    """)

    return sponsors


def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Wrote {len(rows)} rows → {path}")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Scraping speakers...")
        speakers = await scrape_speakers(page)
        write_csv("speakers.csv", speakers, ["name", "org", "track", "social"])

        print("Scraping sponsors...")
        sponsors = await scrape_sponsors(page)
        write_csv("sponsors.csv", sponsors, ["tier", "name", "website"])

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
