import type { Kind, Level } from "./types";

/**
 * The requirement catalogue.
 *
 * This file is the single source of truth shared by three things: the form
 * that collects requirements, the engine that checks them, and the logic that
 * decides which attributes an item's form should ask for. Adding a preset here
 * is the only step needed to make it appear in the UI — but a preset with an
 * empty `attributes` list can never raise a conflict, it can only be shown as
 * a standing reminder. That is a deliberate distinction, not an oversight:
 * "nut allergy" cannot be machine-checked against a restaurant we know nothing
 * about, and pretending otherwise would be worse than admitting it.
 */

export type FieldType = "number" | "time" | "select";

export interface PresetField {
  type: FieldType;
  key: string;
  label: string;
  suffix?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  default?: string | number;
}

export interface Preset {
  code: string;
  label: string;
  /** Shown under the label when the meaning is not obvious. */
  hint?: string;
  category: Category;
  defaultLevel: Level;
  /** Levels the user is allowed to pick. A wheelchair is not a preference. */
  allowedLevels?: Level[];
  field?: PresetField;
  /** Item attributes this requirement is checked against. Empty = reminder only. */
  attributes: string[];
  /** Item kinds this requirement is relevant to. */
  kinds: Kind[];
  /** Checked once per day across all that day's items, not per item. */
  dayLevel?: boolean;
}

export type Category =
  | "mobility"
  | "diet"
  | "comfort"
  | "pace"
  | "budget"
  | "interest"
  | "style";

export const CATEGORY_LABELS: Record<Category, string> = {
  mobility: "Getting around",
  diet: "Food",
  comfort: "Comfort",
  pace: "Pace",
  budget: "Budget",
  interest: "Interests",
  style: "Travel style",
};

const ALL_BUT_NOTE: Kind[] = ["activity", "meal", "transport", "lodging"];

export const PRESETS: Preset[] = [
  // ------------------------------------------------------------- mobility --
  {
    code: "wheelchair",
    label: "Wheelchair access",
    category: "mobility",
    defaultLevel: "mandatory",
    allowedLevels: ["mandatory"],
    attributes: ["wheelchair_accessible", "has_stairs", "has_lift"],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "step_free",
    label: "Step-free access",
    category: "mobility",
    defaultLevel: "mandatory",
    allowedLevels: ["mandatory"],
    attributes: ["has_stairs", "has_lift"],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "no_stairs",
    label: "Cannot manage stairs",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["has_stairs", "has_lift"],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "max_walking_minutes",
    label: "Limit on walking at one time",
    category: "mobility",
    defaultLevel: "mandatory",
    field: { type: "number", key: "minutes", label: "Most they can walk", suffix: "min", min: 1, max: 300, default: 15 },
    attributes: ["walking_minutes"],
    kinds: ["activity", "meal", "transport"],
  },
  {
    code: "daily_walking_limit",
    label: "Limit on walking in a day",
    hint: "Checked across everything planned that day",
    category: "mobility",
    defaultLevel: "mandatory",
    field: {
      type: "select",
      key: "level",
      label: "Comfortable walking",
      default: "moderate",
      options: [
        { value: "minimal", label: "Minimal — under 30 min a day" },
        { value: "moderate", label: "Moderate — up to 90 min a day" },
        { value: "extensive", label: "Extensive — happy to walk all day" },
      ],
    },
    attributes: ["walking_minutes"],
    kinds: ["activity", "meal", "transport"],
    dayLevel: true,
  },
  {
    code: "frequent_rest",
    label: "Needs to sit down often",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["seating_available"],
    kinds: ["activity", "meal", "transport"],
  },
  {
    code: "avoid_steep",
    label: "Avoid steep or rough ground",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["terrain"],
    kinds: ["activity"],
  },
  {
    code: "pushchair",
    label: "Travelling with a pushchair",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["has_stairs", "has_lift", "terrain"],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "child_car_seat",
    label: "Needs a child car seat",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["child_seat_available"],
    kinds: ["transport"],
  },
  {
    code: "needs_cot",
    label: "Needs a cot",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: ["cot_available"],
    kinds: ["lodging"],
  },
  {
    code: "accessible_toilets",
    label: "Accessible toilets",
    hint: "Shown as a reminder — we can't verify this automatically",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: [],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "airport_assistance",
    label: "Assistance at airports",
    hint: "Shown as a reminder on flights",
    category: "mobility",
    defaultLevel: "mandatory",
    attributes: [],
    kinds: ["transport"],
  },

  // ----------------------------------------------------------------- diet --
  {
    code: "gluten_free",
    label: "Coeliac / gluten-free",
    category: "diet",
    defaultLevel: "mandatory",
    allowedLevels: ["mandatory"],
    attributes: ["gluten_free_options"],
    kinds: ["meal"],
  },
  {
    code: "vegetarian",
    label: "Vegetarian",
    category: "diet",
    defaultLevel: "mandatory",
    attributes: ["vegetarian_options"],
    kinds: ["meal"],
  },
  {
    code: "vegan",
    label: "Vegan",
    category: "diet",
    defaultLevel: "mandatory",
    attributes: ["vegan_options"],
    kinds: ["meal"],
  },
  { code: "nut_allergy", label: "Nut allergy", hint: "Reminder on every meal", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },
  { code: "shellfish_allergy", label: "Shellfish allergy", hint: "Reminder on every meal", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },
  { code: "lactose_free", label: "Lactose intolerant", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },
  { code: "halal", label: "Halal", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },
  { code: "kosher", label: "Kosher", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },
  { code: "low_salt", label: "Low salt", category: "diet", defaultLevel: "mandatory", attributes: [], kinds: ["meal"] },

  // -------------------------------------------------------------- comfort --
  {
    code: "avoid_crowds",
    label: "Prefers less crowded places",
    category: "comfort",
    defaultLevel: "preferred",
    attributes: ["crowded"],
    kinds: ["activity", "meal"],
  },
  {
    code: "no_early_starts",
    label: "No early starts",
    category: "comfort",
    defaultLevel: "preferred",
    field: { type: "time", key: "time", label: "Not before", default: "09:00" },
    attributes: [],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "heat_sensitive",
    label: "Sensitive to heat",
    hint: "Flags outdoor activities in the middle of the day",
    category: "comfort",
    defaultLevel: "preferred",
    attributes: ["outdoor"],
    kinds: ["activity"],
  },
  { code: "extra_connection_time", label: "Extra time between connections", category: "comfort", defaultLevel: "preferred", attributes: [], kinds: ["transport"] },
  { code: "predictable_schedule", label: "Prefers a predictable schedule", category: "comfort", defaultLevel: "preferred", attributes: [], kinds: ALL_BUT_NOTE },
  { code: "quiet_accommodation", label: "Accommodation in a quiet area", category: "comfort", defaultLevel: "preferred", attributes: [], kinds: ["lodging"] },

  // ----------------------------------------------------------------- pace --
  {
    code: "pace_level",
    label: "How busy the days should be",
    category: "pace",
    defaultLevel: "preferred",
    field: {
      type: "select",
      key: "level",
      label: "Pace",
      default: "balanced",
      options: [
        { value: "relaxed", label: "Relaxed — plenty of free time" },
        { value: "balanced", label: "Balanced — activities with time to relax" },
        { value: "packed", label: "Packed — see as much as possible" },
      ],
    },
    attributes: [],
    kinds: ["activity"],
    dayLevel: true,
  },
  {
    code: "max_activities_per_day",
    label: "Most activities in a day",
    category: "pace",
    defaultLevel: "preferred",
    field: { type: "number", key: "count", label: "At most", suffix: "a day", min: 1, max: 12, default: 3 },
    attributes: [],
    kinds: ["activity"],
    dayLevel: true,
  },
  {
    code: "afternoon_rest",
    label: "A rest in the afternoon",
    category: "pace",
    defaultLevel: "preferred",
    attributes: [],
    kinds: ["activity"],
    dayLevel: true,
  },

  // --------------------------------------------------------------- budget --
  {
    code: "budget_profile",
    label: "Approach to spending",
    category: "budget",
    defaultLevel: "preferred",
    field: {
      type: "select",
      key: "level",
      label: "Usually",
      default: "value",
      options: [
        { value: "budget", label: "Budget-conscious" },
        { value: "value", label: "Best value for money" },
        { value: "mid", label: "Comfortable mid-range" },
        { value: "premium", label: "Premium" },
        { value: "luxury", label: "Luxury" },
        { value: "depends", label: "It depends on the trip" },
      ],
    },
    attributes: [],
    kinds: ALL_BUT_NOTE,
  },
  {
    code: "max_daily_spend",
    label: "Limit on spending per day",
    category: "budget",
    defaultLevel: "mandatory",
    field: { type: "number", key: "amount", label: "At most", suffix: "per person", min: 1, default: 100 },
    attributes: ["cost"],
    kinds: ALL_BUT_NOTE,
    dayLevel: true,
  },
  {
    code: "max_item_spend",
    label: "Limit on one activity",
    category: "budget",
    defaultLevel: "mandatory",
    field: { type: "number", key: "amount", label: "At most", suffix: "per person", min: 1, default: 50 },
    attributes: ["cost"],
    kinds: ALL_BUT_NOTE,
  },
];

/** Interests and travel styles are plain tags — always preferred, never blocking. */
export const INTERESTS = [
  { code: "museum", label: "Museums" },
  { code: "live_music", label: "Live music" },
  { code: "football", label: "Football" },
  { code: "nature", label: "Nature" },
  { code: "history", label: "History" },
  { code: "food", label: "Food" },
  { code: "art", label: "Art" },
  { code: "architecture", label: "Architecture" },
  { code: "market", label: "Markets" },
  { code: "shopping", label: "Shopping" },
  { code: "nightlife", label: "Nightlife" },
  { code: "beach", label: "Beach" },
];

export const STYLES = [
  { code: "relaxed", label: "Relaxed and easy", emoji: "🏖" },
  { code: "explore", label: "Explore and discover", emoji: "🌍" },
  { code: "adventure", label: "Adventure and activities", emoji: "🏔" },
  { code: "food_culture", label: "Food and local culture", emoji: "🍽" },
  { code: "shopping_city", label: "Shopping and city life", emoji: "🛍" },
  { code: "luxury", label: "Luxury and comfort", emoji: "✨" },
  { code: "entertainment", label: "Entertainment and nightlife", emoji: "🎉" },
  { code: "mixed", label: "A bit of everything", emoji: "⚖️" },
];

export const TRAVELS_WITH = [
  { code: "solo", label: "Just me" },
  { code: "partner", label: "Partner" },
  { code: "friends", label: "Friends" },
  { code: "family", label: "Family" },
  { code: "children", label: "Children" },
  { code: "colleagues", label: "Colleagues" },
  { code: "depends", label: "It depends" },
];

export const PRIORITIES = [
  { code: "price", label: "Price" },
  { code: "time", label: "Time" },
  { code: "comfort", label: "Comfort" },
  { code: "unique", label: "Unique experiences" },
  { code: "convenience", label: "Convenience" },
];

export const PRESET_BY_CODE: Record<string, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.code, p])
);

/** How each item attribute is rendered in the item form. */
export interface AttributeUI {
  key: string;
  label: string;
  control: "tri" | "number" | "terrain";
  hint?: string;
  suffix?: string;
}

export const ATTRIBUTE_UI: Record<string, AttributeUI> = {
  walking_minutes: { key: "walking_minutes", label: "Walking involved", control: "number", suffix: "min" },
  wheelchair_accessible: { key: "wheelchair_accessible", label: "Wheelchair accessible", control: "tri" },
  has_stairs: { key: "has_stairs", label: "Has stairs", control: "tri" },
  has_lift: { key: "has_lift", label: "Has a lift", control: "tri" },
  terrain: { key: "terrain", label: "Ground", control: "terrain" },
  seating_available: { key: "seating_available", label: "Somewhere to sit", control: "tri" },
  child_seat_available: { key: "child_seat_available", label: "Child seat available", control: "tri" },
  cot_available: { key: "cot_available", label: "Cot available", control: "tri" },
  gluten_free_options: { key: "gluten_free_options", label: "Gluten-free options", control: "tri" },
  vegetarian_options: { key: "vegetarian_options", label: "Vegetarian options", control: "tri" },
  vegan_options: { key: "vegan_options", label: "Vegan options", control: "tri" },
  outdoor: { key: "outdoor", label: "Outdoors", control: "tri" },
  crowded: { key: "crowded", label: "Usually crowded", control: "tri" },
  cost: { key: "cost", label: "Cost per person", control: "number" },
};

/**
 * Which attributes an item's form should ask about.
 *
 * Two filters, both necessary. A flight does not care whether the kitchen is
 * gluten-free, and a group with nobody in a wheelchair should never be asked
 * about step-free access. Ask only what is relevant to this kind of item AND
 * used by a requirement somebody on this trip actually has.
 */
export function attributesForItem(kind: Kind, activeCodes: string[]): string[] {
  const wanted = new Set<string>();
  for (const code of activeCodes) {
    const preset = PRESET_BY_CODE[code];
    if (!preset || !preset.kinds.includes(kind)) continue;
    for (const attr of preset.attributes) wanted.add(attr);
  }
  return [...wanted];
}
