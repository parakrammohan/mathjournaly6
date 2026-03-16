import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import {
  exchangeSpotifyCode,
  fetchSpotifyProfile,
  getSpotifyAuthUrl,
} from "./spotify";
import type { FrequencyCheck, SurveyPayload } from "./types";

type FormState = {
  ageRange: string;
  region: string;
  gender: string;
  spotifyConnected: boolean;
  spotifyPlan: string;
  topGenres: string[];
  topArtists: string[];
  listeningHours: number;
  workNoiseHours: number;
  commuteNoiseHours: number;
  leisureNoiseHours: number;
  headphoneVolume: number;
  highVolumeSessions: number;
  hearingProtectionUsage: number;
  recentRingingEpisodes: number;
  recoveryHours: number;
  qualityToday: number;
  speechInNoiseDifficulty: number;
  leftEarDifference: number;
  tinnitusSeverity: number;
  soundSensitivity: number;
  headphoneType: string;
  environmentNoise: number;
  notes: string;
};

const initialState: FormState = {
  ageRange: "",
  region: "",
  gender: "",
  spotifyConnected: false,
  spotifyPlan: "",
  topGenres: [],
  topArtists: [],
  listeningHours: 12,
  workNoiseHours: 0,
  commuteNoiseHours: 0,
  leisureNoiseHours: 4,
  headphoneVolume: 60,
  highVolumeSessions: 1,
  hearingProtectionUsage: 50,
  recentRingingEpisodes: 0,
  recoveryHours: 4,
  qualityToday: 75,
  speechInNoiseDifficulty: 35,
  leftEarDifference: 10,
  tinnitusSeverity: 10,
  soundSensitivity: 20,
  headphoneType: "over-ear",
  environmentNoise: 25,
  notes: "",
};

const frequencySteps = [
  8000, 10000, 12000, 14000, 15000, 16000, 17000, 18000, 19000, 20000,
];

const sliderClass =
  "w-full accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

function App() {
  const [form, setForm] = useState<FormState>(initialState);
  const [frequencyCheck, setFrequencyCheck] = useState<FrequencyCheck>({
    highestHeardHz: null,
    headphoneType: initialState.headphoneType,
    environmentNoise: initialState.environmentNoise,
  });
  const [currentTone, setCurrentTone] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [spotifyStatus, setSpotifyStatus] = useState("Optional: import Spotify genres.");
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      return;
    }

    void (async () => {
      try {
        setSpotifyStatus("Importing Spotify profile...");
        const token = await exchangeSpotifyCode(code);
        const spotifyData = await fetchSpotifyProfile(token.access_token);
        setForm((current) => ({
          ...current,
          spotifyConnected: true,
          spotifyPlan: spotifyData.spotifyPlan,
          topGenres: spotifyData.topGenres,
          topArtists: spotifyData.topArtists,
        }));
        setSpotifyStatus("Spotify genres imported.");
        window.history.replaceState({}, "", window.location.pathname);
      } catch {
        setSpotifyStatus("Spotify import failed. You can still complete the survey.");
      }
    })();
  }, []);

  useEffect(
    () => () => {
      oscillatorRef.current?.stop();
      audioContextRef.current?.close().catch(() => undefined);
    },
    [],
  );

  const estimatedWeeklyNoiseDose = useMemo(() => {
    const exposureHours =
      form.workNoiseHours + form.commuteNoiseHours + form.leisureNoiseHours;
    const volumeWeight = form.headphoneVolume / 100;
    const protectionOffset = 1 - form.hearingProtectionUsage / 100;
    return Number((exposureHours * (1 + volumeWeight) * (1 + protectionOffset)).toFixed(1));
  }, [form]);

  const hearingStrainIndex = useMemo(() => {
    const difficulty =
      form.speechInNoiseDifficulty * 0.3 +
      form.tinnitusSeverity * 0.25 +
      form.soundSensitivity * 0.2 +
      (100 - form.qualityToday) * 0.25;
    return Math.round(Math.min(100, difficulty));
  }, [form]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "headphoneType" || key === "environmentNoise") {
      setFrequencyCheck((current) => ({
        ...current,
        [key]: value,
      }));
    }
  };

  const startTone = async (frequency: number) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      oscillatorRef.current?.stop();

      const oscillator = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(audioContextRef.current.destination);
      oscillator.start();

      oscillatorRef.current = oscillator;
      gainRef.current = gain;
      setCurrentTone(frequency);
      setIsPlaying(true);
    } catch {
      setError("Your browser blocked audio playback. Try again after interacting with the page.");
    }
  };

  const stopTone = () => {
    oscillatorRef.current?.stop();
    oscillatorRef.current = null;
    setIsPlaying(false);
  };

  const markAudible = (frequency: number) => {
    setFrequencyCheck((current) => ({
      ...current,
      highestHeardHz:
        current.highestHeardHz === null
          ? frequency
          : Math.max(current.highestHeardHz, frequency),
    }));
    stopTone();
  };

  const connectSpotify = async () => {
    try {
      const authUrl = await getSpotifyAuthUrl();
      window.location.assign(authUrl);
    } catch {
      setSpotifyStatus("Spotify is not configured yet. Add the env vars and retry.");
    }
  };

  const submitSurvey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const payload: SurveyPayload = {
      createdAt: new Date().toISOString(),
      demographics: {
        ageRange: form.ageRange,
        region: form.region,
        gender: form.gender,
      },
      spotify: {
        connected: form.spotifyConnected,
        topGenres: form.topGenres,
        topArtists: form.topArtists,
        spotifyPlan: form.spotifyPlan,
        importedAt: form.spotifyConnected ? new Date().toISOString() : null,
        selfReportedListeningHoursPerWeek: form.listeningHours,
      },
      exposure: {
        workNoiseHoursPerWeek: form.workNoiseHours,
        commuteNoiseHoursPerWeek: form.commuteNoiseHours,
        leisureNoiseHoursPerWeek: form.leisureNoiseHours,
        averageHeadphoneVolume: form.headphoneVolume,
        weeklyHighVolumeSessions: form.highVolumeSessions,
        hearingProtectionUsage: form.hearingProtectionUsage,
        recentRingingEpisodes: form.recentRingingEpisodes,
        perceivedRecoveryHours: form.recoveryHours,
      },
      hearing: {
        qualityToday: form.qualityToday,
        speechInNoiseDifficulty: form.speechInNoiseDifficulty,
        leftEarDifference: form.leftEarDifference,
        tinnitusSeverity: form.tinnitusSeverity,
        soundSensitivity: form.soundSensitivity,
        maxFrequencyCheck: frequencyCheck,
      },
      notes: form.notes.trim(),
      computed: {
        estimatedWeeklyNoiseDose,
        hearingStrainIndex,
      },
    };

    try {
      await addDoc(collection(db, "surveyResponses"), payload);
      setSubmitted(true);
      setForm(initialState);
      setFrequencyCheck({
        highestHeardHz: null,
        headphoneType: initialState.headphoneType,
        environmentNoise: initialState.environmentNoise,
      });
      stopTone();
    } catch {
      setError("Submission failed. Check your Firebase config and Firestore rules.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.18),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#ffffff_100%)] px-4 py-10 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-4xl rounded-[2rem] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur md:p-8"
      >
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            Anonymous survey
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            Audio habits and hearing quality
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            This form combines listening patterns, noise exposure, and a lightweight
            high-frequency hearing check. Spotify import is optional and only used for
            genres and profile context. Listening hours remain self-reported because
            Spotify does not expose them through its API.
          </p>
        </header>

        {submitted ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-2xl font-semibold text-emerald-950">Response saved</h2>
            <p className="mt-2 text-sm text-emerald-800">
              The submission was stored anonymously. Reload the page to enter another response.
            </p>
          </section>
        ) : (
          <form className="space-y-8" onSubmit={submitSurvey}>
            <Section
              title="Profile"
              description="Only broad ranges. No name, email, or direct identifier."
            >
              <div className="grid gap-4 md:grid-cols-3">
                <Select
                  label="Age range"
                  value={form.ageRange}
                  onChange={(value) => updateField("ageRange", value)}
                  options={["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]}
                />
                <Input
                  label="Region or city"
                  value={form.region}
                  onChange={(value) => updateField("region", value)}
                  placeholder="Singapore"
                />
                <Select
                  label="Gender"
                  value={form.gender}
                  onChange={(value) => updateField("gender", value)}
                  options={["Prefer not to say", "Female", "Male", "Non-binary", "Other"]}
                />
              </div>
            </Section>

            <Section
              title="Spotify"
              description="Optional import for top artists and genres. The survey still works without Spotify."
            >
              <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{spotifyStatus}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Imported genres: {form.topGenres.length ? form.topGenres.join(", ") : "none"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={connectSpotify}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Connect Spotify
                </button>
              </div>
              <RangeField
                label="Self-reported listening hours per week"
                value={form.listeningHours}
                min={0}
                max={80}
                step={1}
                suffix="hrs"
                onChange={(value) => updateField("listeningHours", value)}
              />
            </Section>

            <Section
              title="Noise exposure"
              description="These are designed to estimate cumulative weekly strain."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Work or school noise exposure"
                  value={form.workNoiseHours}
                  min={0}
                  max={60}
                  step={1}
                  suffix="hrs/week"
                  onChange={(value) => updateField("workNoiseHours", value)}
                />
                <RangeField
                  label="Commute noise exposure"
                  value={form.commuteNoiseHours}
                  min={0}
                  max={30}
                  step={1}
                  suffix="hrs/week"
                  onChange={(value) => updateField("commuteNoiseHours", value)}
                />
                <RangeField
                  label="Concerts, clubs, gaming, tools, or leisure noise"
                  value={form.leisureNoiseHours}
                  min={0}
                  max={30}
                  step={1}
                  suffix="hrs/week"
                  onChange={(value) => updateField("leisureNoiseHours", value)}
                />
                <RangeField
                  label="Typical headphone volume"
                  value={form.headphoneVolume}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(value) => updateField("headphoneVolume", value)}
                />
                <RangeField
                  label="High-volume sessions"
                  value={form.highVolumeSessions}
                  min={0}
                  max={21}
                  step={1}
                  suffix="/week"
                  onChange={(value) => updateField("highVolumeSessions", value)}
                />
                <RangeField
                  label="Hearing protection usage when noise is high"
                  value={form.hearingProtectionUsage}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  onChange={(value) => updateField("hearingProtectionUsage", value)}
                />
                <RangeField
                  label="Ringing episodes after loud sound"
                  value={form.recentRingingEpisodes}
                  min={0}
                  max={14}
                  step={1}
                  suffix="/2 weeks"
                  onChange={(value) => updateField("recentRingingEpisodes", value)}
                />
                <RangeField
                  label="Hours until hearing feels normal after loud sound"
                  value={form.recoveryHours}
                  min={0}
                  max={72}
                  step={1}
                  suffix="hrs"
                  onChange={(value) => updateField("recoveryHours", value)}
                />
              </div>

              <MetricCard
                title="Estimated weekly noise dose"
                value={`${estimatedWeeklyNoiseDose}`}
                description="A simple internal score using hours, volume, and protection."
              />
            </Section>

            <Section
              title="Hearing quality"
              description="Daily-life impact measures focused on clarity, comfort, and asymmetry."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="How good does your hearing feel today?"
                  value={form.qualityToday}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("qualityToday", value)}
                />
                <RangeField
                  label="Difficulty understanding speech in noise"
                  value={form.speechInNoiseDifficulty}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("speechInNoiseDifficulty", value)}
                />
                <RangeField
                  label="Perceived difference between left and right ear"
                  value={form.leftEarDifference}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("leftEarDifference", value)}
                />
                <RangeField
                  label="Tinnitus or ringing severity"
                  value={form.tinnitusSeverity}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("tinnitusSeverity", value)}
                />
                <RangeField
                  label="Sensitivity to everyday sound"
                  value={form.soundSensitivity}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("soundSensitivity", value)}
                />
              </div>

              <MetricCard
                title="Hearing strain index"
                value={`${hearingStrainIndex}/100`}
                description="Higher values suggest more day-to-day hearing burden."
              />
            </Section>

            <Section
              title="High-frequency check"
              description="Use headphones in a quiet room. This is only a rough browser-based self-check, not a medical test."
            >
              <div className="grid gap-4 md:grid-cols-3">
                <Select
                  label="Headphone type"
                  value={form.headphoneType}
                  onChange={(value) => updateField("headphoneType", value)}
                  options={["over-ear", "on-ear", "in-ear", "speakers"]}
                />
                <RangeField
                  label="Background room noise"
                  value={form.environmentNoise}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => updateField("environmentNoise", value)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {frequencySteps.map((frequency) => (
                  <div
                    key={frequency}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {frequency.toLocaleString()} Hz
                        </p>
                        <p className="text-xs text-slate-600">
                          Try this tone and mark it only if clearly audible.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void startTone(frequency)}
                          className="rounded-full border border-slate-300 px-3 py-2 text-sm"
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          onClick={() => markAudible(frequency)}
                          disabled={currentTone !== frequency || !isPlaying}
                          className="rounded-full bg-blue-700 px-3 py-2 text-sm text-white disabled:bg-slate-300"
                        >
                          Heard it
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                <span>
                  Highest audible frequency:{" "}
                  <strong>
                    {frequencyCheck.highestHeardHz
                      ? `${frequencyCheck.highestHeardHz.toLocaleString()} Hz`
                      : "not recorded yet"}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={stopTone}
                  className="rounded-full border border-blue-200 px-3 py-2"
                >
                  Stop tone
                </button>
              </div>
            </Section>

            <Section
              title="Context"
              description="Optional notes if there was anything unusual about the test or your hearing this week."
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={4}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                  placeholder="Recent cold, workplace shift, ears felt blocked, etc."
                />
              </label>
            </Section>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl text-sm text-slate-600">
                No login is required. Firestore should be configured as create-only for this
                collection, with reads disabled.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting ? "Submitting..." : "Submit anonymously"}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
        required
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
        required
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="text-sm text-slate-600">
          {value} {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className={sliderClass}
      />
    </label>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export default App;
