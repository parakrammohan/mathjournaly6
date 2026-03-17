import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { addDoc, collection, type FirestoreError } from "firebase/firestore";
import { db } from "./firebase";
import type { SurveyPayload } from "./types";

type Answers = {
  ageRange: string;
  listeningHoursPerDay: number;
  volumeLevel: number;
  headphoneType: string;
  yearsOfExposure: number;
  maxFrequency: number;
  yannyLaurel: string;
  greenNeedleBrainstorm: string;
};

type StoryStep =
  | "ageRange"
  | "listeningHoursPerDay"
  | "volumeLevel"
  | "headphoneType"
  | "yearsOfExposure"
  | "maxFrequency"
  | "yannyLaurel"
  | "greenNeedleBrainstorm";

const steps: Array<{ id: StoryStep; label: string }> = [
  { id: "ageRange", label: "Age" },
  { id: "listeningHoursPerDay", label: "Hours" },
  { id: "volumeLevel", label: "Volume" },
  { id: "headphoneType", label: "Headphones" },
  { id: "yearsOfExposure", label: "Years" },
  { id: "maxFrequency", label: "Frequency" },
  { id: "yannyLaurel", label: "Yanny / Laurel" },
  { id: "greenNeedleBrainstorm", label: "Green Needle / Brainstorm" },
];

const initialAnswers: Answers = {
  ageRange: "",
  listeningHoursPerDay: 2,
  volumeLevel: 65,
  headphoneType: "",
  yearsOfExposure: 3,
  maxFrequency: 15000,
  yannyLaurel: "",
  greenNeedleBrainstorm: "",
};

const choiceGroups = {
  ageRange: ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  headphoneType: ["Earbuds", "Over-ear Headphones", "On-ear/Open-back", "Speakers"],
  yannyLaurel: ["Yanny", "Laurel"],
  greenNeedleBrainstorm: ["Green Needle", "Brainstorm"],
} as const;

const clipSources = {
  yannyLaurel: "/audio/laurel-yanny.mp3",
  greenNeedleBrainstorm: "/audio/brainstorm-green-needle.mp3",
} as const;

function App() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioHint, setAudioHint] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [playingStoryAudio, setPlayingStoryAudio] = useState<StoryStep | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const clipRef = useRef<HTMLAudioElement | null>(null);

  const currentStep = steps[currentIndex]?.id ?? "greenNeedleBrainstorm";

  const summaryRows = useMemo(
    () => [
      { label: "Age range", value: answers.ageRange || "Not set" },
      { label: "Listening", value: `${answers.listeningHoursPerDay} hrs/day` },
      { label: "Volume", value: `${answers.volumeLevel}%` },
      { label: "Headphones", value: answers.headphoneType || "Not set" },
      { label: "Exposure", value: `${answers.yearsOfExposure} years` },
      { label: "Max frequency", value: `${answers.maxFrequency.toLocaleString()} Hz` },
      { label: "Yanny / Laurel", value: answers.yannyLaurel || "Not set" },
      {
        label: "Green Needle / Brainstorm",
        value: answers.greenNeedleBrainstorm || "Not set",
      },
    ],
    [answers],
  );

  useEffect(
    () => () => {
      stopAllAudio();
      void audioContextRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    setAudioHint("");
    void autoPlayForStep(currentStep);
    return () => {
      stopClip();
      if (currentStep !== "maxFrequency") {
        stopTone();
      }
    };
  }, [currentStep]);

  useEffect(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.frequency.value = answers.maxFrequency;
    }
  }, [answers.maxFrequency]);

  const stopTone = () => {
    oscillatorRef.current?.stop();
    oscillatorRef.current = null;
    gainRef.current = null;
  };

  const stopClip = () => {
    if (!clipRef.current) {
      return;
    }

    clipRef.current.pause();
    clipRef.current.currentTime = 0;
    clipRef.current = null;
    setPlayingStoryAudio(null);
  };

  const stopAllAudio = () => {
    stopTone();
    stopClip();
  };

  const playTone = async () => {
    stopClip();

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    stopTone();

    const oscillator = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = answers.maxFrequency;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(audioContextRef.current.destination);
    oscillator.start();

    oscillatorRef.current = oscillator;
    gainRef.current = gain;
  };

  const playClip = async (step: "yannyLaurel" | "greenNeedleBrainstorm") => {
    stopTone();
    stopClip();

    const clip = new Audio(clipSources[step]);
    clipRef.current = clip;
    setPlayingStoryAudio(step);
    await clip.play();
  };

  const autoPlayForStep = async (step: StoryStep) => {
    try {
      if (step === "maxFrequency") {
        await playTone();
        return;
      }

      if (step === "yannyLaurel" || step === "greenNeedleBrainstorm") {
        await playClip(step);
      }
    } catch {
      setAudioHint("Audio did not auto-play. Tap play once and it should work from there.");
    }
  };

  const goTo = (index: number) => {
    setCurrentIndex(index);
  };

  const goNext = () => {
    setCurrentIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  const goBack = () => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  };

  const setAnswer = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const chooseAndAdvance = async <K extends keyof Answers>(key: K, value: Answers[K]) => {
    const nextAnswers = { ...answers, [key]: value };
    setAnswers(nextAnswers);

    if (currentIndex >= steps.length - 1) {
      await submitSurvey(nextAnswers);
      return;
    }

    goNext();
  };

  const submitSurvey = async (finalAnswers: Answers = answers) => {
    setSubmitting(true);
    setError("");

    const payload: SurveyPayload = {
      createdAt: new Date().toISOString(),
      ageRange: finalAnswers.ageRange,
      listeningHoursPerDay: finalAnswers.listeningHoursPerDay,
      volumeLevel: finalAnswers.volumeLevel,
      headphoneType: finalAnswers.headphoneType,
      yearsOfExposure: finalAnswers.yearsOfExposure,
      maxFrequency: finalAnswers.maxFrequency,
      yannyLaurel: finalAnswers.yannyLaurel,
      greenNeedleBrainstorm: finalAnswers.greenNeedleBrainstorm,
    };

    try {
      await addDoc(collection(db, "surveyResponses"), payload);
      setSubmitted(true);
      stopAllAudio();
    } catch (submitError) {
      const firestoreError = submitError as FirestoreError;
      setError(
        firestoreError.code === "permission-denied"
          ? "Firestore rejected the write with permission-denied."
          : `Submission failed${firestoreError.code ? `: ${firestoreError.code}` : ""}.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100svh] bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-2xl items-center justify-center px-3 py-3 md:px-6 md:py-6">
        <section className="flex h-[calc(100svh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-[#111111] px-4 pb-4 pt-3 shadow-[0_30px_120px_-50px_rgba(0,0,0,0.9)] md:h-[min(860px,92svh)] md:rounded-[36px] md:p-6">
          <div className="mb-3 flex items-center gap-1.5">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => goTo(index)}
                className={`h-1.5 flex-1 rounded-full transition ${
                  index <= currentIndex ? "bg-white" : "bg-white/12"
                }`}
                aria-label={`Go to ${step.label}`}
              />
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/32">
                Can you hear me?
              </p>
            </div>
            <p className="text-xs text-white/35">
              {Math.min(currentIndex + 1, steps.length)} / {steps.length}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex h-full min-h-0 w-full flex-1 flex-col justify-center py-1"
              >
                <StoryCard
                  step={currentStep}
                  answers={answers}
                  audioHint={audioHint}
                  playingStoryAudio={playingStoryAudio}
                  onBack={goBack}
                  onNext={goNext}
                  onSetAnswer={setAnswer}
                  onChooseAndAdvance={chooseAndAdvance}
                  onReplayClip={(step) => void playClip(step)}
                  onSubmit={() => void submitSurvey()}
                  submitted={submitted}
                  submitting={submitting}
                  error={error}
                  summaryRows={summaryRows}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}

function StoryCard({
  step,
  answers,
  audioHint,
  playingStoryAudio,
  onBack,
  onNext,
  onSetAnswer,
  onChooseAndAdvance,
  onReplayClip,
  onSubmit,
  submitted,
  submitting,
  error,
  summaryRows,
}: {
  step: StoryStep;
  answers: Answers;
  audioHint: string;
  playingStoryAudio: StoryStep | null;
  onBack: () => void;
  onNext: () => void;
  onSetAnswer: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  onChooseAndAdvance: <K extends keyof Answers>(key: K, value: Answers[K]) => Promise<void>;
  onReplayClip: (step: "yannyLaurel" | "greenNeedleBrainstorm") => void;
  onSubmit: () => void;
  submitted: boolean;
  submitting: boolean;
  error: string;
  summaryRows: Array<{ label: string; value: string }>;
}) {
  if (submitted || submitting) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <h2 className="text-[clamp(2rem,8vw,3.6rem)] font-semibold tracking-tight text-white">
          {submitted ? "Done" : "Saving..."}
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-white/55 md:text-base md:leading-7">
          {submitted
            ? "Your response has been saved."
            : "Submitting your response now."}
        </p>
        {!submitted && !submitting ? (
          <div className="mt-6 space-y-2 text-sm text-white/42">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4">
                <span>{row.label}</span>
                <span className="text-white/78">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-5 text-sm text-rose-400">{error}</p> : null}
        {!submitted && !submitting ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton tone="ghost" onClick={onBack}>
              Back
            </ActionButton>
            <ActionButton tone="primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit survey"}
            </ActionButton>
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "ageRange") {
    return (
      <QuestionShell
        title="How old are you?"
        description="Pick the closest range."
      >
        <ChoiceGrid
          options={choiceGroups.ageRange}
          value={answers.ageRange}
          onSelect={(value) => onChooseAndAdvance("ageRange", value)}
        />
      </QuestionShell>
    );
  }

  if (step === "listeningHoursPerDay") {
    return (
      <QuestionShell
        title="How much music do you listen to in a day?"
        description="Use your usual average."
      >
        <SliderBlock
          value={answers.listeningHoursPerDay}
          min={0}
          max={12}
          step={0.25}
          suffix="hrs/day"
          onChange={(value) => onSetAnswer("listeningHoursPerDay", value)}
        />
        <FooterNav onBack={onBack} onNext={onNext} />
      </QuestionShell>
    );
  }

  if (step === "volumeLevel") {
    return (
      <QuestionShell
        title="How loud do you usually listen?"
        description="Think about your normal level."
      >
        <SliderBlock
          value={answers.volumeLevel}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) => onSetAnswer("volumeLevel", value)}
        />
        <FooterNav onBack={onBack} onNext={onNext} />
      </QuestionShell>
    );
  }

  if (step === "headphoneType") {
    return (
      <QuestionShell
        title="What do you usually listen with?"
        description="Pick the closest match."
      >
        <ChoiceGrid
          options={choiceGroups.headphoneType}
          value={answers.headphoneType}
          onSelect={(value) => onChooseAndAdvance("headphoneType", value)}
        />
      </QuestionShell>
    );
  }

  if (step === "yearsOfExposure") {
    return (
      <QuestionShell
        title="How long has that been your normal?"
        description="Count the years of roughly similar habits."
      >
        <SliderBlock
          value={answers.yearsOfExposure}
          min={0}
          max={40}
          step={1}
          suffix="years"
          onChange={(value) => onSetAnswer("yearsOfExposure", value)}
        />
        <FooterNav onBack={onBack} onNext={onNext} />
      </QuestionShell>
    );
  }

  if (step === "maxFrequency") {
    return (
      <QuestionShell
        title="Slide until you can't hear it"
        description="Put your device at max volume first, then stop where it disappears."
      >
        <div className="mb-5 inline-flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
          <VolumeIcon />
          <span>Max volume</span>
        </div>
        <SliderBlock
          value={answers.maxFrequency}
          min={8000}
          max={20000}
          step={100}
          suffix="Hz"
          onChange={(value) => onSetAnswer("maxFrequency", value)}
        />
        {audioHint ? <p className="mt-4 text-sm text-amber-300">{audioHint}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <ActionButton tone="ghost" onClick={onBack}>
            Back
          </ActionButton>
          <ActionButton tone="primary" onClick={onNext}>
            This is my limit
          </ActionButton>
        </div>
      </QuestionShell>
    );
  }

  if (step === "yannyLaurel") {
    return (
      <QuestionShell
        title="What do you hear?"
        description="The clip should start automatically."
      >
        {audioHint ? <p className="mb-4 text-sm text-amber-300">{audioHint}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {choiceGroups.yannyLaurel.map((option) => (
            <AnswerButton
              key={option}
              label={option}
              active={answers.yannyLaurel === option}
              onClick={() => onChooseAndAdvance("yannyLaurel", option)}
            />
          ))}
        </div>
        <div className="mt-6">
          <ActionButton tone="soft" onClick={() => onReplayClip("yannyLaurel")}>
            Replay audio
          </ActionButton>
        </div>
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      title="And this one?"
      description="The clip should start automatically."
    >
      {audioHint ? <p className="mb-4 text-sm text-amber-300">{audioHint}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {choiceGroups.greenNeedleBrainstorm.map((option) => (
          <AnswerButton
            key={option}
            label={option}
            active={answers.greenNeedleBrainstorm === option}
            onClick={() => onChooseAndAdvance("greenNeedleBrainstorm", option)}
          />
        ))}
      </div>
      <div className="mt-6">
        <ActionButton tone="soft" onClick={() => onReplayClip("greenNeedleBrainstorm")}>
          Replay audio
        </ActionButton>
      </div>
    </QuestionShell>
  );
}

function QuestionShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pr-1">
      <h2 className="max-w-2xl text-[clamp(2rem,8vw,3.6rem)] font-semibold tracking-tight text-white">
        {title}
      </h2>
      <p className="mt-3 max-w-lg text-[15px] leading-6 text-white/52 md:text-base md:leading-7">
        {description}
      </p>
      <div className="mt-6 md:mt-8">{children}</div>
    </div>
  );
}

function ChoiceGrid({
  options,
  value,
  onSelect,
}: {
  options: readonly string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => (
        <AnswerButton
          key={option}
          label={option}
          active={value === option}
          onClick={() => onSelect(option)}
        />
      ))}
    </div>
  );
}

function SliderBlock({
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
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="text-[clamp(1.5rem,6vw,2rem)] font-semibold text-white">
          {Number.isInteger(value) ? value.toLocaleString() : value} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 accent-white"
      />
      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/28">
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function FooterNav({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  return (
      <div className="mt-5 flex flex-wrap gap-3">
      <ActionButton tone="ghost" onClick={onBack}>
        Back
      </ActionButton>
      <ActionButton tone="primary" onClick={onNext}>
        Continue
      </ActionButton>
    </div>
  );
}

function AnswerButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border px-4 py-4 text-left text-[15px] font-medium transition md:px-6 md:py-6 md:text-base ${
        active
          ? "border-white bg-white text-black"
          : "border-white/10 bg-white/4 text-white hover:border-white/30 hover:bg-white/8"
      }`}
    >
      {label}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "primary" | "ghost" | "soft";
  disabled?: boolean;
}) {
  const className =
    tone === "primary"
      ? "bg-white text-black hover:bg-white/90"
      : tone === "soft"
        ? "bg-white/8 text-white hover:bg-white/12"
        : "border border-white/14 bg-transparent text-white hover:bg-white/6";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function VolumeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M3 10v4h4l5 4V6L7 10H3Z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M18.5 6.5a8.5 8.5 0 0 1 0 11" />
    </svg>
  );
}

export default App;
