/**
 * Checks the booking extractor against realistic confirmations.
 *
 *   node --experimental-strip-types scripts/test-extract.ts
 *
 * The point of these cases is not to prove the extractor is clever. It is to
 * prove it never invents anything: every expectation below is a value that
 * appears literally in the text above it.
 */
import { extractBooking } from "../src/lib/extract.ts";

interface Case {
  name: string;
  subject?: string;
  text: string;
  expect: Record<string, string | undefined>;
}

const cases: Case[] = [
  {
    name: "Vueling booking confirmation",
    subject: "Your Vueling booking VY6000 – BCN to FCO",
    text: `
      VUELING AIRLINES
      Booking reference: KJ8P2M
      Passenger: JOFRA/JOAN MR

      Outbound  12/09/2026
      VY 6000   Barcelona (BCN)  Terminal 1   07:45
                Rome Fiumicino (FCO)          09:55

      Total paid: 184,50 EUR
    `,
    expect: {
      kind: "transport",
      mode: "flight",
      carrier: "Vueling",
      service_number: "VY6000",
      origin_code: "BCN",
      destination_code: "FCO",
      terminal: "1",
      day: "2026-09-12",
      starts_at: "07:45",
      ends_at: "09:55",
      booking_ref: "KJ8P2M",
      cost: "184.50",
    },
  },
  {
    name: "Hotel confirmation, English",
    subject: "Your reservation at Hotel Santa Maria is confirmed",
    text: `
      Hotel Santa Maria
      Vicolo del Piede 2, Trastevere, Rome

      Confirmation number: 4471903352
      Check-in:  Saturday 12 September 2026 from 15:00
      Check-out: Tuesday 15 September 2026 until 11:00
      2 nights, Double room with garden view
      Total: 420,00 EUR
    `,
    expect: {
      kind: "lodging",
      carrier: "Hotel Santa Maria",
      day: "2026-09-12",
      ends_day: "2026-09-15",
      booking_ref: "4471903352",
    },
  },
  {
    name: "Overnight flight lands the next day",
    subject: "Booking confirmation",
    text: `
      Iberia  IB 6403
      Madrid (MAD) 23:40  ->  New York JFK (JFK) 03:15
      Date: 2026-10-04
      Localizador: QWERTY
    `,
    expect: {
      kind: "transport",
      service_number: "IB6403",
      origin_code: "MAD",
      destination_code: "JFK",
      day: "2026-10-04",
      starts_at: "23:40",
      ends_at: "03:15",
      ends_day: "2026-10-05",
      booking_ref: "QWERTY",
    },
  },
  {
    name: "Catalan hotel confirmation",
    subject: "Reserva confirmada — Apartaments Gaudí",
    text: `
      Apartaments Gaudí
      Carrer de Mallorca 401, Barcelona
      Localitzador: BCN9921X
      Entrada: 3 de maig de 2026
      Sortida: 7 de maig de 2026
      Import total: 560,00 EUR
    `,
    expect: {
      kind: "lodging",
      day: "2026-05-03",
      ends_day: "2026-05-07",
      booking_ref: "BCN9921X",
    },
  },
  {
    name: "Restaurant booking — not a flight, not a hotel",
    subject: "Your table at Trattoria da Enzo",
    text: `
      Trattoria da Enzo al 29
      Via dei Vascellari 29, Roma
      Table for 4 on 13/09/2026 at 20:30
    `,
    expect: { kind: "meal", day: "2026-09-13", starts_at: "20:30" },
  },
  {
    // How a PDF actually arrives: the table is flattened, so the word after a
    // label is the next column's heading rather than the value.
    name: "Flattened PDF text, columns collapsed onto one line",
    subject: "Your Vueling booking VY6000 – BCN to FCO",
    text:
      "VUELING AIRLINES Booking confirmation BOOKING REFERENCE PASSENGER " +
      "KJ8P2M JOFRA/JOAN MR FLIGHT DATE TERMINAL VY 6000 21/08/2026 1 " +
      "FROM DEPARTS TO ARRIVES Barcelona (BCN) 07:45 Rome Fiumicino (FCO) 09:55 " +
      "Total paid: 184,50 EUR · 1 cabin bag included",
    expect: {
      kind: "transport",
      service_number: "VY6000",
      origin_code: "BCN",
      destination_code: "FCO",
      day: "2026-08-21",
      starts_at: "07:45",
      ends_at: "09:55",
      booking_ref: "KJ8P2M",
      cost: "184.50",
      // The terminal really is in there, but only as a bare "1" adrift from its
      // label. Better to report it missing than to guess "VY".
      terminal: undefined,
    },
  },
  {
    name: "Nothing recognisable — must not invent",
    subject: "Hello",
    text: "Hi Joan, just checking you got my message. Speak soon!",
    expect: { kind: "activity", day: undefined, service_number: undefined, booking_ref: undefined },
  },
];

let failures = 0;
let checks = 0;

for (const testCase of cases) {
  const result = extractBooking(testCase.text, { subject: testCase.subject, yearHint: 2026 });
  const problems: string[] = [];

  for (const [key, expected] of Object.entries(testCase.expect)) {
    checks++;
    const actual = (result.draft as Record<string, unknown>)[key];
    const actualStr = actual === undefined || actual === null ? undefined : String(actual);
    if (actualStr !== expected) {
      problems.push(`    ${key}: expected ${expected ?? "(nothing)"}, got ${actualStr ?? "(nothing)"}`);
      failures++;
    }
  }

  const mark = problems.length === 0 ? "PASS" : "FAIL";
  console.log(`${mark}  ${testCase.name}  [${result.confidence}]`);
  if (problems.length) console.log(problems.join("\n"));
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
process.exit(failures > 0 ? 1 : 0);
