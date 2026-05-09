"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import { BACKEND_URL } from "@/app/config";
import { toast, Toaster } from "react-hot-toast";

const SAMPLE_QUESTIONS = [
  "Tell me about yourself and your professional background.",
  "What is your greatest strength and how has it helped you professionally?",
  "Describe a challenging project you led. What was the outcome?",
  "Where do you see yourself in 5 years?",
  "Why are you interested in this role?",
];

type ScoreResult = {
  content_relevance: number;
  fluency: number;
  vocabulary: number;
  confidence: number;
  structure: number;
  overall_score: number;
};

type AnalysisResult = {
  transcript: string;
  features: Record<string, number>;
  scores: ScoreResult;
};

type MonitoringAlert = {
  type: string;
  message: string;
  severity: "high" | "medium" | "low";
  confidence: number;
};

export default function InterviewPage() {
  const router = useRouter();
  // ─── State ──────────────────────────────────
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [webcamActive, setWebcamActive] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [interviewId, setInterviewId] = useState<number | null>(null);

  // Proctoring State
  const [flagCount, setFlagCount] = useState(0);
  const flagCountRef = useRef(0);
  const [faceWarningVisible, setFaceWarningVisible] = useState(false);
  const [faceDetectionPct, setFaceDetectionPct] = useState(100);

  // ─── Refs ───────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const monitoringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const eyeContactLostSince = useRef<number | null>(null);
  const faceNotDetectedSince = useRef<number | null>(null);
  const totalFrames = useRef(0);
  const faceDetectedFrames = useRef(0);

  // ─── Proctoring Rules ──────────────────────
  const terminateInterview = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    window.location.href = "/practice";
  }, []);

  const raiseFlag = useCallback((reason: string) => {
    if (!isRecordingRef.current) return;
    flagCountRef.current += 1;
    const currentFlags = flagCountRef.current;
    setFlagCount(currentFlags);
    
    toast.error(`⚠️ Flag ${currentFlags}/6: ${reason}`, { id: 'proctor-alert', duration: 4000 });
    
    if (interviewId) {
      const token = localStorage.getItem("voxassess_token");
      fetch(`${BACKEND_URL}/log-violation/${interviewId}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          violation_type: "proctoring_flag",
          message: reason
        })
      }).catch(() => {});
    }

    if (currentFlags >= 6) {
      toast.error("Interview terminated: Maximum violations exceeded.", { id: 'proctor-terminate', duration: 5000 });
      setTimeout(terminateInterview, 4000);
    }
  }, [interviewId, terminateInterview]);

  // ─── Initialization ────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("voxassess_token");
    if (!token) {
      router.push("/login?auth=required");
      return;
    }

    async function initInterview() {
      try {
        const res = await fetch(`${BACKEND_URL}/interviews/`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            job_title: "General Practice Interview"
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setInterviewId(data.id);
        }
      } catch (err) {
        console.error("Failed to initialize interview:", err);
      }
    }
    initInterview();
  }, []);

  // ─── Webcam Setup ───────────────────────────
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setWebcamActive(true);
      setError("");
    } catch {
      setError("Camera/microphone access denied. Please allow access and reload.");
    }
  }, []);

  useEffect(() => {
    startWebcam();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
    };
  }, [startWebcam]);

  // ─── Recording ──────────────────────────────
  const startRecording = () => {
    if (!streamRef.current) return;
    setError("");
    setTranscript("");
    setAnalysis(null);

    const audioStream = new MediaStream(
      streamRef.current.getAudioTracks()
    );
    const recorder = new MediaRecorder(audioStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = () => handleRecordingComplete();

    recorder.start(250);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    isRecordingRef.current = true;
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    // Start background monitoring every 3 seconds
    if (!monitoringIntervalRef.current) {
      startMonitoring();
    }
  };

const startMonitoring = () => {
  monitoringIntervalRef.current = setInterval(async () => {
    if (!isRecordingRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // 🚨 Fix 1: Ensure video is ready
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log("⏳ Video not ready");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 🚨 Fix 2: Replace toBlob callback with await version
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7)
    );

    if (!blob) return;

    console.log("📤 Sending frame to backend...");

    try {
      const formData = new FormData();
      formData.append("file", blob, "frame.jpg");

      if (interviewId) {
        formData.append("interview_id", interviewId.toString());
      }
            const token = localStorage.getItem("voxassess_token");
          const res = await fetch(`${BACKEND_URL}/monitor-frame`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`
            },
            body: formData,
          });
          
          if (res.status === 401) {
            router.push("/login?auth=expired");
            return;
          }

      console.log("📥 Response status:", res.status);

      if (!res.ok) {
        console.error("❌ Backend error:", res.status);
        return;
      }

      const data = await res.json();
      console.log("MONITOR RESULT:", data);

      // Face tracking
      totalFrames.current += 1;
      const faceDetected = data.face?.face_detected;
      if (faceDetected) {
        faceDetectedFrames.current += 1;
        faceNotDetectedSince.current = null;
        setFaceWarningVisible(false);
      } else {
        if (!faceNotDetectedSince.current) {
          faceNotDetectedSince.current = Date.now();
        }
        setFaceWarningVisible(true);
        if (isRecordingRef.current && Date.now() - faceNotDetectedSince.current > 30000) { // 30 seconds
          toast.error("Interview terminated: Face not detected for 30 seconds.", { id: 'proctor-terminate', duration: 5000 });
          setTimeout(terminateInterview, 4000);
          return;
        }
      }
      setFaceDetectionPct(Math.round((faceDetectedFrames.current / totalFrames.current) * 100));

      // Eye Contact Tracking
      const eyeContact = data.eye_contact?.eye_contact;
      const gazeDirection = data.eye_contact?.gaze_direction;
      if (!eyeContact && gazeDirection !== "no_face") {
        if (!eyeContactLostSince.current) {
          eyeContactLostSince.current = Date.now();
        }
        if (Date.now() - eyeContactLostSince.current > 3000) { // 3 seconds
           if (isRecordingRef.current) {
             raiseFlag("Eye contact lost for 3 seconds");
           }
           eyeContactLostSince.current = null; // Reset to allow another flag later
        }
      } else {
         eyeContactLostSince.current = null;
      }

      if (data.is_suspicious) {
        setIsSuspicious(true);

        const mappedAlerts: MonitoringAlert[] = data.alerts.map((a: string) => ({
          type: a.toLowerCase().includes("phone") ? "cell_phone" : "person_count",
          message: a,
          severity: "high",
          confidence: 1.0
        }));

        setAlerts(mappedAlerts);

        if (isRecordingRef.current && data.alerts.length > 0) {
          raiseFlag(`Suspicious activity: ${data.alerts.join(", ")}`);
        }
      } else {
        // Clear suspicious state and alerts if current frame is fine
        setIsSuspicious(false);
        setAlerts([]);
      }
    } catch (err) {
      console.error("❌ Detection error:", err);
    }
  }, 2000);
};

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    isRecordingRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Do not clear monitoring interval so visual feed continues
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecordingRef.current) {
        raiseFlag("Candidate switched tabs");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [raiseFlag]);

  // ─── Transcription & Analysis ───────────────
  const handleRecordingComplete = async () => {
    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (blob.size === 0) {
      setError("No audio recorded. Try again.");
      return;
    }

    // Step 1: Transcribe
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      if (interviewId) {
        formData.append("interview_id", interviewId.toString());
      }

       const token = localStorage.getItem("voxassess_token");
       const res = await fetch(`${BACKEND_URL}/transcribe`, {
         method: "POST",
         headers: {
           "Authorization": `Bearer ${token}`
         },
         body: formData,
       });
      if (res.status === 401) {
        router.push("/login?auth=expired");
        return;
      }
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const data = await res.json();
      setTranscript(data.transcript);
      setIsTranscribing(false);

      // Step 2: Analyze
      setIsAnalyzing(true);
      const analyzeForm = new FormData();
      analyzeForm.append("file", blob, "recording.webm");
      if (interviewId) {
        analyzeForm.append("interview_id", interviewId.toString());
      }

       const analyzeRes = await fetch(`${BACKEND_URL}/analyze-answer`, {
         method: "POST",
         headers: {
           "Authorization": `Bearer ${token}`
         },
         body: analyzeForm,
       });
      if (analyzeRes.status === 401) {
        router.push("/login?auth=expired");
        return;
      }
      if (!analyzeRes.ok) throw new Error(`Analysis failed (${analyzeRes.status})`);
      const analysisData: AnalysisResult = await analyzeRes.json();
      setAnalysis(analysisData);
    } catch (e: unknown) {
      console.error("FETCH ERROR:", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(`Backend Communication Error: ${msg}. Please check if the server is running.`);
    } finally {
      setIsTranscribing(false);
      setIsAnalyzing(false);
    }
  };

  // ─── Navigation ─────────────────────────────
  const nextQuestion = async () => {
    if (currentQuestionIdx < SAMPLE_QUESTIONS.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setTranscript("");
      setAnalysis(null);
      setError("");
      setRecordingTime(0);
    } else {
      // Finalize Interview
      if (interviewId) {
        setIsAnalyzing(true);
         try {
           const token = localStorage.getItem("voxassess_token");
           const res = await fetch(`${BACKEND_URL}/finalize-interview/${interviewId}`, {
             method: "POST",
             headers: {
               "Authorization": `Bearer ${token}`
             },
           });
          if (res.status === 401) {
            router.push("/login?auth=expired");
            return;
          }
          if (res.ok) {
            toast.success("Interview completed and saved successfully!");
            setTimeout(() => window.location.href = "/practice", 2000);
          } else {
            throw new Error("Finalization failed");
          }
        } catch (err) {
          console.error("Failed to finalize interview:", err);
          toast.error("Interview completed, but failed to save results.");
          setTimeout(() => window.location.href = "/practice", 2000);
        } finally {
          setIsAnalyzing(false);
        }
      } else {
        window.location.href = "/practice";
      }
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // ─── Score bar helper ───────────────────────
  const ScoreBar = ({
    label,
    value,
    max = 20,
  }: {
    label: string;
    value: number;
    max?: number;
  }) => {
    const pct = Math.min(100, (value / max) * 100);
    const color =
      pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";
    return (
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-300">{label}</span>
          <span className="font-mono font-semibold text-white">
            {value}/{max}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-700/60 overflow-hidden">
          <div
            className={`h-full rounded-full ${color} animate-fill-bar`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0a0f1a] p-6 lg:p-10 flex flex-col items-center">
      <div className="w-full max-w-7xl">
        <Toaster position="top-right" />
        {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight gradient-text">
            VoxAssess
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">AI Interview Evaluation</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>
            Question{" "}
            <span className="text-white font-semibold">
              {currentQuestionIdx + 1}
            </span>{" "}
            / {SAMPLE_QUESTIONS.length}
          </span>
          <button
            onClick={nextQuestion}
            className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-white text-sm"
          >
            Next →
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ──── Left: Question + Webcam ──── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Question card */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">
              Interview Question
            </p>
            <h2 className="text-xl font-semibold text-white leading-relaxed">
              {SAMPLE_QUESTIONS[currentQuestionIdx]}
            </h2>
          </div>

          {/* Webcam + controls */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e293b] overflow-hidden">
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse-glow" />
                  <span className="text-sm font-mono text-white">
                    REC {formatTime(recordingTime)}
                  </span>
                </div>
              )}

              {!webcamActive && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  <p>Camera not available</p>
                </div>
              )}
              
              {/* Suspicious activity indicator */}
              {isSuspicious && (
                <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-red-600/90 text-white text-xs font-bold animate-pulse flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  SUSPICIOUS ACTIVITY
                </div>
              )}

              {/* Face Not Detected Warning */}
              {faceWarningVisible && (
                <div className="absolute inset-0 bg-red-900/60 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                  <div className="bg-black/80 px-6 py-4 rounded-2xl flex flex-col items-center gap-3 animate-pulse border border-red-500/50">
                    <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-white text-lg font-bold text-center">Face Not Detected</p>
                    <p className="text-red-300 text-sm font-semibold max-w-xs text-center leading-snug">
                      Please position your face in the center of the camera. The interview will terminate automatically in 30 seconds.
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Controls bar */}
            <div className="flex items-center justify-center gap-4 px-6 py-4 bg-[#0d1321]">
              {!isRecording ? (
                <button
                  id="btn-start-recording"
                  onClick={startRecording}
                  disabled={!webcamActive || isTranscribing || isAnalyzing}
                  className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition shadow-lg shadow-blue-600/20 flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                  </svg>
                  Start Recording
                </button>
              ) : (
                <button
                  id="btn-stop-recording"
                  onClick={stopRecording}
                  className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold transition shadow-lg shadow-red-600/20 flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <rect x="5" y="5" width="10" height="10" rx="1" />
                  </svg>
                  Stop Recording
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ──── Right: Score & Feedback ──── */}
        <div className="space-y-6">
          {/* Proctoring Status Panel */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6 lg:mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#94a3b8] mb-4">
              Proctoring Status
            </p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300 font-medium">Flags</span>
                  <span className={`font-mono font-bold ${flagCount >= 4 ? 'text-red-400' : flagCount >= 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {flagCount} / 6
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-700/60 overflow-hidden">
                   <div 
                     className={`h-full rounded-full transition-all duration-300 ${flagCount >= 4 ? 'bg-red-500' : flagCount >= 2 ? 'bg-amber-400' : 'bg-emerald-500'}`} 
                     style={{ width: `${Math.min(100, (flagCount / 6) * 100)}%` }}
                   />
                </div>
              </div>
              
              <div className="flex justify-between items-center bg-white/[0.02] p-3 border border-white/5 rounded-xl">
                <span className="text-sm text-gray-400">Face Detection Rate</span>
                <span className={`font-bold text-sm ${faceDetectionPct >= 70 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {faceDetectionPct}%
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-white/[0.02] p-3 border border-white/5 rounded-xl flex flex-col gap-1 items-center justify-center">
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider text-center">Eye Contact</span>
                    {eyeContactLostSince.current ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Lost
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Looking
                      </span>
                    )}
                 </div>
                 <div className="bg-white/[0.02] p-3 border border-white/5 rounded-xl flex flex-col gap-1 items-center justify-center">
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider text-center">Suspicious</span>
                    {isSuspicious ? (
                       <span className="text-xs font-bold text-red-500">Yes</span>
                    ) : (
                       <span className="text-xs font-bold text-emerald-500">No</span>
                    )}
                 </div>
              </div>
            </div>
          </div>

          {/* Overall score */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
              Overall Score
            </p>
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-3 text-gray-400 py-6">
                <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Analyzing your answer…
              </div>
            ) : analysis ? (
              <>
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={
                        analysis.scores.overall_score >= 70
                          ? "#22c55e"
                          : analysis.scores.overall_score >= 45
                          ? "#f59e0b"
                          : "#ef4444"
                      }
                      strokeWidth="3"
                      strokeDasharray={`${analysis.scores.overall_score}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-extrabold text-white">
                      {Math.round(analysis.scores.overall_score)}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-400">out of 100</p>
              </>
            ) : (
              <div className="py-10 text-gray-600 text-sm italic">
                Score will appear after analysis
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
              Transcript
            </p>
            {isTranscribing ? (
              <div className="flex items-center gap-3 text-gray-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Transcribing audio with Whisper…
              </div>
            ) : transcript ? (
              <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                {transcript}
              </p>
            ) : (
              <p className="text-gray-600 italic">
                Record your answer to see the transcript here.
              </p>
            )}
          </div>

          {/* Dimension scores */}
          {analysis && (
            <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
                Score Breakdown
              </p>
              <ScoreBar
                label="Content Relevance"
                value={analysis.scores.content_relevance}
              />
              <ScoreBar label="Fluency" value={analysis.scores.fluency} />
              <ScoreBar label="Vocabulary" value={analysis.scores.vocabulary} />
              <ScoreBar label="Confidence" value={analysis.scores.confidence} />
              <ScoreBar label="Structure" value={analysis.scores.structure} />
            </div>
          )}

          {/* Speech features */}
          {analysis && (
            <div className="rounded-2xl bg-[#111827] border border-[#1e293b] p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
                Speech Metrics
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: "Speech Rate",
                    value: `${analysis.features.speech_rate} wpm`,
                  },
                  {
                    label: "Pauses",
                    value: `${analysis.features.pause_duration}s`,
                  },
                  {
                    label: "Filler Words",
                    value: analysis.features.filler_words,
                  },
                  {
                    label: "Word Count",
                    value: analysis.features.word_count,
                  },
                  {
                    label: "Sentences",
                    value: analysis.features.sentence_count,
                  },
                  {
                    label: "Duration",
                    value: `${analysis.features.duration_seconds}s`,
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl bg-white/[0.03] border border-white/5 p-3"
                  >
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">
                      {m.label}
                    </p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Monitoring Alerts */}
          {alerts.length > 0 && (
            <div className="rounded-2xl bg-[#111827] border border-red-500/20 p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Monitoring Alerts
              </p>
              <div className="space-y-3">
                {alerts.map((alert, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${
                    alert.severity === 'high' ? 'bg-red-500/5 border-red-500/20' : 
                    alert.severity === 'medium' ? 'bg-amber-500/5 border-amber-500/20' : 
                    'bg-blue-500/5 border-blue-500/20'
                  }`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className={`text-xs font-bold uppercase ${
                        alert.severity === 'high' ? 'text-red-400' : 
                        alert.severity === 'medium' ? 'text-amber-400' : 
                        'text-blue-400'
                      }`}>
                        {alert.type.replace('_', ' ')}
                      </p>
                      <span className="text-[10px] text-gray-600">CONF: {Math.round(alert.confidence * 100)}%</span>
                    </div>
                    <p className="text-sm text-gray-300">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}
