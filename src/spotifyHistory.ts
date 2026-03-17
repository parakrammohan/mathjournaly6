export type SpotifyHistorySummary = {
  fileCount: number;
  recordCount: number;
  totalHours: number;
  averageHoursPerWeek: number;
  averageHoursPerDay: number;
  spanDays: number;
  topArtists: string[];
};

type SpotifyHistoryRecord = {
  msPlayed?: number;
  ts?: string;
  endTime?: string;
  artistName?: string;
  master_metadata_album_artist_name?: string;
};

const parseTimestamp = (record: SpotifyHistoryRecord) => {
  const value = record.ts ?? record.endTime;
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parseSpotifyHistoryFiles = async (
  files: FileList | null,
): Promise<SpotifyHistorySummary> => {
  if (!files || files.length === 0) {
    throw new Error("No Spotify history files selected.");
  }

  const artistCounts = new Map<string, number>();
  let recordCount = 0;
  let totalMs = 0;
  let earliestTimestamp: number | null = null;
  let latestTimestamp: number | null = null;

  for (const file of Array.from(files)) {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      continue;
    }

    for (const item of parsed) {
      const record = item as SpotifyHistoryRecord;

      if (typeof record.msPlayed !== "number") {
        continue;
      }

      recordCount += 1;
      totalMs += record.msPlayed;

      const timestamp = parseTimestamp(record);
      if (timestamp !== null) {
        earliestTimestamp =
          earliestTimestamp === null ? timestamp : Math.min(earliestTimestamp, timestamp);
        latestTimestamp =
          latestTimestamp === null ? timestamp : Math.max(latestTimestamp, timestamp);
      }

      const artist =
        record.master_metadata_album_artist_name ?? record.artistName ?? "Unknown artist";
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }
  }

  if (recordCount === 0) {
    throw new Error("No playable Spotify history records were found in the selected files.");
  }

  const totalHours = Number((totalMs / 3_600_000).toFixed(1));
  const spanDaysRaw =
    earliestTimestamp !== null && latestTimestamp !== null
      ? (latestTimestamp - earliestTimestamp) / 86_400_000
      : 0;
  const spanDays = Number(Math.max(1, spanDaysRaw).toFixed(1));
  const averageHoursPerWeek = Number(((totalHours * 7) / spanDays).toFixed(1));
  const averageHoursPerDay = Number((totalHours / spanDays).toFixed(1));
  const topArtists = [...artistCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([artist]) => artist);

  return {
    fileCount: files.length,
    recordCount,
    totalHours,
    averageHoursPerWeek,
    averageHoursPerDay,
    spanDays,
    topArtists,
  };
};
