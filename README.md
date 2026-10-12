# ✳ Gather & Give — Gift Exchange Studio

A modern remaster of the original **[Gift Exchange Spinner](https://github.com/lasquires/gift_exchange_setup)**. A lovely, fully browser-based gift-exchange planner and reveal ceremony, built with plain HTML, CSS, and JavaScript.

**No sign-in. No server. No dependencies. Works on GitHub Pages, Vercel, and offline after the site has been cached.**

## What's new in version 2

- **Modern, mobile-friendly interface** and full-screen gift wheel with animated, guaranteed landing on the precomputed recipient.
- **Real constraint solving** instead of 5,000 retries with greedy selection. Uses randomized backtracking, tightest-choice-first search and a bipartite feasibility check. It detects impossible combinations rather than returning incomplete or invalid assignments. Very complex searches have a safety limit.
- **Unambiguous names and groups**, with clear errors for duplicate people, unknown names, contradictory planned pairs, and impossible rules.
- **Advanced pair controls**: historical/avoid pairs, preassigned pairs, imported `.txt`/`.csv`, same-group and two-way exchange rules.
- **Private organizer view**, TXT and JSON exports, presentation mode with adjustable spin power, opt-in audio toggle, mobile tap support, and reduced-motion support.
- **Persistent setup on this browser** via localStorage. Matches are *not* persisted across refreshes, avoiding accidental disclosure of private assignments.
- **Offline-capable installable web app** (service worker + manifest) once visited on a secure origin.
- **Automated tests** covering constraints, infeasible configurations, and imports.

## Try it

The original GitHub Pages URL will serve the new version **after** this pull request is merged:

**https://lasquires.github.io/gift_exchange_setup/**

If running locally, use a static server (not `file://`, because ES modules require HTTP):

```bash
npm run start
# open http://localhost:8080
```

Or deploy as a static folder on Vercel (no build command required).

## Format

Each line contains a group name followed by comma-separated people. Group name is optional:

```text
Smith: Alice, Ben, Caroline
Johnson: David, Elena, Finn
Grace, Henry
```

All names must be unique. Repeat a group label to add more members to the same group.

Exclusions (for previous-year repeats) and fixed assignments accept either:

```text
Alice -> David
Ben, Elena
Caroline → Finn
```

Plain-text exports contain just pairs and can be **imported directly** into the Avoid Pairs field next year. CSV imports can include a `Giver,Recipient` header; quoted names with commas are supported.

## Rules and fairness

Every participant gives to exactly one *other* participant and receives from exactly one participant. By default, no one can give within their group and two-way reciprocal pairs are forbidden. Optional planned pairs must obey the same rules. Exclusions are directional (Alice→Bob does not imply Bob→Alice is excluded).

The matching algorithm randomizes choice order but **does not guarantee a perfectly uniform probability over every mathematically valid matching**. A spin **reveals an already-generated valid pairing**; the spin's power only changes the animation, never the recipient.

Names and exclusions never leave the browser. The setup is locally saved for convenience. Exported organizer files contain personal names—keep them private.

## Keyboard controls

In reveal mode, press **Space** to charge/spin/advance when focus is not in a form control, **F** to toggle fullscreen, and **Esc** to leave. Click or tap the main button or wheel as an alternative. The interface respects reduced-motion preferences.

## Development

```bash
npm test
```

No package installation is required. Requires Node 18+ only for tests/local serving.

## Why keep it static?

This project began as a little family tool with a spinning wheel and considerate assignment rules. Keeping the remaster static makes it easy to share, host for free, install, and use without handing everyone's names to a service.
