# MTGLine

Deck-agnostic Magic: The Gathering trainer for opening hands, sequencing, and candidate win routes.

## Features

- Public Moxfield import or pasted lists, quantities and exact-printing fallback
- Zero, one, or two commanders; all five colors and colorless
- Server-resolved Scryfall metadata and deterministic deck facts
- One validated AI DeckProfile per deck, cached independently of hand practice
- Profile-specific strategy, roles, synergies, mulligan priorities and candidate win routes
- Deterministic, bounded four-turn mana search with actual spending, tap delays and fetch targets
- London mulligans, including the first free multiplayer mulligan and choosing bottom cards
- Active deck and profile restored from browser storage
- Real card art and Oracle text from Scryfall
- Battlefield and commander simulation
- Card-specific contextual coaching and synergy hints

## Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
npm test
npm run check
```

Open http://localhost:3000. The development server runs the same API handlers as Vercel. Card-data coaching works without an AI key. For local AI analysis, set `AI_GATEWAY_API_KEY` in the server environment, or link the Vercel project and obtain its OIDC environment. Never put credentials in client code or commit them.

## Analysis flow

1. Import and validate a list, separating the command zone from the library.
2. Resolve Scryfall printings, names, mana costs, Oracle text and faces on the server. Missing cards remain explicit and prevent AI analysis.
3. Compute counts, curve, identities, land options and initial roles.
4. Request a structured profile through Vercel AI Gateway, using `MTGLINE_MODEL` (default `openai/gpt-5.4`). Server-side validation rejects unknown card references, invalid roles and malformed routes. AI cannot rewrite card facts or land eligibility.
5. Cache metadata for one day and successful profiles for seven days using Vercel Runtime Cache, with a bounded memory fallback and in-process request coalescing. Cache identities include deck contents, commanders, format, profile version, model and resolved Oracle text.
6. Run hand coaching locally against the imported metadata and profile. Drawing and mulliganing make no AI requests.

On Vercel, authentication uses a server-side AI Gateway key when configured, otherwise the deployment's OIDC token. AI Gateway must be enabled and have available credits. If unavailable, the app explicitly shows card-data coaching and a retry action. It never labels fallback analysis as AI. Per-instance throttling is a modest abuse guard, not a distributed spending limit; production spending limits belong in AI Gateway.

## Accuracy boundaries

This is a coaching tool, not a complete Magic rules engine. The search respects printed colored/generic/hybrid mana, required colorless, ordinary tap mana, summoning sickness, common tapped-land conditions and fetches with actual remaining land targets. Its turn plan uses only known cards and spends mana across plays. It does not assume future draws, legal opponent targets, or successful resolution.

Alternative costs, snow payments, conditional mana, land-search spells, extra land drops, cost reduction, Treasures, and complex activated abilities are not automatically credited. X spells use their minimum cost. Modal spell/land choices cannot be used twice in one simulated line. Other multi-face cards currently use the front spell face. These constraints are shown with the analysis.

AI routes are candidates with explicit prerequisites and confidence. Reference validation establishes deck membership, not combo legality or guaranteed lethal. Scores are heuristic estimates, not win probabilities. Role counts overlap. Partial lists are allowed with a visible size warning for Commander.

## Verification

`tests/deck-analysis.test.js` covers quantities/partners, commander separation, no inherited commander, card-name validation, printing fallback, modal versus transforming lands, colored and colorless costs, hybrids, tapped lands, fetch targets, summoning sickness, same-turn ramp, spending mana once, and exact without-replacement draw odds.

## Deployment

Production is deployed from the `main` branch to the Vercel project `mtgline`.

Production URL: https://mtgline.vercel.app
