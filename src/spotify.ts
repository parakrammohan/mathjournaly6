const spotifyScopes = [
  "user-top-read",
  "user-read-private",
  "user-read-email",
].join(" ");

const randomString = (length: number) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => chars[value % chars.length]).join("");
};

const toBase64Url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const createCodeChallenge = async (verifier: string) => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(digest);
};

export const getSpotifyAuthUrl = async () => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Spotify environment variables are missing.");
  }

  const verifier = randomString(64);
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem("spotify_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: spotifyScopes,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
};

export const exchangeSpotifyCode = async (code: string) => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  const verifier = sessionStorage.getItem("spotify_code_verifier");

  if (!clientId || !redirectUri || !verifier) {
    throw new Error("Spotify PKCE state is incomplete.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new Error("Spotify token exchange failed.");
  }

  return response.json() as Promise<{ access_token: string }>;
};

export const fetchSpotifyProfile = async (accessToken: string) => {
  const [profileResponse, artistsResponse] = await Promise.all([
    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch("https://api.spotify.com/v1/me/top/artists?limit=8&time_range=medium_term", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!profileResponse.ok || !artistsResponse.ok) {
    throw new Error("Spotify profile fetch failed.");
  }

  const profile = (await profileResponse.json()) as { product?: string };
  const topArtists = (await artistsResponse.json()) as {
    items: Array<{ name: string; genres: string[] }>;
  };

  const artists = topArtists.items.map((artist) => artist.name);
  const genres = Array.from(
    new Set(topArtists.items.flatMap((artist) => artist.genres)),
  ).slice(0, 10);

  return {
    spotifyPlan: profile.product ?? "unknown",
    topArtists: artists,
    topGenres: genres,
  };
};
