# Gift Exchange

A browser-based gift exchange assignment tool and spinning reveal. Based on the original [Gift Exchange Spinner](https://github.com/lasquires/gift_exchange_setup).

## Features

- Each person gives and receives exactly one gift.
- By default, no self-pairing, same-group pairing, or reciprocal pairing.
- Optional exclusions and fixed assignments; import from TXT or CSV.
- Matching engine detects impossible constraints.
- Spinner reveals precomputed valid assignments, with sound and fullscreen controls.
- TXT and JSON exports.
- Setup stays in your browser; no server or account. Works offline after first successful load.

## Usage

Enter groups, one per line:

```text
Smith: Alice, Bob, Carol
Jones: David, Erin, Finn
```

Optionally change the rules or expand **Exclusions and fixed assignments**. Click **Generate assignments**, then **Open spinner**.

Pair imports use `Alice -> David`, `Alice,David`, or `Alice → David` on each line. Previous TXT exports can be imported as next year's exclusions.

The power meter controls the spin animation, not the assigned recipient. Matches are randomized but not guaranteed to be sampled uniformly from all valid assignments.

## Local development

```bash
npm run start
# http://localhost:8080
npm test
```

Plain HTML/CSS/JavaScript; no installation required for the app. Deploy as static files to GitHub Pages or Vercel.
