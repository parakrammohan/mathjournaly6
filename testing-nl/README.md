# Testing NL Survey

This is the experimental Vercel-friendly subproject for the conversational version of the survey.

## Local run

```bash
npm install
npm run dev
```

## Required environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`
- `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI`
- `GEMINI_API_KEY`

## Vercel

Deploy `testing-nl/` as its own Vercel project.

- framework preset: Next.js
- root directory: `testing-nl`
- set all env vars in the Vercel project settings

## Notes

- Gemini is only called from `app/api/chat/route.ts`
- Firestore writes still go to `surveyResponses`
- the testing app bundles the same auditory ambiguity clips as the production app
