import type { Item, Kind } from "./types";

/**
 * Reading a booking out of a forwarded email or PDF.
 *
 * The governing rule: **never invent anything.** Every field returned here was
 * literally present in the document, and every one comes with the snippet it
 * came from so a human can check it in a second. What we could not find is
 * reported as missing rather than guessed at, and nothing is ever saved without
 * the organiser confirming it.
 *
 * This is pattern matching, not comprehension. It will do well on the
 * confirmations airlines and hotels actually send, and it will miss things.
 * Missing a field is fine — the form is right there. Filling one in wrongly and
 * confidently is not, which is why every rule here is conservative.
 */

export interface Found {
  field: string;
  label: string;
  value: string;
  evidence: string;
}

export interface Extraction {
  draft: Partial<Item>;
  found: Found[];
  missing: string[];
  confidence: "high" | "medium" | "low";
}

// Airlines common enough in Europe to be worth recognising. Requiring a known
// carrier is what stops "AB 123" in an address line becoming a flight.
const AIRLINES: Record<string, string> = {
  VY: "Vueling", IB: "Iberia", FR: "Ryanair", U2: "easyJet", W6: "Wizz Air",
  LH: "Lufthansa", AF: "Air France", KL: "KLM", BA: "British Airways",
  AZ: "ITA Airways", TP: "TAP Portugal", LX: "SWISS", SN: "Brussels Airlines",
  EW: "Eurowings", UX: "Air Europa", YW: "Air Nostrum", TO: "Transavia",
  QR: "Qatar Airways", EK: "Emirates", TK: "Turkish Airlines", DL: "Delta",
  AA: "American Airlines", UA: "United", NT: "Binter", HV: "Transavia",
  A3: "Aegean", OS: "Austrian", SK: "SAS", AY: "Finnair", LO: "LOT",
};

// Enough airports to name the ones a trip from Spain is likely to involve.
const AIRPORTS: Record<string, string> = {
  BCN: "Barcelona", MAD: "Madrid", AGP: "Málaga", VLC: "Valencia",
  SVQ: "Seville", BIO: "Bilbao", PMI: "Palma", ALC: "Alicante",
  IBZ: "Ibiza", TFN: "Tenerife North", TFS: "Tenerife South", LPA: "Las Palmas",
  FCO: "Rome Fiumicino", CIA: "Rome Ciampino", MXP: "Milan Malpensa",
  LIN: "Milan Linate", BGY: "Bergamo", VCE: "Venice", NAP: "Naples",
  FLR: "Florence", PSA: "Pisa", BLQ: "Bologna", TRN: "Turin",
  CDG: "Paris Charles de Gaulle", ORY: "Paris Orly", LYS: "Lyon",
  NCE: "Nice", MRS: "Marseille", TLS: "Toulouse",
  LHR: "London Heathrow", LGW: "London Gatwick", STN: "London Stansted",
  LTN: "London Luton", MAN: "Manchester", EDI: "Edinburgh", DUB: "Dublin",
  AMS: "Amsterdam", BRU: "Brussels", FRA: "Frankfurt", MUC: "Munich",
  BER: "Berlin", HAM: "Hamburg", DUS: "Düsseldorf", CGN: "Cologne",
  ZRH: "Zurich", GVA: "Geneva", VIE: "Vienna", PRG: "Prague",
  LIS: "Lisbon", OPO: "Porto", ATH: "Athens", IST: "Istanbul",
  CPH: "Copenhagen", ARN: "Stockholm", OSL: "Oslo", HEL: "Helsinki",
  WAW: "Warsaw", BUD: "Budapest", KRK: "Kraków", JFK: "New York JFK",
  EWR: "Newark", MIA: "Miami", LAX: "Los Angeles", DOH: "Doha", DXB: "Dubai",
};

const MONTHS: Record<string, number> = {
  jan: 1, gen: 1, ene: 1, january: 1, gener: 1, enero: 1,
  feb: 2, febrer: 2, febrero: 2, february: 2,
  mar: 3, march: 3, març: 3, marc: 3, marzo: 3,
  apr: 4, abr: 4, april: 4, abril: 4,
  may: 5, mai: 5, maig: 5, mayo: 5,
  jun: 6, juny: 6, junio: 6, june: 6,
  jul: 7, juliol: 7, julio: 7, july: 7,
  aug: 8, ago: 8, august: 8, agost: 8, agosto: 8,
  sep: 9, set: 9, sept: 9, september: 9, setembre: 9, septiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11,
  dec: 12, des: 12, dic: 12, december: 12, desembre: 12, diciembre: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A window of text around a match, so a human can verify at a glance. */
function context(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + length + 45);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

interface DateHit {
  iso: string;
  index: number;
  raw: string;
}

/** Every date in the text, in document order. Ambiguous formats are read as
 *  day-first, which is right for European bookings and wrong for American
 *  ones — a limitation worth knowing rather than hiding. */
function findDates(text: string, yearHint: number): DateHit[] {
  const hits: DateHit[] = [];

  // 2026-09-12
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    hits.push({ iso: `${m[1]}-${m[2]}-${m[3]}`, index: m.index!, raw: m[0] });
  }
  // 12/09/2026 or 12-09-26
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    hits.push({ iso: `${year}-${pad(month)}-${pad(day)}`, index: m.index!, raw: m[0] });
  }
  // 12 September 2026 / 12 de setembre de 2026 / 12 Sep
  for (const m of text.matchAll(
    /\b(\d{1,2})\s*(?:de\s+)?([A-Za-zÀ-ÿ]{3,10})\.?\s*(?:de\s+)?(20\d{2})?\b/g
  )) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) continue;
    const day = parseInt(m[1], 10);
    if (day < 1 || day > 31) continue;
    const year = m[3] ? parseInt(m[3], 10) : yearHint;
    hits.push({ iso: `${year}-${pad(month)}-${pad(day)}`, index: m.index!, raw: m[0] });
  }
  // September 12, 2026
  for (const m of text.matchAll(/\b([A-Za-z]{3,10})\.?\s+(\d{1,2}),?\s*(20\d{2})?\b/g)) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) continue;
    const day = parseInt(m[2], 10);
    if (day < 1 || day > 31) continue;
    const year = m[3] ? parseInt(m[3], 10) : yearHint;
    hits.push({ iso: `${year}-${pad(month)}-${pad(day)}`, index: m.index!, raw: m[0] });
  }

  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.index - b.index)
    .filter((h) => {
      const key = `${h.iso}@${h.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findTimes(text: string): { time: string; index: number }[] {
  const out: { time: string; index: number }[] = [];
  for (const m of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*:)/g)) {
    out.push({ time: `${pad(parseInt(m[1], 10))}:${m[2]}`, index: m.index! });
  }
  for (const m of text.matchAll(/\b(\d{1,2}):([0-5]\d)\s*([ap])\.?m\.?\b/gi)) {
    let hour = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === "p") hour += 12;
    out.push({ time: `${pad(hour)}:${m[2]}`, index: m.index! });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function extractBooking(
  rawText: string,
  opts: { subject?: string; yearHint?: number } = {}
): Extraction {
  const text = rawText.replace(/ /g, " ");
  const haystack = `${opts.subject ?? ""}\n${text}`;
  const year = opts.yearHint ?? new Date().getFullYear();
  const draft: Partial<Item> = {};
  const found: Found[] = [];
  const add = (field: string, label: string, value: string, evidence: string) =>
    found.push({ field, label, value, evidence });

  const dates = findDates(haystack, year);
  const times = findTimes(haystack);

  // ---------------------------------------------------------------- flight --
  let flight: { code: string; number: string; index: number } | null = null;
  for (const m of haystack.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?\s?(\d{1,4})\b/g)) {
    const code = m[1].toUpperCase();
    if (!AIRLINES[code]) continue; // known carriers only, or everything matches
    flight = { code, number: m[2], index: m.index! };
    break;
  }

  // Airport codes, but only ones we recognise, and only when two appear.
  const airports: { code: string; index: number }[] = [];
  for (const m of haystack.matchAll(/\b([A-Z]{3})\b/g)) {
    if (!AIRPORTS[m[1]]) continue;
    if (airports.some((a) => a.code === m[1])) continue;
    airports.push({ code: m[1], index: m.index! });
  }

  const hotelWords = /\b(hotel|apartment|apartament|apartamento|b&b|hostel|guest ?house|airbnb|check[- ]?in|check[- ]?out|entrada|salida|sortida|nights?|noches|nits)\b/i;
  const isHotel = hotelWords.test(haystack);
  const isFlight = Boolean(flight) && airports.length >= 2;

  let kind: Kind = "activity";
  if (isFlight) kind = "transport";
  else if (isHotel) kind = "lodging";
  else if (/\b(restaurant|trattoria|osteria|table for|reserva de mesa|dinner|lunch)\b/i.test(haystack))
    kind = "meal";
  draft.kind = kind;

  if (isFlight && flight) {
    draft.mode = "flight";
    draft.carrier = AIRLINES[flight.code];
    draft.service_number = `${flight.code}${flight.number}`;
    add(
      "service_number",
      "Flight",
      `${AIRLINES[flight.code]} ${flight.code}${flight.number}`,
      context(haystack, flight.index, 8)
    );

    const [from, to] = airports;
    draft.origin_code = from.code;
    draft.origin = AIRPORTS[from.code];
    draft.destination_code = to.code;
    draft.destination = AIRPORTS[to.code];
    add("route", "Route", `${from.code} → ${to.code}`, context(haystack, from.index, 3));

    // A terminal is a small number or a single letter. Being loose here is how
    // "TERMINAL VY 6000" in a PDF's column header becomes "Terminal VY" —
    // PDFs flatten tables into one line, so labels and values drift apart.
    const terminal = haystack.match(/\bterminal\s*:?\s*(T\s?\d{1,2}|\d{1,2}|[A-E])\b/i);
    if (terminal) {
      draft.terminal = terminal[1].replace(/\s+/g, "").toUpperCase();
      add("terminal", "Terminal", draft.terminal, context(haystack, terminal.index!, terminal[0].length));
    }

    draft.title = `${AIRPORTS[from.code]} → ${AIRPORTS[to.code]}`;
  }

  // ----------------------------------------------------------------- hotel --
  if (kind === "lodging") {
    // Deliberately case-SENSITIVE. With the /i flag, [A-ZÀ-Ý] also matches
    // lowercase, and "Hotel Santa Maria is confirmed" gets swallowed whole.
    const property = haystack.match(
      /\b((?:Hotel|HOTEL|Hostal|Apartaments?|Apartamentos?|Apartment|B&B|Guest ?House|Casa|Villa)\s+[A-ZÀ-Ý][\wÀ-ÿ'’.-]*(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’.-]*){0,3})/
    );
    if (property) {
      draft.carrier = property[1].trim();
      draft.title = property[1].trim();
      add("carrier", "Property", draft.carrier, context(haystack, property.index ?? 0, property[0].length));
    }

    // Check-in and check-out, labelled where possible, otherwise first two dates.
    const inMatch = haystack.match(/\b(?:check[- ]?in|arrival|entrada|arribada)\b\D{0,40}/i);
    const outMatch = haystack.match(/\b(?:check[- ]?out|departure|salida|sortida)\b\D{0,40}/i);
    const dateNear = (m: RegExpMatchArray | null) => {
      if (!m || m.index === undefined) return null;
      return dates.find((d) => d.index >= m.index! && d.index <= m.index! + 120) ?? null;
    };
    const checkIn = dateNear(inMatch) ?? dates[0] ?? null;
    const checkOut = dateNear(outMatch) ?? (dates[1] && dates[1].iso !== checkIn?.iso ? dates[1] : null);

    if (checkIn) {
      draft.day = checkIn.iso;
      add("day", "Check in", checkIn.iso, context(haystack, checkIn.index, checkIn.raw.length));
    }
    if (checkOut && checkOut.iso !== checkIn?.iso) {
      draft.ends_day = checkOut.iso;
      add("ends_day", "Check out", checkOut.iso, context(haystack, checkOut.index, checkOut.raw.length));
    }
  }

  // ------------------------------------------------------- dates and times --
  if (kind !== "lodging") {
    const first = dates[0];
    if (first) {
      draft.day = first.iso;
      add("day", "Date", first.iso, context(haystack, first.index, first.raw.length));
    }
    if (times[0]) {
      draft.starts_at = times[0].time;
      add(
        kind === "transport" ? "starts_at" : "starts_at",
        kind === "transport" ? "Departs" : "Starts",
        times[0].time,
        context(haystack, times[0].index, 5)
      );
    }
    if (times[1] && kind === "transport") {
      draft.ends_at = times[1].time;
      add("ends_at", "Arrives", times[1].time, context(haystack, times[1].index, 5));
      // An arrival earlier than departure means it landed the next day.
      if (draft.day && times[1].time < times[0].time) {
        const next = new Date(`${draft.day}T00:00:00`);
        next.setDate(next.getDate() + 1);
        draft.ends_day = next.toISOString().slice(0, 10);
      }
    }
  }

  // -------------------------------------------------------------- the rest --
  // The label may be in any case, but the reference itself must be genuinely
  // upper-case or numeric in the document — without that, "Reserva confirmada"
  // reads as a reference of CONFIRMADA.
  //
  // The other trap is PDFs. They flatten a table into one line, so
  // "BOOKING REFERENCE | PASSENGER" over "KJ8P2M | JOFRA/JOAN" arrives as
  // "BOOKING REFERENCE PASSENGER KJ8P2M JOFRA/JOAN" — and the word sitting
  // after the label is the next column's heading, not the value. Hence the
  // stop-list, and hence trying every candidate rather than only the first.
  const NOT_A_REFERENCE = new Set([
    "PASSENGER", "PASAJERO", "PASSATGER", "NUMBER", "NUMERO", "CODE", "CODIGO",
    "FLIGHT", "DATE", "FECHA", "TERMINAL", "NAME", "NOMBRE", "TOTAL", "ADULT",
    "EMAIL", "DEPARTS", "ARRIVES", "FROM", "BOOKING", "RESERVATION", "RESERVA",
    "CONFIRMATION", "CONFIRMADA", "HOTEL", "ROOM", "GUEST", "GUESTS", "NIGHTS",
    "CHECKIN", "CHECKOUT", "ARRIVAL", "DEPARTURE", "PRICE", "AMOUNT", "STATUS",
  ]);

  for (const m of haystack.matchAll(
    /\b(?:booking\s*(?:reference|ref|code|number)|reservation\s*(?:number|code|reference)|confirmation\s*(?:number|code)|localizador|localitzador|n[uú]mero\s*de\s*reserva|pnr|record\s*locator)\b\s*[:#-]?\s*((?:[A-Za-z0-9]{5,12}\s+){0,3}[A-Za-z0-9]{5,12})\b/gi
  )) {
    // Take the first token after the label that actually looks like a
    // reference, skipping any column headings in between.
    const candidate = m[1]
      .split(/\s+/)
      .find((token) => /^[A-Z0-9]{5,12}$/.test(token) && !NOT_A_REFERENCE.has(token));
    if (candidate) {
      draft.booking_ref = candidate;
      add("booking_ref", "Reference", candidate, context(haystack, m.index!, m[0].length));
      break;
    }
  }

  const total = haystack.match(/\b(?:total|import|importe|precio|preu|amount)\b[^\d]{0,15}([\d]{1,5}(?:[.,]\d{2})?)\s*(?:€|eur)/i)
    ?? haystack.match(/(?:€|eur)\s*([\d]{1,5}(?:[.,]\d{2})?)/i);
  if (total) {
    draft.cost = total[1].replace(",", ".");
    add("cost", "Total", `${draft.cost} EUR`, context(haystack, total.index!, total[0].length));
  }

  const address = haystack.match(/\b((?:via|viale|piazza|calle|carrer|avinguda|avenida|rue|street|road|str\.)\s+[^\n,;]{3,60})/i);
  if (address) {
    draft.address = address[1].trim();
    draft.location_name = draft.location_name ?? address[1].trim();
    add("address", "Address", draft.address, context(haystack, address.index!, address[0].length));
  }

  if (!draft.title && opts.subject) draft.title = opts.subject.slice(0, 80);

  // What a human still has to supply.
  const missing: string[] = [];
  if (!draft.day) missing.push("date");
  if (!draft.starts_at && kind !== "lodging") missing.push("time");
  if (kind === "transport" && !draft.service_number) missing.push("flight number");
  if (kind === "transport" && !draft.terminal) missing.push("terminal");
  if (kind === "lodging" && !draft.ends_day) missing.push("check-out date");
  if (!draft.booking_ref) missing.push("booking reference");

  const confidence: Extraction["confidence"] =
    (isFlight && draft.day && draft.starts_at) || (kind === "lodging" && draft.day && draft.ends_day && draft.carrier)
      ? "high"
      : found.length >= 3
        ? "medium"
        : "low";

  return { draft, found, missing, confidence };
}
