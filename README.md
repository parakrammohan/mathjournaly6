# Audio & Hearing Survey

A lightweight React survey for collecting anonymous hearing-related data:

- demographic bands
- optional Spotify top genres and artists via Spotify PKCE
- Spotify export import for listening hours
- structured weekly loud-noise exposure
- hearing quality and day-to-day burden
- browser-based high-frequency audibility check

## Why listening hours are self-reported

Spotify's Web API does not expose total listening hours or age. This app therefore uses two Spotify paths:

- Web API import for top genres and artists
- Spotify streaming-history JSON import for listening-time totals

If a participant does not have their export files, the survey falls back to self-reported listening hours.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill it in:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

## Firebase setup

1. Create a Firebase project and enable Firestore.
2. Add your web app config to `.env`.
3. Deploy rules:

```bash
firebase deploy --only firestore:rules
```

4. Deploy hosting:

```bash
npm run build
firebase deploy --only hosting
```

The included rules make `surveyResponses` write-only from the client and block reads, updates, and deletes.

## Vercel setup

1. Import the repo into Vercel.
2. Add the same `VITE_...` environment variables in the Vercel project settings.
3. Set `VITE_SPOTIFY_REDIRECT_URI` to your deployed callback URL, for example `https://your-app.vercel.app/spotify/callback`.
4. Build command: `npm run build`
5. Output directory: `dist`

## Spotify setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add allowed redirect URIs for local dev and any deployed domains. For local development, register `http://localhost:5173/spotify/callback`.
3. Set `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI`.

## Importing listening hours

For real listening-time data, ask participants to upload their Spotify streaming-history export JSON files in the survey. The app parses files such as `StreamingHistory_music_*.json` and `endsong_*.json` and computes:

- total listening hours in the uploaded history
- average hours per week across the uploaded time span
- top artists from the uploaded history

## Notes

- The high-frequency check depends on browser audio support, headphones, and device output limits.
- This is a screening-oriented survey, not a clinical hearing evaluation.
