/**
 * Builds a realistic booking-confirmation PDF and files it against the demo
 * trip as if it had arrived by email. Useful for rehearsing the demo without
 * depending on the mailbox being configured.
 *
 *   node scripts/demo-booking.mjs
 */
import { chromium } from "playwright";
import pg from "pg";
import { readFile } from "node:fs/promises";

try {
  const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* ignore */ }

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query("SELECT id, start_date FROM projects ORDER BY created_at DESC LIMIT 1");
if (!rows[0]) {
  console.error("No trip found. Run npm run db:seed first.");
  process.exit(1);
}
const project = rows[0];

// Date the flight for the first day of the trip, so it lands on the itinerary.
// node-postgres hands back a Date here, so format it rather than slicing it.
const start = project.start_date instanceof Date ? project.start_date : new Date(project.start_date);
const y = start.getFullYear();
const m = String(start.getMonth() + 1).padStart(2, "0");
const d = String(start.getDate()).padStart(2, "0");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: Helvetica, Arial, sans-serif; padding: 48px; color: #111; }
  h1 { font-size: 20px; letter-spacing: 2px; margin: 0 0 4px; }
  .rule { border-top: 2px solid #111; margin: 16px 0 24px; }
  table { border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 24px 6px 0; vertical-align: top; }
  .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .big { font-size: 26px; font-weight: bold; }
</style></head><body>
  <h1>VUELING AIRLINES</h1>
  <div>Booking confirmation</div>
  <div class="rule"></div>
  <table>
    <tr><td class="label">Booking reference</td><td class="label">Passenger</td></tr>
    <tr><td class="big">KJ8P2M</td><td class="big">JOFRA/JOAN MR</td></tr>
  </table>
  <div class="rule"></div>
  <table>
    <tr><td class="label">Flight</td><td class="label">Date</td><td class="label">Terminal</td></tr>
    <tr><td class="big">VY 6000</td><td class="big">${d}/${m}/${y}</td><td class="big">1</td></tr>
  </table>
  <table style="margin-top:24px">
    <tr><td class="label">From</td><td class="label">Departs</td><td class="label">To</td><td class="label">Arrives</td></tr>
    <tr>
      <td class="big">Barcelona (BCN)</td><td class="big">07:45</td>
      <td class="big">Rome Fiumicino (FCO)</td><td class="big">09:55</td>
    </tr>
  </table>
  <div class="rule"></div>
  <div style="font-size:14px">Total paid: 184,50 EUR &nbsp;·&nbsp; 1 cabin bag included</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.setContent(html);
const pdf = await page.pdf({ format: "A4", printBackground: true });
await browser.close();

await db.query(
  `INSERT INTO documents (project_id, filename, mime_type, size_bytes, content, source, from_email, subject)
   VALUES ($1,'vueling-KJ8P2M.pdf','application/pdf',$2,$3,'email',$4,$5)`,
  [project.id, pdf.length, pdf, "joan.jofra@aguita.cat", "Your Vueling booking VY6000 – BCN to FCO"]
);
await db.end();

console.log("Filed a Vueling confirmation against the demo trip. Open the Documents tab.");
