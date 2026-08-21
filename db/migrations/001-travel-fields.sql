-- Adds flight and hotel fields to an existing database.
-- New installations get these from schema.sql and can skip this.
--   psql "$DATABASE_URL" -f db/migrations/001-travel-fields.sql

ALTER TABLE items ADD COLUMN IF NOT EXISTS mode             text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS carrier          text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS service_number   text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS origin           text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS origin_code      text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS destination      text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS destination_code text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS terminal         text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ends_day         date;
