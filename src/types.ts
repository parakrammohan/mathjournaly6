export type SurveyPayload = {
  createdAt: string;
  age: number;
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
