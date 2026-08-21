export type Level = "mandatory" | "preferred";
export type Kind = "activity" | "meal" | "transport" | "lodging" | "note";
export type Tri = "yes" | "no" | "unknown";

export interface Owner {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  currency: string;
  share_token: string;
  share_revoked_at: string | null;
  link_can_edit: boolean;
  inbox_token: string;
}

export interface Traveller {
  id: string;
  project_id: string;
  owner_id: string | null;
  name: string;
  age: number | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  language: string | null;
  currency: string | null;
  timezone: string | null;
  travels_with: string[];
  priorities: string[];
  health_disclosure: string | null;
  share_needs: boolean;
  profile_completed_at: string | null;
}

export interface Requirement {
  id: string;
  project_id: string;
  traveller_id: string | null;
  level: Level;
  category: string;
  code: string;
  value: Record<string, unknown>;
  note: string | null;
}

export interface Item {
  id: string;
  project_id: string;
  day: string;
  starts_at: string | null;
  ends_at: string | null;
  kind: Kind;
  title: string;
  location_name: string | null;
  address: string | null;
  url: string | null;
  notes: string | null;
  cost: string | null;
  booking_ref: string | null;
  mode: string | null;
  carrier: string | null;
  service_number: string | null;
  origin: string | null;
  origin_code: string | null;
  destination: string | null;
  destination_code: string | null;
  terminal: string | null;
  ends_day: string | null;
  sort_order: number;
}

export const TRANSPORT_MODES = [
  { value: "flight", label: "Flight" },
  { value: "train", label: "Train" },
  { value: "bus", label: "Bus" },
  { value: "ferry", label: "Ferry" },
  { value: "car", label: "Car" },
] as const;

export interface ItemAttributes {
  item_id: string;
  walking_minutes: number | null;
  wheelchair_accessible: Tri;
  has_stairs: boolean | null;
  has_lift: boolean | null;
  terrain: "flat" | "hilly" | "rough" | null;
  seating_available: Tri;
  child_seat_available: Tri;
  cot_available: Tri;
  min_age: number | null;
  gluten_free_options: Tri;
  vegetarian_options: Tri;
  vegan_options: Tri;
  outdoor: boolean | null;
  crowded: boolean | null;
  tags: string[];
}

export interface HealthDetails {
  traveller_id: string;
  carries_medication: boolean;
  medication_times: string[];
  needs_refrigeration: boolean;
  needs_documentation: boolean;
  carries_equipment: boolean;
  equipment_note: string | null;
  wants_reminders: boolean;
  insurance_provider: string | null;
  insurance_phone: string | null;
  notes: string | null;
}

export interface Change {
  id: string;
  project_id: string;
  item_id: string | null;
  actor_name: string | null;
  action: "created" | "updated" | "deleted";
  summary: string;
  created_at: string;
}
