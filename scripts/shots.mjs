// Screenshots of the main screens, for checking the design without a browser.
import { chromium } from "playwright";
import pg from "pg";
import { readFile } from "node:fs/promises";

for (const file of [".env.local"]) {
  try {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query("SELECT id, share_token FROM projects LIMIT 1");
const project = rows[0];
const { rows: people } = await db.query(
  "SELECT id, name FROM travellers WHERE project_id = $1 ORDER BY created_at",
  [project.id]
);
await db.end();

const base = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

// Organiser, on a laptop.
const desktop = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
await desktop.addCookies([
  { name: "it_owner", value: process.argv[2] ?? "", domain: "localhost", path: "/" },
]);
const page = await desktop.newPage();

await page.goto(`${base}/api/auth/login`, { waitUntil: "networkidle" });
await page.goto(`${base}/trips/${project.id}`, { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shot-itinerary.png", fullPage: true });

await page.goto(`${base}/trips/${project.id}/people/${people[2].id}`, { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shot-requirements.png", fullPage: true });

await page.goto(`${base}/trips/${project.id}/items/new`, { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shot-additem.png", fullPage: true });

// Group member, on a phone.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
});
const mobile = await phone.newPage();
await mobile.goto(`${base}/t/${project.share_token}`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: "/tmp/shot-who.png", fullPage: true });

// Pick a name — the one-tap case.
await mobile.getByRole("button", { name: people[2].name, exact: true }).click();
await mobile.waitForTimeout(3000);
console.log("after identity pick:", mobile.url());
await mobile.screenshot({ path: "/tmp/shot-today.png", fullPage: true });

await mobile.goto(`${base}/t/${project.share_token}/people`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: "/tmp/shot-whoswho.png", fullPage: true });

await browser.close();
console.log("Screenshots written to /tmp/shot-*.png");
