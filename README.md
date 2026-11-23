# PokéAsset

Pokémon card portfolio tracker (Collectr-style), built with Expo + React Native + TypeScript so it can ship to the iOS App Store.

## Run it

```bash
npm install
npx expo start        # press i for iOS simulator, or scan the QR with Expo Go
```

## What's in here

| Area | File |
| --- | --- |
| Navigation, tab bar | `App.tsx` |
| Slide-in menu (Catalog / My portfolio / Community / Business) | `src/MenuDrawer.tsx` |
| Colours, radii | `src/theme.ts` |
| Shared UI (header, gradient titles, chips, photo slots) | `src/ui.tsx` |
| Catalog + pricing (pokemontcg.io, TCGplayer market estimates) | `src/api.ts` |
| Local storage + price refresh (collection, wishlist, alerts, history) | `src/store.tsx` |
| Portfolio maths, value chart, entry form | `src/portfolio.ts`, `src/charts.tsx`, `src/EntryForm.tsx` |
| Price source (swap point for Poke Wallet) | `src/prices.ts` |
| Home, Assistant, Scan, Sealed scan, PokéGrade, Price research, Trade analyzer, Marketplace, My cards, Alerts | `src/screens/` |

## Honest status

Working with real data: portfolio value, cost and profit/loss, daily value history, set completion, wishlist with targets, price refresh, catalog search, "most valuable" grids, price research, card detail, add to collection, price alerts (only fire on a stored price), trade analyzer, local marketplace listings, photo capture.

Needs keys on the server (see below): assistant, card scan, sealed scan, PokéGrade, graded prices, history, sealed products.
- **Marketplace, Messages, accounts, payments**: listings are on-device only.
- **Menu pages with no screenshot** (Messages, Live shop, Business dashboard, Suppliers, Moderation): placeholder screens.

## Before the App Store

- Change `ios.bundleIdentifier` in `app.json`.
- Add `icon` and `splash` assets.
- Build with EAS: `npx eas build -p ios`.
- Pricing data comes from pokemontcg.io; check its terms and add your own backend/keys for production.

## Server functions (the `api/` folder) and keys

Keys live in Vercel, never in the app code. Vercel → your project → Settings → Environment Variables:

| Name | What it turns on |
| --- | --- |
| `GEMINI_API_KEY` | AI assistant, card scanner, sealed scanner, PokéGrade photo read (Google Gemini) |
| `PRICE_API_KEY` | Graded (PSA/CGC/BGS/SGC) prices, price history, sealed products (pokemonpricetracker.com v2 API) |
| `POKEMONTCG_API_KEY` | optional: free key from dev.pokemontcg.io, makes the card catalog faster and less likely to time out |
| `GEMINI_THINKING` | optional: `minimal` or `low` makes Gemini 3 models answer faster |
| `GEMINI_MODEL` | optional, defaults to `gemini-3.8-flash` |
| `SUPABASE_URL` | Accounts + cloud-saved portfolio (Supabase project URL) |
| `SUPABASE_ANON_KEY` | Accounts: the project's public anon / publishable key (never the service_role key) |

After adding or changing a variable, redeploy (Deployments → ⋯ → Redeploy).

If a feature's key is missing the app says so on screen instead of showing made-up numbers.

## Accounts (email + password)
Menu → Account. Powered by Supabase Auth; the app talks to Supabase directly, so passwords never touch this
server. One-time setup: create a free Supabase project, run `supabase/setup.sql` in its SQL Editor, add
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel, and set Authentication → URL Configuration → Site URL to your
site address. `/api/status` shows `accounts: true` when it is connected. Row-level security keeps each person's
portfolio private.

## Marketplace (Store, My sale staging, My orders, Marketplace ops)
One-time setup after accounts work: in Supabase → SQL Editor, run `supabase/marketplace.sql`. It creates listings,
orders, reports, history tables, a public `listing-photos` bucket, and Row Level Security so people can only change
their own listings and orders. To become an administrator, run this once (with your own email):

    insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;

Admin powers (Marketplace ops) are enforced by the database, not by hiding buttons.
PokéAsset takes no payments: an order inside the app is a *request* and `payment` is always `not_processed`.
Purchases made on other sites are logged separately and labelled "Bought outside PokéAsset".

## Data health
Menu → Business → Data health runs one tiny live request against Gemini, the price service, the card catalog and
Supabase, and shows what each answered. Use it first whenever something stops loading.

## Sealed prices
Sealed products are listed per set. Prices come from the price service (`PRICE_API_KEY`) through `api/_providers.js`, a list of price providers: another legitimate provider can be added there without touching the screens. Each price shows its source and date, with market price, lowest listing and history kept separate, and a Refresh button. TCGplayer has no public
price API, so products without a price show "No price on file" and a "Check on TCGplayer" search link. Nothing is guessed.

## Theme
The sun/moon button in the header switches dark and light and remembers the choice.

## Making the site public
See the Vercel "Deployment Protection" setting (turn Vercel Authentication off), then submit
`/sitemap.xml` in Google Search Console. If you buy a domain, replace `pokeasset-nine.vercel.app`
in `public/index.html`, `public/robots.txt` and `public/sitemap.xml`.

## Browse
Home → View Pokémon card sets (or Menu → Card sets by era) → pick an era → pick a set → Singles / Sealed tabs. Every row has "+ Add".
Eras are defined in `src/eras.ts`; add a series name there if the catalog introduces a new one.

Sealed products: Menu → Sealed products by set → pick an era → pick a set.

## Shared price cache (update 14)

- Run `supabase/prices.sql` once in the Supabase SQL editor.
- Vercel env vars (server only): `SUPABASE_SERVICE_KEY` (the Supabase secret key), `CRON_SECRET` (any long random text), optional `REFRESH_CREDITS` (credits to use per daily run, default 80).
- `vercel.json` runs `/api/refresh` daily. It saves sealed prices set by set, and after a full pass waits 14 days before the next. Open `/api/refresh?key=<CRON_SECRET>` to run it by hand (add `&force=1` to restart a pass).
- The app reads saved prices first; the Refresh button asks the price service again and saves the result.
