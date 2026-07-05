"""Capture KB Web Viewer screenshots for README documentation."""

import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:3200"
SCRIPT_DIR = Path(__file__).parent.parent
OUTPUT_DIR = SCRIPT_DIR / "resources" / "docs" / "screenshots"

PAGES = [
    {"name": "kb-graph", "url": "/", "wait": 3000},
    {"name": "kb-dashboard", "url": "/dashboard", "wait": 2000},
    {"name": "kb-tags", "url": "/tags", "wait": 2000},
    {"name": "kb-quality", "url": "/quality", "wait": 2000},
    {"name": "kb-analytics", "url": "/analytics", "wait": 2000},
]


async def capture_all():
    """Capture screenshots of all KB Web Viewer pages."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1400, "height": 900})

        for item in PAGES:
            url = f"{BASE_URL}{item['url']}"
            print(f"Capturing {item['name']} from {url}...")
            try:
                await page.goto(url, wait_until="networkidle")
                await page.wait_for_timeout(item["wait"])
                path = str(OUTPUT_DIR / f"{item['name']}.png")
                await page.screenshot(path=path, full_page=False)
                print(f"  ✅ Saved: {path}")
            except Exception as e:
                print(f"  ❌ Failed: {e}")

        await browser.close()
    print("\nDone! All screenshots saved.")


if __name__ == "__main__":
    asyncio.run(capture_all())
