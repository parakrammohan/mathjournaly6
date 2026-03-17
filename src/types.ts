export type SurveyPayload = {
  createdAt: string;
  ageRange: string;
  gender: string;
  listeningDevice: {
    deviceClass: string;
    model: string;
  };
  listeningHoursPerDay: number;
  volumeLevel: number;
  phoneModel: string;
  tinnitus: string;
  maxFrequency: number;
  yannyLaurel: string;
  greenNeedleBrainstorm: string;
};
