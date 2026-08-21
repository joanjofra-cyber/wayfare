-- ===========================================================================
-- Group Itinerary App — schema
--
-- Design notes that matter:
--   * No passwords anywhere. Identity is Google (organiser) or a share link
--     (everyone else), so there is no password_hash and no tokens table.
--   * Health details live in their own table, not as columns on travellers.
--     They have different visibility rules and different deletion rules, and
--     keeping them separate makes both enforceable in one place.
--   * Everything about a person is optional except their name.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- People who sign in with Google. Only organisers ever appear here.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub   text UNIQUE NOT NULL,      -- stable; email is not
  email        text NOT NULL,
  name         text NOT NULL,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- A trip.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name              text NOT NULL,               -- a label, not an identifier
  destination       text,
  start_date        date,
  end_date          date,
  timezone          text NOT NULL DEFAULT 'Europe/Madrid',
  currency          text NOT NULL DEFAULT 'EUR',
  share_token       text UNIQUE NOT NULL,
  share_revoked_at  timestamptz,
  -- The single switch that turns the consumer app into agency mode: when
  -- false, link holders can read the itinerary but not change it.
  link_can_edit     boolean NOT NULL DEFAULT true,
  inbox_token       text UNIQUE NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);

-- --------------------------------------------------------------------------
-- Everyone on the trip. Name is the only required field in the product.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS travellers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Set only on the organiser's own row, and only if they are travelling.
  owner_id      uuid REFERENCES owners(id) ON DELETE SET NULL,
  name          text NOT NULL,
  age           int,
  phone         text,
  email         text,
  country       text,
  language      text,        -- BCP-47: ca, es, en
  currency      text,        -- ISO 4217
  timezone      text,        -- their own, NOT the trip's. Never used for "today".
  -- Travel profile (preferences.docx)
  travels_with  text[]  NOT NULL DEFAULT '{}',  -- solo, partner, friends, family, children, colleagues
  priorities    text[]  NOT NULL DEFAULT '{}',  -- ordered: price, time, comfort, unique, convenience
  -- Health disclosure choice: 'none' | 'yes' | 'prefer_not_to_say' | null
  health_disclosure text,
  -- The traveller decides whether the rest of the group sees their needs.
  -- Health details (separate table) are never shown to the group regardless.
  share_needs   boolean NOT NULL DEFAULT true,
  profile_completed_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travellers_project_idx ON travellers(project_id);

-- --------------------------------------------------------------------------
-- Requirements: the conditions the itinerary has to satisfy.
--   level = 'mandatory'  -> validates the itinerary, raises conflicts
--   level = 'preferred'  -> ranks suggestions, never blocks
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  traveller_id  uuid REFERENCES travellers(id) ON DELETE CASCADE,  -- null = whole group
  level         text NOT NULL CHECK (level IN ('mandatory', 'preferred')),
  category      text NOT NULL,   -- mobility, diet, pace, budget, interest, style, comfort, other
  code          text NOT NULL,   -- machine-checkable, e.g. max_walking_minutes
  value         jsonb NOT NULL DEFAULT '{}'::jsonb,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requirements_project_idx ON requirements(project_id);
CREATE INDEX IF NOT EXISTS requirements_traveller_idx ON requirements(traveller_id);

-- --------------------------------------------------------------------------
-- Health details. Deliberately a separate table:
--   * visible only to the traveller themselves and the trip organiser,
--     never to other link holders, regardless of share_needs;
--   * deletable on its own without touching the rest of the profile.
--
-- Needs-based, not diagnosis-based. There is no column for "condition" or
-- "diagnosis" and there should never be one. We store what changes the plan.
--
-- Note: no insurance policy number. The emergency phone number is what is
-- useful during a trip; a policy number is a liability with no upside here.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_details (
  traveller_id          uuid PRIMARY KEY REFERENCES travellers(id) ON DELETE CASCADE,
  carries_medication    boolean NOT NULL DEFAULT false,
  medication_times      text[]  NOT NULL DEFAULT '{}',   -- 'HH:MM' in the trip's timezone
  needs_refrigeration   boolean NOT NULL DEFAULT false,
  needs_documentation   boolean NOT NULL DEFAULT false,  -- for airport security / customs
  carries_equipment     boolean NOT NULL DEFAULT false,
  equipment_note        text,
  wants_reminders       boolean NOT NULL DEFAULT false,
  insurance_provider    text,
  insurance_phone       text,
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- The itinerary itself.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day           date NOT NULL,
  starts_at     time,          -- null sorts last within the day
  ends_at       time,
  kind          text NOT NULL CHECK (kind IN ('activity','meal','transport','lodging','note')),
  title         text NOT NULL,
  location_name text,
  address       text,
  url           text,
  notes         text,
  cost          numeric(10,2),
  booking_ref   text,
  -- Travel and stay specifics. A flight is not "an activity with a title":
  -- it has a number, two airports and a terminal, and an itinerary that can't
  -- hold those is not usable on an actual trip.
  mode            text,   -- transport: flight, train, bus, car, ferry
  carrier         text,   -- 'Vueling', 'Renfe', 'Hotel Santa Maria'
  service_number  text,   -- flight or train number
  origin          text,
  origin_code     text,   -- IATA / station code
  destination     text,
  destination_code text,
  terminal        text,
  -- Serves two purposes: the arrival day of an overnight flight, and the
  -- check-out day of a hotel stay. Both are "the day this thing ends".
  ends_day      date,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS items_project_day_idx ON items(project_id, day);

-- --------------------------------------------------------------------------
-- What an item demands of the people doing it.
-- Every column is nullable or 'unknown': the organiser fills in a few.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_attributes (
  item_id                uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  walking_minutes        int,
  wheelchair_accessible  text NOT NULL DEFAULT 'unknown' CHECK (wheelchair_accessible IN ('yes','no','unknown')),
  has_stairs             boolean,
  has_lift               boolean,
  terrain                text CHECK (terrain IN ('flat','hilly','rough')),
  seating_available      text NOT NULL DEFAULT 'unknown' CHECK (seating_available IN ('yes','no','unknown')),
  child_seat_available   text NOT NULL DEFAULT 'unknown' CHECK (child_seat_available IN ('yes','no','unknown')),
  cot_available          text NOT NULL DEFAULT 'unknown' CHECK (cot_available IN ('yes','no','unknown')),
  min_age                int,
  gluten_free_options    text NOT NULL DEFAULT 'unknown' CHECK (gluten_free_options IN ('yes','no','unknown')),
  vegetarian_options     text NOT NULL DEFAULT 'unknown' CHECK (vegetarian_options IN ('yes','no','unknown')),
  vegan_options          text NOT NULL DEFAULT 'unknown' CHECK (vegan_options IN ('yes','no','unknown')),
  outdoor                boolean,          -- pairs with heat sensitivity
  crowded                boolean,          -- pairs with "prefers less crowded"
  tags                   text[] NOT NULL DEFAULT '{}'
);

-- --------------------------------------------------------------------------
-- Who is actually doing each item.
-- NO ROWS FOR AN ITEM MEANS EVERYBODY IS GOING. That way the organiser only
-- touches this in the rare case where someone opts out.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_participants (
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  traveller_id  uuid NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, traveller_id)
);

-- --------------------------------------------------------------------------
-- Documents: uploaded, or arrived by email at the trip's inbox address.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id       uuid REFERENCES items(id) ON DELETE SET NULL,
  filename      text NOT NULL,
  mime_type     text,
  size_bytes    int,
  content       bytea,          -- fine at demo scale; move to blob storage later
  source        text NOT NULL CHECK (source IN ('upload','email')),
  from_email    text,
  subject       text,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_project_idx ON documents(project_id);

-- Remembers which emails have already been ingested, so a second run of the
-- mail check does not create duplicates.
CREATE TABLE IF NOT EXISTS ingested_emails (
  message_id   text PRIMARY KEY,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  ingested_at  timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Change log. Powers "3 changes since you last looked", and once anyone with
-- the link can edit, a log without names is close to useless — hence actor_name.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id       uuid,
  actor_name    text,
  action        text NOT NULL CHECK (action IN ('created','updated','deleted')),
  summary       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS changes_project_idx ON changes(project_id, created_at DESC);
