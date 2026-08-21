/**
 * Seeds a demo trip: Rome, six days, a group that includes a grandfather with
 * a walking limit, a coeliac, and a nine-year-old. Deliberately contains one
 * red conflict, one amber unverified and one green match, plus an age-restricted
 * wine tasting — so the demo has something to show within five seconds.
 *
 *   node scripts/seed.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

for (const file of [".env.local", ".env"]) {
  try {
    const text = await readFile(join(here, "..", file), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      if (!process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const q = (text, params) => client.query(text, params).then((r) => r.rows);

// Dates start today so the "today" screen always has something on it.
const today = new Date();
const iso = (offset) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// Attach the demo trip to whoever signed in most recently, so the flow is:
// sign in first, then seed, and the trip is yours. With nobody signed in yet
// it falls back to the local development account.
const [existing] = await q("SELECT id FROM owners ORDER BY created_at DESC LIMIT 1");
const [owner] = existing
  ? [existing]
  : await q(
      `INSERT INTO owners (google_sub, email, name)
       VALUES ('dev-local', 'dev@localhost', 'Local Developer')
       ON CONFLICT (google_sub) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

await q("DELETE FROM projects WHERE owner_id = $1 AND name = $2", [owner.id, "Rome with the family"]);

const [project] = await q(
  `INSERT INTO projects (owner_id, name, destination, start_date, end_date, timezone, currency, share_token, inbox_token)
   VALUES ($1,'Rome with the family','Rome',$2,$3,'Europe/Rome','EUR','romedemo24','roma26x')
   RETURNING id, share_token`,
  [owner.id, iso(0), iso(5)]
);

const people = [
  { name: "Joan", age: 44, phone: "+34 600 111 222", owner: true },
  { name: "Marta", age: 41, phone: "+34 600 333 444" },
  { name: "Grandad", age: 82, phone: "+34 600 555 666" },
  { name: "Leo", age: 9 },
];

const ids = {};
for (const person of people) {
  const [row] = await q(
    "INSERT INTO travellers (project_id, owner_id, name, age, phone, profile_completed_at) VALUES ($1,$2,$3,$4,$5, now()) RETURNING id",
    [project.id, person.owner ? owner.id : null, person.name, person.age, person.phone ?? null]
  );
  ids[person.name] = row.id;
}

const req = (traveller, level, category, code, value = {}) =>
  q(
    "INSERT INTO requirements (project_id, traveller_id, level, category, code, value) VALUES ($1,$2,$3,$4,$5,$6)",
    [project.id, ids[traveller], level, category, code, JSON.stringify(value)]
  );

await req("Grandad", "mandatory", "mobility", "max_walking_minutes", { minutes: 10 });
await req("Grandad", "mandatory", "mobility", "frequent_rest");
await req("Marta", "mandatory", "diet", "gluten_free");
await req("Marta", "preferred", "interest", "museum");
await req("Joan", "preferred", "interest", "food");
await req("Leo", "preferred", "interest", "nature");

const addItem = async (item, attrs = {}, participants = null) => {
  const [row] = await q(
    `INSERT INTO items (project_id, day, starts_at, ends_at, kind, title, location_name, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [project.id, item.day, item.starts_at ?? null, item.ends_at ?? null, item.kind, item.title, item.location ?? null, item.cost ?? null]
  );
  await q(
    `INSERT INTO item_attributes (item_id, walking_minutes, wheelchair_accessible, has_stairs, has_lift,
       terrain, seating_available, gluten_free_options, vegetarian_options, min_age, outdoor, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      row.id,
      attrs.walking_minutes ?? null,
      attrs.wheelchair_accessible ?? "unknown",
      attrs.has_stairs ?? null,
      attrs.has_lift ?? null,
      attrs.terrain ?? null,
      attrs.seating_available ?? "unknown",
      attrs.gluten_free_options ?? "unknown",
      attrs.vegetarian_options ?? "unknown",
      attrs.min_age ?? null,
      attrs.outdoor ?? null,
      attrs.tags ?? [],
    ]
  );
  if (participants) {
    for (const name of participants) {
      await q("INSERT INTO item_participants (item_id, traveller_id) VALUES ($1,$2)", [row.id, ids[name]]);
    }
  }
  return row.id;
};

await addItem(
  { day: iso(0), starts_at: "15:00", kind: "lodging", title: "Check in at Hotel Santa Maria", location: "Vicolo del Piede 2" },
  { walking_minutes: 5, wheelchair_accessible: "yes", has_stairs: false }
);
await addItem(
  { day: iso(0), starts_at: "20:30", kind: "meal", title: "Dinner at Trattoria da Enzo", location: "Via dei Vascellari 29", cost: 30 },
  { walking_minutes: 8, gluten_free_options: "unknown", seating_available: "yes", tags: ["food"] }
);
// The red one: a long walk with Grandad on it.
await addItem(
  { day: iso(1), starts_at: "09:30", kind: "activity", title: "Walking tour of the Forum", location: "Roman Forum", cost: 18 },
  { walking_minutes: 45, terrain: "rough", seating_available: "no", outdoor: true, tags: ["history"] }
);
// The green one: Marta likes museums.
await addItem(
  { day: iso(1), starts_at: "16:00", kind: "activity", title: "Galleria Borghese", location: "Piazzale Scipione Borghese 5", cost: 15 },
  { walking_minutes: 10, wheelchair_accessible: "yes", has_stairs: true, has_lift: true, seating_available: "yes", tags: ["museum", "art"] }
);
// The one with a known fix: the children can't go.
await addItem(
  { day: iso(2), starts_at: "18:00", kind: "activity", title: "Wine tasting in Trastevere", location: "Vicolo del Cinque", cost: 40 },
  { walking_minutes: 6, min_age: 18, seating_available: "yes", tags: ["food"] }
);
await addItem(
  { day: iso(2), starts_at: "13:30", kind: "meal", title: "Lunch at Le Mani in Pasta", location: "Via dei Genovesi 37", cost: 25 },
  { walking_minutes: 5, gluten_free_options: "yes", seating_available: "yes", tags: ["food"] }
);
await addItem(
  { day: iso(3), starts_at: "10:00", kind: "activity", title: "Villa Borghese gardens", location: "Villa Borghese", cost: 0 },
  { walking_minutes: 20, terrain: "flat", seating_available: "yes", outdoor: true, tags: ["nature"] }
);

await q(
  "INSERT INTO changes (project_id, actor_name, action, summary) VALUES ($1,'Marta','updated','“Dinner at Trattoria da Enzo” moved to 20:30')",
  [project.id]
);

await client.end();

console.log(`Seeded. Share link: /t/${project.share_token}`);
