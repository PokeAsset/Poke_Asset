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
- **Menu pages with no screenshot** (Sets & checklists, Sealed products, Sealed market, Messages, My sale staging, Live shop, Store, My orders, Business pages): placeholder screens.

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
| `GEMINI_MODEL` | optional, defaults to `gemini-2.5-flash` |

After adding or changing a variable, redeploy (Deployments → ⋯ → Redeploy).

If a feature's key is missing the app says so on screen instead of showing made-up numbers.

## Theme
The sun/moon button in the header switches dark and light and remembers the choice.

## Making the site public
See the Vercel "Deployment Protection" setting (turn Vercel Authentication off), then submit
`/sitemap.xml` in Google Search Console. If you buy a domain, replace `pokeasset-nine.vercel.app`
in `public/index.html`, `public/robots.txt` and `public/sitemap.xml`.

## Browse
Menu → Sets & checklists → pick an era → pick a set → Singles / Sealed tabs. Every row has "+ Add".
Eras are defined in `src/eras.ts`; add a series name there if the catalog introduces a new one.
