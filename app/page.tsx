"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CardId = "counter" | "grammarian" | "evaluator";

type CardUiState = "idle" | "loading" | "ready" | "playing" | "ended" | "error";

interface AnalysisResult {
  transcript: string;
  counter: string;
  grammarian: string;
  evaluator: string;
}

const CARDS: {
  id: CardId;
  icon: string;
  label: string;
  voiceId: string;
  resultKey: keyof AnalysisResult;
}[] = [
  {
    id: "counter",
    icon: "🔢",
    label: "Counter",
    voiceId: "bIHbv24MWmeRgasZH58o",
    resultKey: "counter",
  },
  {
    id: "grammarian",
    icon: "✍️",
    label: "Grammarian",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    resultKey: "grammarian",
  },
  {
    id: "evaluator",
    icon: "🎯",
    label: "Evaluator",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    resultKey: "evaluator",
  },
];

const PRACTICE_PROMPTS = [
  "Pitch your idea in 60 seconds",
  "Explain your project to a non-technical friend",
  "Answer: Why should we hire you?",
] as const;

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseScore(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*10|out of 10)/i);
  return m ? Math.min(10, Math.max(0, Number(m[1]))) : null;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function Spinner() {
  return (
    <div
      className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-400"
      role="status"
      aria-label="Loading"
    />
  );
}

function SoundWave() {
  return (
    <div className="flex h-12 items-end justify-center gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-violet-400 sound-bar"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

const initialCardStates = (): Record<CardId, CardUiState> => ({
  counter: "idle",
  grammarian: "idle",
  evaluator: "idle",
});

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [cardStates, setCardStates] =
    useState<Record<CardId, CardUiState>>(initialCardStates);
  const [cardErrors, setCardErrors] = useState<Record<CardId, string | null>>({
    counter: null,
    grammarian: null,
    evaluator: null,
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  const chipsDisabled = isRecording || isAnalyzing;
  const evaluatorScore =
    results?.evaluator != null ? parseScore(results.evaluator) : null;

  const togglePrompt = (prompt: string) => {
    setSelectedPrompt((prev) => (prev === prompt ? null : prompt));
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      cleanupAudio();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [stopTimer, stopStream, cleanupAudio]);

  const resetAnalysis = useCallback(() => {
    cleanupAudio();
    setResults(null);
    setCardStates(initialCardStates());
    setCardErrors({ counter: null, grammarian: null, evaluator: null });
    setTranscriptOpen(false);
    setGlobalError(null);
  }, [cleanupAudio]);

  const setAllCardsLoading = useCallback(() => {
    setCardStates({
      counter: "loading",
      grammarian: "loading",
      evaluator: "loading",
    });
    setCardErrors({ counter: null, grammarian: null, evaluator: null });
  }, []);

  const setAllCardsError = useCallback((message: string) => {
    setCardStates({
      counter: "error",
      grammarian: "error",
      evaluator: "error",
    });
    setCardErrors({
      counter: message,
      grammarian: message,
      evaluator: message,
    });
  }, []);

  const startRecording = async () => {
    resetAnalysis();
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setGlobalError(
        "Microphone access was denied. Please allow microphone permission and try again."
      );
      stopStream();
    }
  };

  const stopAndAnalyze = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setIsRecording(false);
    stopTimer();

    const audioBlob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.onerror = () => resolve(null);
      recorder.stop();
      stopStream();
    });

    if (!audioBlob) {
      const message = "No audio was captured. Please try recording again.";
      setGlobalError(message);
      setAllCardsError(message);
      return;
    }

    setIsAnalyzing(true);
    setAllCardsLoading();

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "Analysis failed. Please try again.";
        setGlobalError(message);
        setAllCardsError(message);
        return;
      }

      const analysis = data as AnalysisResult;
      setResults(analysis);
      setCardStates({
        counter: "ready",
        grammarian: "ready",
        evaluator: "ready",
      });
    } catch {
      const message =
        "Could not reach the server. Check your connection and try again.";
      setGlobalError(message);
      setAllCardsError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playFeedback = useCallback(
    async (cardId: CardId) => {
      if (!results) return;

      const card = CARDS.find((c) => c.id === cardId);
      if (!card) return;

      const text = results[card.resultKey];
      if (!text) return;

      cleanupAudio();

      setCardStates((prev) => ({
        ...prev,
        [cardId]: "playing",
      }));

      try {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId: card.voiceId }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message =
            typeof data.error === "string"
              ? data.error
              : "Could not play feedback. Please try again.";
          setCardErrors((prev) => ({ ...prev, [cardId]: message }));
          setCardStates((prev) => ({ ...prev, [cardId]: "error" }));
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setCardStates((prev) => ({ ...prev, [cardId]: "ended" }));
        };

        audio.onerror = () => {
          setCardErrors((prev) => ({
            ...prev,
            [cardId]: "Playback failed. Please try again.",
          }));
          setCardStates((prev) => ({ ...prev, [cardId]: "error" }));
        };

        await audio.play();
      } catch {
        setCardErrors((prev) => ({
          ...prev,
          [cardId]: "Could not play feedback. Please try again.",
        }));
        setCardStates((prev) => ({ ...prev, [cardId]: "error" }));
      }
    },
    [results, cleanupAudio]
  );

  const renderCardBody = (card: (typeof CARDS)[number]) => {
    const state = cardStates[card.id];

    if (state === "loading") {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-12 transition-opacity duration-300">
          <Spinner />
          <p className="text-sm text-zinc-400">Analyzing your speech...</p>
        </div>
      );
    }

    if (state === "error") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center transition-opacity duration-300">
          <p className="text-sm leading-relaxed text-red-400">
            {cardErrors[card.id] ??
              "Something went wrong. Please record again and try once more."}
          </p>
        </div>
      );
    }

    const feedbackText =
      results && (state === "ready" || state === "playing" || state === "ended")
        ? results[card.resultKey]
        : null;

    if (state === "playing" && feedbackText) {
      return (
        <div className="flex w-full flex-col gap-4 py-6 transition-all duration-300">
          <p className="max-h-32 overflow-y-auto text-left text-sm leading-relaxed text-zinc-300">
            {feedbackText}
          </p>
          <div className="flex flex-col items-center justify-center gap-3">
            <SoundWave />
            <p className="text-sm font-medium text-violet-300">Speaking...</p>
          </div>
        </div>
      );
    }

    if (state === "ended" && feedbackText) {
      return (
        <div className="flex w-full flex-col gap-4 py-6 transition-all duration-300">
          <p className="max-h-32 overflow-y-auto text-left text-sm leading-relaxed text-zinc-300">
            {feedbackText}
          </p>
          <div className="flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => playFeedback(card.id)}
              className="group flex h-16 w-16 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-300 transition-all duration-300 hover:border-violet-500/50 hover:bg-zinc-700 hover:text-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label={`Replay ${card.label} feedback`}
            >
              <ReplayIcon className="h-7 w-7 transition-transform duration-300 group-hover:rotate-[-30deg]" />
            </button>
            <p className="text-xs text-zinc-500">Tap to replay</p>
          </div>
        </div>
      );
    }

    if (state === "ready" && feedbackText) {
      return (
        <div className="flex w-full flex-col gap-4 py-6 transition-all duration-300">
          <p className="max-h-32 overflow-y-auto text-left text-sm leading-relaxed text-zinc-300">
            {feedbackText}
          </p>
          <div className="flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => playFeedback(card.id)}
              className="play-pulse group flex h-20 w-20 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all duration-300 hover:scale-105 hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              aria-label={`Play ${card.label} feedback`}
            >
              <PlayIcon className="ml-1 h-9 w-9" />
            </button>
            <p className="text-sm text-zinc-400">Click to hear feedback</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center transition-opacity duration-300">
        <span className="text-4xl opacity-30" aria-hidden>
          {card.icon}
        </span>
        <p className="text-sm font-medium text-zinc-600">{card.label}</p>
        <p className="max-w-[10rem] text-xs leading-relaxed text-zinc-700">
          Record a speech to hear feedback
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-14 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Speech Analyzer
          </h1>
          <p className="mt-2 text-zinc-400">
            Speak for ~1 minute, then hear feedback from 3 experts
          </p>

          {globalError && !isAnalyzing && (
            <p
              className="mx-auto mt-4 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300"
              role="alert"
            >
              {globalError}
            </p>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-2 px-2">
            {PRACTICE_PROMPTS.map((prompt) => {
              const isSelected = selectedPrompt === prompt;
              return (
                <button
                  key={prompt}
                  type="button"
                  disabled={chipsDisabled}
                  onClick={() => togglePrompt(prompt)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${
                    isSelected
                      ? "border-violet-500/50 bg-violet-950/40 text-violet-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                  }`}
                >
                  {prompt}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center">
              {isRecording && (
                <>
                  <span className="recording-ring absolute h-44 w-44 rounded-full border-2 border-red-500/40" />
                  <span className="recording-ring recording-ring-delay absolute h-52 w-52 rounded-full border border-red-500/20" />
                </>
              )}
              <button
                type="button"
                onClick={
                  !isRecording && !isAnalyzing ? startRecording : undefined
                }
                disabled={isRecording || isAnalyzing}
                aria-label={
                  isRecording ? "Recording in progress" : "Start speaking"
                }
                className={`relative z-10 flex h-36 w-36 items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-default ${
                  isRecording
                    ? "bg-red-600 shadow-[0_0_48px_rgba(220,38,38,0.55)]"
                    : "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                }`}
              >
                <MicIcon className="h-12 w-12 text-white" />
              </button>
            </div>

            <p className="text-sm font-medium text-zinc-300 transition-colors duration-300">
              {isRecording ? (
                <span className="font-mono text-2xl tabular-nums text-red-400">
                  {formatTime(elapsedSeconds)}
                </span>
              ) : (
                "Start Speaking"
              )}
            </p>

            {selectedPrompt && !isRecording && !isAnalyzing && (
              <p className="max-w-md text-center text-sm italic text-zinc-400">
                Try: {selectedPrompt}
              </p>
            )}

            {isRecording && (
              <button
                type="button"
                onClick={stopAndAnalyze}
                className="rounded-full bg-violet-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-all duration-300 hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                Stop &amp; Analyze
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {CARDS.map((card) => {
            const state = cardStates[card.id];
            const isReady = state === "ready" || state === "playing" || state === "ended";

            return (
              <article
                key={card.id}
                className={`flex min-h-[320px] flex-col overflow-hidden rounded-2xl border bg-zinc-900/60 shadow-xl backdrop-blur-sm transition-all duration-300 ${
                  isReady
                    ? "border-violet-500/30 shadow-violet-900/20"
                    : "border-zinc-800"
                } ${state === "idle" ? "opacity-60" : "opacity-100"}`}
              >
                <div
                  className={`border-b border-zinc-800 px-5 py-4 transition-colors duration-300 ${
                    isReady ? "bg-violet-950/20" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      {card.icon}
                    </span>
                    <h2
                      className={`text-sm font-semibold transition-colors duration-300 ${
                        isReady ? "text-zinc-100" : "text-zinc-500"
                      }`}
                    >
                      {card.label}
                    </h2>
                    {card.id === "evaluator" && evaluatorScore !== null && (
                      <span className="ml-auto rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                        {evaluatorScore}/10
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-5">
                  {renderCardBody(card)}
                </div>
              </article>
            );
          })}
        </section>

        {results?.transcript && (
          <div className="mt-10 animate-result">
            <button
              type="button"
              onClick={() => setTranscriptOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 text-left text-sm font-medium text-zinc-300 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900"
              aria-expanded={transcriptOpen}
            >
              <span>View Transcript</span>
              <svg
                className={`h-5 w-5 text-zinc-500 transition-transform duration-300 ${
                  transcriptOpen ? "rotate-180" : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                transcriptOpen
                  ? "mt-2 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 text-sm leading-relaxed text-zinc-400">
                  {results.transcript}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
