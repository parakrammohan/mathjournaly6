"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import type { FirestoreError } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  exchangeSpotifyCode,
  fetchSpotifyProfile,
  getSpotifyAuthUrl,
} from "../lib/spotify";
import { parseSpotifyHistoryFiles } from "../lib/spotifyHistory";

type Message = {
  role: "assistant" | "user";
  text: string;
};

type Draft = {
  ageRange: string;
  gender: string;
  listeningDeviceClass: string;
  listeningDeviceModel: string;
  phoneModel: string;
  tinnitus: string;
  dailyListeningHours: number;
  noiseLoad: number;
  protectionHabit: number;
  spotifyConnected: boolean;
  spotifyPlan: string;
  topGenres: string[];
  topArtists: string[];
  topTracks: string[];
  importedTotalHours: number | null;
  importedSpanDays: number | null;
  savedLimitHz: number | null;
  perception: Record<string, string>;
};

const ageOptions = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const genderOptions = ["Prefer not to say", "Female", "Male", "Non-binary", "Other"];
const perceptionTests = [
  {
    id: "laurel_yanny",
    label: "Laurel / Yanny",
    answers: ["Laurel", "Yanny", "Both", "Neither"],
    audio: ["/audio/laurel-yanny.mp3"],
  },
  {
    id: "brainstorm_green_needle",
    label: "Brainstorm / Green Needle",
    answers: ["Brainstorm", "Green Needle", "Both", "Neither"],
    audio: ["/audio/brainstorm-green-needle.mp3"],
  },
  {
    id: "reset_then_brainstorm",
    label: "Reset then replay",
    answers: ["Brainstorm", "Green Needle", "Changed mid-way", "Still unsure"],
    audio: ["/audio/palate-cleanser.mp3", "/audio/brainstorm-green-needle.mp3"],
  },
];

const initialDraft: Draft = {
  ageRange: "",
  gender: "",
  listeningDeviceClass: "",
  listeningDeviceModel: "",
  phoneModel: "",
  tinnitus: "",
  dailyListeningHours: 2.5,
  noiseLoad: 35,
  protectionHabit: 40,
  spotifyConnected: false,
  spotifyPlan: "",
  topGenres: [],
  topArtists: [],
  topTracks: [],
  importedTotalHours: null,
  importedSpanDays: null,
  savedLimitHz: null,
  perception: {},
};

const steps = [
  "intro",
  "age",
  "setup",
  "listening",
  "noise",
  "protection",
  "hearing",
  "complete",
] as const;
type Step = (typeof steps)[number];

function summarizeDraft(draft: Draft) {
  return [
    draft.ageRange && `age ${draft.ageRange}`,
    draft.gender && `gender ${draft.gender}`,
    draft.listeningDeviceClass &&
      `device ${draft.listeningDeviceClass}${
        draft.listeningDeviceModel ? ` ${draft.listeningDeviceModel}` : ""
      }`,
    draft.phoneModel && `phone ${draft.phoneModel}`,
    draft.tinnitus && `tinnitus ${draft.tinnitus}`,
    `music ${draft.dailyListeningHours}h/day`,
    `noise ${draft.noiseLoad}/100`,
    `protection ${draft.protectionHabit}%`,
    draft.savedLimitHz && `frequency ${draft.savedLimitHz}Hz`,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [frequency, setFrequency] = useState(14000);
  const [submitting, setSubmitting] = useState(false);
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState("Spotify is optional.");
  const [submitState, setSubmitState] = useState("");
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const currentStep = steps[stepIndex];

  const summary = useMemo(
    () => summarizeDraft(draft),
    [draft],
  );

  useEffect(() => {
    void requestMessage(steps[0], "");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      return;
    }

    void (async () => {
      try {
        const token = await exchangeSpotifyCode(code);
        const spotifyData = await fetchSpotifyProfile(token.access_token);
        setDraft((current) => ({
          ...current,
          spotifyConnected: true,
          spotifyPlan: spotifyData.spotifyPlan,
          topGenres: spotifyData.topGenres,
          topArtists: spotifyData.topArtists,
          topTracks: spotifyData.topTracks,
        }));
        setSpotifyStatus("Spotify connected.");
      } catch (spotifyError) {
        setSpotifyStatus(
          spotifyError instanceof Error ? spotifyError.message : "Spotify import failed.",
        );
        console.error("Spotify import error", spotifyError);
      } finally {
        window.history.replaceState({}, "", "/");
      }
    })();
  }, []);

  useEffect(
    () => () => {
      oscillatorRef.current?.stop();
      void audioContextRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.frequency.value = frequency;
    }
  }, [frequency]);

  const requestMessage = async (step: Step, nextSummary: string) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, summary: nextSummary }),
    });
    const data = (await response.json()) as { message: string };
    setMessages((current) => [...current, { role: "assistant", text: data.message }]);
  };

  const advance = async (userText: string, nextDraft: Draft = draft) => {
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    setMessages((current) => [...current, { role: "user", text: userText }]);
    setStepIndex(nextIndex);
    await requestMessage(steps[nextIndex], summarizeDraft(nextDraft));
  };

  const connectSpotify = async () => {
    try {
      const url = await getSpotifyAuthUrl();
      window.location.assign(url);
    } catch (spotifyError) {
      setSpotifyStatus(
        spotifyError instanceof Error ? spotifyError.message : "Spotify connect failed.",
      );
      console.error("Spotify connect error", spotifyError);
    }
  };

  const importHistory = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const summary = await parseSpotifyHistoryFiles(event.target.files);
      setDraft((current) => ({
        ...current,
        dailyListeningHours: summary.averageHoursPerDay,
        importedTotalHours: summary.totalHours,
        importedSpanDays: summary.spanDays,
      }));
      setSpotifyStatus(
        `Spotify history imported: ${summary.totalHours} hours over ${summary.spanDays} days.`,
      );
    } finally {
      event.target.value = "";
    }
  };

  const startTone = async () => {
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
  };

  const stopTone = () => {
    oscillatorRef.current?.stop();
    oscillatorRef.current = null;
  };

  const playSequence = async (id: string, sources: string[]) => {
    setPlayingClip(id);
    for (const src of sources) {
      const audio = new Audio(src);
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
    }
    setPlayingClip(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitState("");

    try {
      await addDoc(collection(db, "surveyResponses"), {
        createdAt: new Date().toISOString(),
        ageRange: draft.ageRange,
        gender: draft.gender,
        listeningDevice: {
          deviceClass: draft.listeningDeviceClass,
          model: draft.listeningDeviceModel.trim(),
        },
        phoneModel: draft.phoneModel.trim(),
        tinnitus: draft.tinnitus,
        spotify: {
          connected: draft.spotifyConnected,
          spotifyPlan: draft.spotifyPlan,
          topGenres: draft.topGenres,
          topArtists: draft.topArtists,
          topTracks: draft.topTracks,
          dailyListeningHours: draft.dailyListeningHours,
          listeningSource: draft.importedTotalHours ? "spotify_export" : "self_report",
          importedTotalHours: draft.importedTotalHours,
          importedSpanDays: draft.importedSpanDays,
        },
        noise: {
          dailyNoiseLoad: draft.noiseLoad,
          protectionHabit: draft.protectionHabit,
        },
        hearing: {
          frequencyCheck: {
            savedLimitHz: draft.savedLimitHz,
          },
          perception: Object.entries(draft.perception).map(([id, answer]) => ({
            id,
            answer,
          })),
        },
      });
      setSubmitState("Anonymous response submitted.");
    } catch (submitError) {
      const firestoreError = submitError as FirestoreError;
      setSubmitState(
        firestoreError.code === "permission-denied"
          ? "Firestore rejected the write with permission-denied. Deploy the Firestore rules first."
          : `Submission failed${firestoreError.code ? `: ${firestoreError.code}` : ""}.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", padding: "32px 16px" }}>
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          background: "rgba(255,255,255,0.86)",
          border: "1px solid rgba(255,255,255,0.7)",
          borderRadius: 32,
          padding: 24,
          boxShadow: "0 28px 80px -42px rgba(15,23,42,0.35)",
          backdropFilter: "blur(16px)",
        }}
      >
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", color: "#059669", fontWeight: 700 }}>
            Testing Surface
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: 44, lineHeight: 1.04 }}>
            Natural-language survey
          </h1>
          <p style={{ margin: "12px 0 0", maxWidth: 700, color: "#57534e", lineHeight: 1.6 }}>
            This is the experimental conversational version for Vercel. Gemini writes the assistant prompts, while the actual survey state stays structured.
          </p>
        </header>

        <section
          style={{
            border: "1px solid #e7e5e4",
            borderRadius: 24,
            padding: 18,
            background: "#fafaf9",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <strong>Spotify tools</strong>
              <p style={{ margin: "6px 0 0", color: "#57534e" }}>{spotifyStatus}</p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => void connectSpotify()} style={primaryButton}>
                Connect Spotify
              </button>
              <label style={secondaryButtonLabel}>
                Import history
                <input type="file" accept=".json,application/json" multiple hidden onChange={(event) => void importHistory(event)} />
              </label>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "1.2fr 0.8fr",
          }}
        >
          <div
            style={{
              border: "1px solid #e7e5e4",
              borderRadius: 28,
              background: "#fff",
              padding: 18,
              minHeight: 560,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    alignSelf: message.role === "assistant" ? "flex-start" : "flex-end",
                    maxWidth: "85%",
                    background: message.role === "assistant" ? "#f5f5f4" : "#0f766e",
                    color: message.role === "assistant" ? "#1c1917" : "#fff",
                    borderRadius: 20,
                    padding: "12px 14px",
                    lineHeight: 1.5,
                  }}
                >
                  {message.text}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {currentStep === "intro" || currentStep === "age" ? (
              <Card title="Age">
                <ChipGroup
                  options={ageOptions}
                  value={draft.ageRange}
                  onSelect={(value) => {
                    const nextDraft = { ...draft, ageRange: value };
                    setDraft(nextDraft);
                    void advance(value, nextDraft);
                  }}
                />
              </Card>
            ) : null}

            {currentStep === "setup" ? (
              <Card title="About you and your setup">
                <FieldLabel>What is your gender?</FieldLabel>
                <ChipGroup
                  options={genderOptions}
                  value={draft.gender}
                  onSelect={(value) =>
                    setDraft((current) => ({ ...current, gender: value }))
                  }
                />

                <FieldLabel>What class of listening device are you using?</FieldLabel>
                <ChipGroup
                  options={[
                    "Earbuds",
                    "Over-ear headphones",
                    "On-ear / open-back",
                    "Speakers",
                    "Other",
                  ]}
                  value={draft.listeningDeviceClass}
                  onSelect={(value) =>
                    setDraft((current) => ({ ...current, listeningDeviceClass: value }))
                  }
                />

                {draft.listeningDeviceClass ? (
                  <>
                    <FieldLabel>Listening device model</FieldLabel>
                    <TextEntry
                      value={draft.listeningDeviceModel}
                      placeholder="AirPods Pro 2"
                      onChange={(value) =>
                        setDraft((current) => ({ ...current, listeningDeviceModel: value }))
                      }
                    />
                  </>
                ) : null}

                <FieldLabel>What phone model are you using?</FieldLabel>
                <TextEntry
                  value={draft.phoneModel}
                  placeholder="iPhone 15"
                  onChange={(value) => setDraft((current) => ({ ...current, phoneModel: value }))}
                />

                <FieldLabel>Do you have tinnitus?</FieldLabel>
                <ChipGroup
                  options={["Yes", "No"]}
                  value={draft.tinnitus}
                  onSelect={(value) =>
                    setDraft((current) => ({ ...current, tinnitus: value }))
                  }
                />

                <button
                  onClick={() => void advance("Setup recorded")}
                  style={primaryButton}
                  disabled={
                    !draft.gender ||
                    !draft.listeningDeviceClass ||
                    !draft.listeningDeviceModel.trim() ||
                    !draft.phoneModel.trim() ||
                    !draft.tinnitus
                  }
                >
                  Continue
                </button>
              </Card>
            ) : null}

            {currentStep === "listening" ? (
              <Card title="Listening per day">
                <RangeInput
                  value={draft.dailyListeningHours}
                  min={0}
                  max={12}
                  step={0.25}
                  suffix="hrs/day"
                  onChange={(value) => setDraft((current) => ({ ...current, dailyListeningHours: value }))}
                />
                <button onClick={() => void advance(`${draft.dailyListeningHours} hours per day`)} style={primaryButton}>
                  Continue
                </button>
              </Card>
            ) : null}

            {currentStep === "noise" ? (
              <Card title="How loud does your average day feel?">
                <RangeInput
                  value={draft.noiseLoad}
                  min={0}
                  max={100}
                  step={1}
                  suffix="/100"
                  onChange={(value) => setDraft((current) => ({ ...current, noiseLoad: value }))}
                />
                <button onClick={() => void advance(`${draft.noiseLoad} out of 100`)} style={primaryButton}>
                  Continue
                </button>
              </Card>
            ) : null}

            {currentStep === "protection" ? (
              <Card title="How often do you protect your ears?">
                <RangeInput
                  value={draft.protectionHabit}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(value) => setDraft((current) => ({ ...current, protectionHabit: value }))}
                />
                <button onClick={() => void advance(`${draft.protectionHabit}% of the time`)} style={primaryButton}>
                  Continue
                </button>
              </Card>
            ) : null}

            {currentStep === "hearing" ? (
              <>
                <Card title="Frequency test">
                  <p style={smallText}>
                    Place your phone 20 cm away from your ear in a quiet room. Use max
                    volume, then move the slider until you can stop hearing the sound.
                  </p>
                  <RangeInput
                    value={frequency}
                    min={8000}
                    max={20000}
                    step={100}
                    suffix="Hz"
                    onChange={setFrequency}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => void startTone()} style={primaryButton}>
                      Play tone
                    </button>
                    <button onClick={stopTone} style={secondaryButton}>
                      Stop
                    </button>
                    <button
                      onClick={() => setDraft((current) => ({ ...current, savedLimitHz: frequency }))}
                      style={secondaryButton}
                    >
                      Save limit
                    </button>
                  </div>
                  <p style={smallText}>
                    Saved limit: {draft.savedLimitHz ? `${draft.savedLimitHz} Hz` : "not saved yet"}
                  </p>
                </Card>

                <Card title="Perception checks">
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {perceptionTests.map((test) => (
                      <div key={test.id} style={{ border: "1px solid #e7e5e4", borderRadius: 18, padding: 12, background: "#fafaf9" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <strong>{test.label}</strong>
                          <button onClick={() => void playSequence(test.id, test.audio)} style={secondaryButton}>
                            {playingClip === test.id ? "Playing..." : "Play"}
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                          {test.answers.map((answer) => (
                            <button
                              key={answer}
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  perception: { ...current.perception, [test.id]: answer },
                                }))
                              }
                              style={
                                draft.perception[test.id] === answer
                                  ? { ...secondaryButton, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }
                                  : secondaryButton
                              }
                            >
                              {answer}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => void advance("Hearing checks completed")} style={primaryButton}>
                    Continue
                  </button>
                </Card>
              </>
            ) : null}

            {currentStep === "complete" ? (
              <Card title="Ready to submit">
                <p style={smallText}>This testing surface writes the same anonymous response format.</p>
                <button onClick={() => void submit()} style={primaryButton} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit response"}
                </button>
                {submitState ? <p style={smallText}>{submitState}</p> : null}
              </Card>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #e7e5e4",
        borderRadius: 24,
        background: "#fffdfb",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
      {children}
    </section>
  );
}

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return <p style={{ margin: "2px 0 -4px", color: "#44403c", fontWeight: 600 }}>{children}</p>;
}

function ChipGroup({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onSelect(option)}
          style={
            value === option
              ? { ...secondaryButton, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }
              : secondaryButton
          }
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function RangeInput({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: 10, color: "#57534e" }}>
        {value} {suffix}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", accentColor: "#0f766e" }}
      />
    </div>
  );
}

function TextEntry({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: "100%",
        borderRadius: 18,
        border: "1px solid #d6d3d1",
        background: "#fff",
        color: "#1c1917",
        padding: "12px 14px",
      }}
    />
  );
}

const primaryButton: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "#0f766e",
  color: "#fff",
  padding: "11px 16px",
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #d6d3d1",
  borderRadius: 999,
  background: "#fff",
  color: "#1c1917",
  padding: "11px 16px",
  cursor: "pointer",
};

const secondaryButtonLabel: React.CSSProperties = {
  ...secondaryButton,
  display: "inline-flex",
  alignItems: "center",
};

const smallText: React.CSSProperties = {
  margin: 0,
  color: "#57534e",
  lineHeight: 1.6,
};
