export type FrequencyCheck = {
  highestHeardHz: number | null;
  headphoneType: string;
  environmentNoise: number;
};

export type SurveyPayload = {
  createdAt: string;
  demographics: {
    ageRange: string;
    region: string;
    gender: string;
  };
  spotify: {
    connected: boolean;
    topGenres: string[];
    topArtists: string[];
    spotifyPlan: string;
    importedAt: string | null;
    selfReportedListeningHoursPerWeek: number;
  };
  exposure: {
    workNoiseHoursPerWeek: number;
    commuteNoiseHoursPerWeek: number;
    leisureNoiseHoursPerWeek: number;
    averageHeadphoneVolume: number;
    weeklyHighVolumeSessions: number;
    hearingProtectionUsage: number;
    recentRingingEpisodes: number;
    perceivedRecoveryHours: number;
  };
  hearing: {
    qualityToday: number;
    speechInNoiseDifficulty: number;
    leftEarDifference: number;
    tinnitusSeverity: number;
    soundSensitivity: number;
    maxFrequencyCheck: FrequencyCheck;
  };
  notes: string;
  computed: {
    estimatedWeeklyNoiseDose: number;
    hearingStrainIndex: number;
  };
};
