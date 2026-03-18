"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { BACKEND_URL } from "@/app/config";

type ScoreResult = {
  content_relevance: number;
  fluency: number;
  vocabulary: number;
  confidence: number;
  structure: number;
  fairness_score?: number;
  fairness_adjustment?: number;
  overall_score: number;
};

type Answer = {
  transcript: string;
  scores: ScoreResult;
  features: Record<string, any>;
};

type MonitoringAlert = {
  type: string;
  message: string;
  severity: "high" | "medium" | "low";
  confidence: number;
  occurrences?: number;
};

type InterviewData = {
  id: number;
  job_title: string;
  status: string;
  created_at: string;
  candidate: {
    full_name: string;
    email: string;
  };
  evaluation?: {
    overall_score: number;
    speech_score: number;
    nlp_score: number;
    vision_score: number;
    detailed_feedback: {
      metrics: ScoreResult;
      answers: Answer[];
      monitoring: any[];
    };
  };
};

export default function ReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<InterviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Added error state
  const [activeTab, setActiveTab] = useState<"summary" | "answers" | "monitoring">("summary");

  useEffect(() => {
    const token = localStorage.getItem("voxassess_token");
    if (!token) {
      router.push("/login?auth=required");
      return;
    }

    async function fetchReport() {
      try {
        const res = await fetch(`${BACKEND_URL}/interviews/${id}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login?auth=expired");
            return;
          }
          const errorText = await res.text();
          console.error("FETCH ERROR:", res.status, errorText);
          throw new Error(`Failed to fetch evaluation report: ${res.status} ${errorText}`);
        }
        const fetchedData = await res.json();
        setData(fetchedData);
      } catch (err: any) {
        console.error("FETCH ERROR:", err);
        setError(err.message || "Backend not reachable. Ensure the server is running.");
      } finally {
        setIsLoading(false);
      }
    }
    if (id) fetchReport();
  }, [id, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">Generating Report...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.evaluation) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Report Not Found</h2>
        <p className="text-gray-400 mb-6">This interview may still be in progress or doesn't have an evaluation yet.</p>
        <Link href="/hr-dashboard" className="px-6 py-2 bg-indigo-600 rounded-lg text-white font-medium">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { evaluation, candidate } = data;
  const { metrics, answers, monitoring = [] } = evaluation.detailed_feedback;

  // Process monitoring alerts
  const alerts: MonitoringAlert[] = [];
  monitoring.forEach((m: any) => {
    if (m.alerts) {
      m.alerts.forEach((a: any) => {
        const existing = alerts.find(ea => ea.type === a.type);
        if (existing) {
          existing.occurrences = (existing.occurrences || 1) + 1;
        } else {
          alerts.push({ ...a, occurrences: 1 });
        }
      });
    }
  });

  return (
    <main className="min-h-screen bg-[#0a0f1a] text-gray-100 p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 mb-3">
              <Link href="/hr-dashboard" className="hover:underline flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-gray-500">Interview Report</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
              {candidate.full_name}
            </h1>
            <p className="text-gray-400">
              {data.job_title} • {new Date(data.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm font-semibold">
              Download PDF
            </button>
            <button className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition text-sm shadow-xl shadow-indigo-600/20">
              Share Report
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-8 w-fit">
          {(["summary", "answers", "monitoring"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition ${
                activeTab === tab ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-10">
          {activeTab === "summary" && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Score Card */}
                <div className="lg:col-span-1 p-8 rounded-3xl bg-indigo-600 flex flex-col items-center justify-center text-center shadow-2xl shadow-indigo-600/20 border border-indigo-500/50">
                  <p className="text-indigo-100 text-sm font-bold uppercase tracking-widest mb-6">Overall Assessment</p>
                  <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <circle 
                        cx="18" cy="18" r="16" fill="none" 
                        stroke="white" strokeWidth="3" 
                        strokeDasharray={`${evaluation.overall_score}, 100`}
                        strokeLinecap="round"
                        className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                      />
                    </svg>
                    <span className="absolute text-5xl font-black text-white">{Math.round(evaluation.overall_score)}</span>
                  </div>
                  <p className="text-indigo-100/80 text-sm italic">"High potential candidate with strong communication skills."</p>
                </div>

                {/* Metrics Grid */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { label: "Speech Fluency", value: evaluation.speech_score, color: "text-emerald-400" },
                    { label: "Content Relevance", value: evaluation.nlp_score, color: "text-blue-400" },
                    { label: "Confidence", value: evaluation.vision_score, color: "text-purple-400" },
                    { label: "Fairness Bias Shift", value: metrics.fairness_adjustment || 0, color: "text-rose-400" },
                  ].map((m) => (
                    <div key={m.label} className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-medium text-gray-400">{m.label}</span>
                        <span className={`text-xl font-bold ${m.color}`}>{Math.round(m.value)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div 
                          className={`h-full opacity-80 ${m.color.replace('text', 'bg')}`} 
                          style={{ width: `${m.value}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "answers" && (
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-bold text-white mb-4">Interview Responses</h3>
              {answers.map((answer, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-bold border border-indigo-500/20">
                      Answer {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-white">Score: {Math.round(answer.scores.overall_score)}/100</span>
                  </div>
                  <div className="relative">
                    <svg className="absolute -left-3 top-0 w-8 h-8 text-indigo-500/10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V12C14.017 12.5523 13.5693 13 13.017 13H11.017C10.4647 13 10.017 12.5523 10.017 12V9C10.017 7.34315 11.3601 6 13.017 6H19.017C20.6738 6 22.017 7.34315 22.017 9V15C22.017 16.6569 20.6738 18 19.017 18H17.017L17.017 21H14.017ZM2.01697 21L2.01697 18C2.01697 16.8954 2.9124 16 4.01697 16H7.01697C7.56925 16 8.01697 15.5523 8.01697 15V9C8.01697 8.44772 7.56925 8 7.01697 8H3.01697C2.46469 8 2.01697 8.44772 2.01697 9V12C2.01697 12.5523 1.56925 13 1.01697 13H1.01697C0.464687 13 -0.0169727 12.5523 -0.0169727 12V9C-0.0169727 7.34315 1.32617 6 2.98303 6H7.01697C8.67383 6 10.017 7.34315 10.017 9V15C10.017 16.6569 8.67383 18 7.01697 18H5.01697L5.01697 21H2.01697Z" />
                    </svg>
                    <p className="text-gray-300 italic leading-relaxed pl-6 pt-2">
                      "{answer.transcript}"
                    </p>
                  </div>
                  <div className="pt-4 flex flex-wrap gap-4 border-t border-white/5">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500">ML Insights:</div>
                    <div className="text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">Fluency: {Math.round(answer.scores.fluency)}%</div>
                    <div className="text-[11px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">Relevance: {Math.round(answer.scores.content_relevance)}%</div>
                    {answer.scores.fairness_adjustment ? (
                      <div className="text-[11px] text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">
                        Fairness Adjustment: +{answer.scores.fairness_adjustment}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          )}

          {activeTab === "monitoring" && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-white">Security & Integrity Log</h3>
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                  data.status === 'flagged' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  Status: {data.status === 'flagged' ? 'SYSTEM FLAGGED' : 'PASSED INTEGRITY'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {alerts.length > 0 ? (
                  alerts.map((alert, idx) => (
                    <div key={idx} className={`p-6 rounded-3xl border transition-all ${
                      alert.severity === 'high' ? 'bg-red-500/5 border-red-500/20 shadow-lg shadow-red-500/5' : 
                      alert.severity === 'medium' ? 'bg-amber-500/5 border-amber-500/20' : 
                      'bg-indigo-500/5 border-indigo-500/20'
                    }`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                            alert.severity === 'high' ? 'bg-red-500/20 text-red-500' : 
                            alert.severity === 'medium' ? 'bg-amber-500/20 text-amber-500' : 
                            'bg-indigo-500/20 text-indigo-500'
                          }`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-bold uppercase tracking-tight text-white">{alert.type.replace('_', ' ')}</p>
                            <p className="text-[10px] text-gray-500">DETECTION CONFIDENCE: {Math.round(alert.confidence * 100)}%</p>
                          </div>
                        </div>
                        <span className="text-xs font-black px-2 py-1 rounded bg-white/5 border border-white/5">{alert.occurrences}x</span>
                      </div>
                      <p className="text-gray-400 text-sm leading-relaxed">{alert.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="md:col-span-2 p-12 text-center rounded-3xl border border-dashed border-white/10 bg-white/[0.01]">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h4 className="text-lg font-bold text-white mb-1">No Anomalies Detected</h4>
                    <p className="text-gray-500 text-sm">The candidate maintained consistent eye contact and a private environment throughout the session.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
