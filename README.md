# Wayfare

A trip planner built around the people going on the trip.

Two things make it different from every other itinerary app. It knows **who is
travelling and what they need** — a wheelchair, a ten-minute walking limit, a
gluten-free kitchen — and checks every plan against those needs as you type it.
And every trip gets **its own email address**: forward a hotel confirmation and
the booking lands in the itinerary.

Nobody in the group ever creates an account. The organiser signs in with Google;
everyone else opens a link.

---

## Running it locally

You need Node 20+ and a Postgres database.

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and SESSION_SECRET
npm run db:setup               # creates the tables
npm run dev                    # http://localhost:3000
```

**Without Google credentials the app signs you in as a local account**, so you
can build everything before anyone has been to the Google Cloud console. It
refuses to do that in production.

Optional, and worth doing once you can sign in:

```bash
npm run db:seed
```

That creates a demo trip — Rome, six days, a group with a grandfather who can't
walk far, a coeliac, and a nine-year-old — deliberately containing one red
conflict, one amber unverified, one green match, and an age-restricted wine
tasting. It attaches the trip to whoever signed in most recently, so **sign in
first, then seed**.

---

## The three things you have to set up before Sunday

### 1. Postgres

Any provider works. [Neon](https://neon.tech) and [Supabase](https://supabase.com)
both have a free tier and hand you a connection string. Paste it into
`DATABASE_URL` and run `npm run db:setup`.

### 2. Google sign-in

In the [Google Cloud console](https://console.cloud.google.com):

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application**
3. Authorised redirect URI: `https://your-app.vercel.app/api/auth/callback`
   (and `http://localhost:3000/api/auth/callback` for local work)
4. Copy the client ID and secret into `.env.local`

Then **publish the consent screen to Production**. In Testing mode only accounts
you have explicitly added as testers can sign in, and that is a horrible thing
to discover on stage. The app only requests `openid`, `email` and `profile`,
which Google treats as non-sensitive, so there is no verification process and
users never see the "this app isn't verified" warning.

### 3. The documents inbox

One Gmail account serves every trip through plus-addressing:
`tour.repot+<inbox_token>@gmail.com`. All mail lands in one mailbox and the
`To:` header decides which trip it belongs to.

Turn on 2-Step Verification for the account, then generate a
**16-character app password** at <https://myaccount.google.com/apppasswords> and
put it in `GMAIL_APP_PASSWORD`. The ordinary account password will not
authenticate over IMAP or SMTP.

Nothing else depends on this. If it isn't ready, every other part of the app
still works — the Documents screen just says mail isn't configured.

---

## Reading bookings out of forwarded documents

Forward a flight or hotel confirmation to the trip's inbox, press **Check for
new documents**, then **Read it and add to itinerary**. Wayfare shows what it
found, the snippet each value came from, and what it could not find — then
pre-fills the form. Nothing is saved until you press the button.

```bash
npm run test:extract     # the extractor's test cases
npm run demo:booking     # files a realistic Vueling PDF against the demo trip
```

`demo:booking` is there so the demo can be rehearsed without the mailbox being
configured: it produces a genuine PDF, files it as though it arrived by email,
and everything downstream behaves identically.

### What it can and cannot do

It is **pattern matching, not comprehension**. It recognises around thirty
airlines and seventy airports, dates in English, Spanish and Catalan, times,
booking references, terminals and totals. It handles the awkward part of PDFs,
where a table gets flattened into one line and the word after a label is the
next column's heading rather than the value.

It will miss things, and that is fine — the form is right there. What it must
never do is fill something in wrongly and confidently, so every rule is
conservative, every value comes with the text it was taken from, and anything
not found is listed as missing rather than guessed at. Ambiguous numeric dates
are read day-first, which is right for European bookings and wrong for American
ones.

A scanned or photographed ticket has no text layer. The review screen says so
plainly and you fill the form in by hand, with the file still attached.

## Suggestions for the group

The **Ideas for your group** button on the itinerary asks a language model what
this particular group could do at the destination — passing it the mandatory
requirements, the ages and the interests, not just the city name. It also
returns a short summary of how the trip has been shaped around the people on it.

Set `ANTHROPIC_API_KEY` (from console.anthropic.com) to switch it on. Without a
key the feature says so and nothing else changes.

Two rules the code enforces, and they are the point:

**A suggestion is a draft, never a saved item.** It opens the same
confirm-before-save form as a forwarded booking.

**Access claims are opinions, not facts.** Whatever the model says about
step-free entrances or seating is shown as its note and left *unverified* — the
attribute stays unknown, so the requirement engine reports it as unconfirmed
until a human checks. An estimate wearing the clothes of a fact is worse than no
estimate at all, and `npm run test:advisor` asserts that no accessibility
attribute is ever asserted from a guess.

The default model is Haiku, because a free Vercel function is killed after ten
seconds and a larger model routinely misses that window. `ANTHROPIC_MODEL`
overrides it if you have a longer timeout.

## Deploying to Vercel

```bash
git init && git add -A && git commit -m "Wayfare"
# push to GitHub, then import the repo at vercel.com
```

Set these environment variables in the Vercel project:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | From Neon or Supabase |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | `https://your-app.vercel.app` — used for OAuth redirects and share links |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the Google Cloud console |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | For the documents inbox |

Then run `npm run db:setup` once against the production database.

Two limits of the free tier shaped the design: functions time out at 10 seconds,
and scheduled jobs only run once a day. That is why checking the mailbox is a
**button** rather than a cron job — and in a demo, a button the presenter
presses shows cause and effect far better than something that may or may not
have happened in the background.

---

## How it is put together

```
db/schema.sql              every table, with the reasoning in comments
src/lib/presets.ts         the requirement catalogue — the source of truth
src/lib/conflicts.ts       the engine that checks plans against requirements
src/lib/session.ts         signed-cookie sessions; canView / canEdit
src/lib/queries.ts         data loading
src/lib/actions/           server actions: trips, people, items, documents
src/app/trips/             the organiser's screens
src/app/t/[token]/         the group's screens — share link, today view
```

### Three ideas worth knowing before you change anything

**Requirements come in two strengths.** `mandatory` validates the itinerary and
raises conflicts; `preferred` ranks suggestions and never blocks anything. That
single distinction is the whole product.

**Three outcomes, not two.** Red when a plan breaks a requirement, green when it
matches an interest, and **amber when we don't know** — the attribute was never
filled in. Amber matters as much as red: an app that only ever says yes or no is
claiming knowledge it does not have.

**Nothing is ever hard-blocked.** You can save an item that conflicts. The
organiser may know something the app doesn't, or the person may be sitting that
one out. The app advises; the human decides.

### Adding a requirement

Add an entry to `PRESETS` in `src/lib/presets.ts`, then add a matching `case` in
`checkOne()` in `src/lib/conflicts.ts`. A preset with an empty `attributes` list
can never raise a conflict — it shows as a standing reminder instead, which is
the honest treatment for something like a nut allergy that cannot be checked
against a restaurant we know nothing about.

### Permissions

Every access decision goes through `canView()` and `canEdit()` in
`src/lib/session.ts`, deliberately. Today a trip has one owner. If this ever
becomes a product for travel agencies, an agency is a team and `owner_id` has to
become a membership table — and when that day comes, widening it touches those
two functions and nothing else.

---

## Privacy

Health details live in their own table, `health_details`, separate from the rest
of a traveller's profile. They are visible **only to the person themselves and
the trip organiser** — never to other people holding the share link, whatever
the traveller's sharing setting says. Practical requirements ("gluten-free",
"max 10 min walking") are shared with the group only if the traveller chose to.

The health section is **needs-based, not diagnosis-based**. There is no column
for a medical condition and there should never be one. We store what changes the
plan: whether medication needs refrigeration, whether documentation may be
needed at security, what time it is taken. Policy numbers are deliberately not
stored — an insurer's emergency phone number is what is useful during a trip.
