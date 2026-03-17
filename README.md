# Audio & Hearing Survey

This repo now contains two apps:

- production survey at the repo root: a simplified Vite app for the real anonymous survey
- testing survey in `testing-nl/`: a separate Next.js app with a natural-language conversational shell powered by Gemini Flash on the server

## Production survey

The production app focuses on:

- age and gender
- Spotify genres, artists, tracks, and plan via PKCE
- daily listening estimate, optionally improved by Spotify history export JSON
- softer daily-noise prompts
- a simplified frequency slider test
- three short auditory ambiguity checks

Audio clips are bundled locally in `public/audio/` and were sourced from Indiana University's auditory ambiguity demo:

- https://pc.cogs.indiana.edu/auditoryambiguity/

## Firestore-driven section toggles

The production survey reads `surveyConfig/production` from Firestore to decide which sections to show. If the document is missing, the app falls back to the hardcoded defaults in [src/surveyConfig.ts](/Users/parakrammohan/Downloads/journal/src/surveyConfig.ts).

Suggested document contents:

```json
{
  "showSpotify": true,
  "showNoise": true,
  "showFrequency": true,
  "showPerception": true
}
```

A copy is included in [survey-config.production.json](/Users/parakrammohan/Downloads/journal/survey-config.production.json).

## Root app setup

1. Install dependencies:

```bash
npm install
```

2. Ensure `.env` contains your Firebase and Spotify settings.

3. Start the production survey:

```bash
npm run dev
```

4. Build it:

```bash
npm run build
```

## Firebase

The included rules do two things:

- allow anonymous create-only writes to `surveyResponses`
- allow public reads of `surveyConfig/*`

Deploy them with:

```bash
firebase deploy --only firestore:rules
```

## Vercel and Firebase Hosting

The production survey remains a static Vite build:

- build command: `npm run build`
- output directory: `dist`

For Spotify local development, the root app currently uses:

- `http://127.0.0.1:5173/spotify/callback`

For deployed production, set `VITE_SPOTIFY_REDIRECT_URI` to your HTTPS callback URL.

## Testing app

The experimental natural-language version lives in [testing-nl](/Users/parakrammohan/Downloads/journal/testing-nl).

- framework: Next.js
- Gemini usage: server-side in `app/api/chat/route.ts`
- local env template: `testing-nl/.env.example`
- local Spotify redirect example: `http://127.0.0.1:3000`

The Gemini key must stay server-side. Do not move it into a `NEXT_PUBLIC_` variable.
