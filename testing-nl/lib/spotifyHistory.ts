export type SpotifyHistorySummary = {
  totalHours: number;
  averageHoursPerDay: number;
  spanDays: number;
};

type HistoryRecord = {
  msPlayed?: number;
  ts?: string;
  endTime?: string;
};

export const parseSpotifyHistoryFiles = async (
  files: FileList | null,
): Promise<SpotifyHistorySummary> => {
  if (!files || files.length === 0) {
    throw new Error("No Spotify history files selected.");
  }

  let totalMs = 0;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const file of Array.from(files)) {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      continue;
    }

    for (const entry of parsed) {
      const record = entry as HistoryRecord;
      if (typeof record.msPlayed !== "number") {
        continue;
      }

      totalMs += record.msPlayed;
      const rawTimestamp = record.ts ?? record.endTime;
      if (!rawTimestamp) {
        continue;
      }

      const timestamp = Date.parse(rawTimestamp);
      if (Number.isNaN(timestamp)) {
        continue;
      }

      earliest = earliest === null ? timestamp : Math.min(earliest, timestamp);
      latest = latest === null ? timestamp : Math.max(latest, timestamp);
    }
  }

  const totalHours = Number((totalMs / 3_600_000).toFixed(1));
  const spanDays =
    earliest !== null && latest !== null
      ? Number(Math.max(1, (latest - earliest) / 86_400_000).toFixed(1))
      : 1;

  return {
    totalHours,
    averageHoursPerDay: Number((totalHours / spanDays).toFixed(1)),
    spanDays,
  };
};
