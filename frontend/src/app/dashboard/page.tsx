"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { BACKEND_URL } from "@/app/config";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

type AnswerDetail = {
  transcript: string;
  scores: ScoreResult & { feedback?: string };
  features?: Record<string, number>;
};

type DetailedFeedback = {
  metrics?: ScoreResult;
  answers?: AnswerDetail[];
  monitoring?: any[];
  violations?: any[];
};

type Evaluation = {
  overall_score: number;
  detailed_feedback?: DetailedFeedback;
};

type Interview = {
  id: number;
  job_title: string;
  status: string;
  created_at: string;
  evaluation?: Evaluation;
};

const SCORE_DIMENSIONS = ['content_relevance', 'fluency', 'vocabulary', 'confidence', 'structure'] as const;

function getScoreColor(value: number, max: number = 20) {
  const ratio = value / max;
  if (ratio >= 0.75) return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
  if (ratio >= 0.50) return { bar: 'bg-amber-500', text: 'text-amber-400' };
  return { bar: 'bg-red-500', text: 'text-red-400' };
}

function getOverallLabel(score: number) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  return 'Needs Work';
}

export default function PracticeDashboard() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Added error state
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("voxassess_token");
    if (!token) return;

    async function fetchUserInterviews() {
      try {
        const res = await fetch(`${BACKEND_URL}/users/me/interviews`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) {
          console.error(`HTTP error! status: ${res.status}`);
          throw new Error("Failed to fetch interviews");
        }
        const data = await res.json();
        // Sort descending by date
        const sorted = data.sort((a: Interview, b: Interview) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setInterviews(sorted);
      } catch (err) {
        console.error("FETCH ERROR:", err);
        setError("Backend not reachable. Ensure the server is running.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchUserInterviews();
  }, []);

  const completedInterviews = interviews.filter(i => i.status === 'completed');
  const inProgressInterviews = interviews.filter(i => i.status === 'pending' || i.status === 'evaluating');

  // Stats
  const avgScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((acc, curr) => acc + (curr.evaluation?.overall_score || 0), 0) / completedInterviews.length)
    : 0;

  const bestScore = completedInterviews.length > 0
    ? Math.round(Math.max(...completedInterviews.map(i => i.evaluation?.overall_score || 0)))
    : 0;

  // Prepare data for Recharts — only include interviews with score > 0
  const chartData = [...completedInterviews]
    .reverse()
    .filter(session => session.evaluation?.overall_score && session.evaluation.overall_score > 0)
    .map((session, index) => ({
      name: `Mock #${index + 1}`,
      score: Math.round(session.evaluation!.overall_score),
      date: new Date(session.created_at).toLocaleDateString()
    }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111827] border border-white/10 p-3 rounded-lg shadow-xl">
          <p className="text-gray-300 text-xs mb-1">{label}</p>
          <p className="text-blue-400 font-bold text-lg">{payload[0].value}%</p>
          <p className="text-gray-500 text-[10px] mt-1">{payload[0].payload.date}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-[#0a0f1a] p-6 lg:p-10 text-gray-100">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Page Title & Action */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
              Performance <span className="text-blue-500">Dashboard</span>
            </h1>
            <p className="text-gray-400">Review your past mocks and track improvement.</p>
          </div>
          <Link
            href="/interview"
            className="inline-flex items-center px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-lg shadow-blue-600/20 group"
          >
            Start New practice interview
            <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </header>

        {/* Stats Grid — 3 equal-width cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] flex flex-col justify-between">
            <div>
               <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Average Score</p>
               <p className="text-4xl font-black text-white">{avgScore}<span className="text-xl text-gray-500 ml-1">%</span></p>
            </div>
            <p className="text-sm text-gray-500 mt-4">Across all completed sessions.</p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] flex flex-col justify-between">
            <div>
               <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Sessions Completed</p>
               <p className="text-4xl font-black text-white">{completedInterviews.length}</p>
            </div>
            <p className="text-sm text-gray-500 mt-4">Total completed interviews.</p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] flex flex-col justify-between">
            <div>
               <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Best Score</p>
               <p className="text-4xl font-black text-white">{bestScore}<span className="text-xl text-gray-500 ml-1">%</span></p>
            </div>
            <p className="text-sm text-gray-500 mt-4">Highest score achieved.</p>
          </div>
        </div>

        {/* Score Progression Chart */}
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Score Progression</p>
            <div className="text-xs text-gray-500">Auto-scored by AI</div>
          </div>
          <div className="h-40 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#fff', stroke: '#3b82f6' }} label={{ position: 'top', fill: '#64748b', fontSize: 10 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 tracking-widest uppercase text-sm font-semibold">
                No data yet. Complete an interview!
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity — Completed Sessions */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Session History</h2>
          
          {isLoading ? (
             <div className="p-20 text-center text-gray-500 bg-[#111827] rounded-xl border border-gray-800">Loading your history...</div>
          ) : completedInterviews.length === 0 ? (
             <div className="p-10 text-center text-gray-500 bg-[#111827] rounded-xl border border-gray-800">
               <p className="mb-4">You havent completed any interviews yet.</p>
               <Link href="/interview" className="text-blue-400 hover:text-blue-300 font-bold">Try one now!</Link>
             </div>
          ) : (
             <div className="space-y-4">
               {completedInterviews.map((session) => {
                  const score = session.evaluation?.overall_score || 0;
                  const isExpanded = expandedId === session.id;
                  const details = session.evaluation?.detailed_feedback;
                  const scoreLabel = getOverallLabel(score);
                  const scoreBadgeColor = score >= 80 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 
                                          score >= 60 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 
                                          'border-red-500/30 bg-red-500/10 text-red-400';
                  
                  return (
                    <div key={session.id} className="rounded-2xl border border-[#1e293b] bg-[#111827] overflow-hidden transition-all duration-300 shadow-sm hover:border-gray-700">
                       {/* Header Bar */}
                       <div 
                         onClick={() => setExpandedId(isExpanded ? null : session.id)}
                         className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                       >
                         <div className="flex-1">
                           <div className="flex items-center gap-3 mb-1">
                             <h3 className="font-bold text-lg text-white">{session.job_title}</h3>
                             <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-gray-400">
                               {new Date(session.created_at).toLocaleDateString()}
                             </span>
                           </div>
                           <p className="text-sm text-gray-500">Session ID: #{session.id}</p>
                         </div>
                         
                         <div className="flex items-center gap-6">
                           {/* Main Score Badge with Label */}
                           <div className={`px-4 py-2 rounded-xl border ${scoreBadgeColor}`}>
                             <div className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-0.5">Overall</div>
                             <div className="text-xl font-black">{Math.round(score)}%</div>
                             <div className="text-[10px] font-semibold mt-0.5">{scoreLabel}</div>
                           </div>
                           
                           <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                           </svg>
                         </div>
                       </div>
                       
                       {/* Expanded Details */}
                       {isExpanded && (
                         <div className="border-t border-[#1e293b] p-6 bg-black/20 animate-fade-in flex flex-col gap-8">
                            
                            {/* Actions */}
                            <div className="flex justify-end gap-3">
                               <Link 
                                  href={`/reports/${session.id}`}
                                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition text-white border border-gray-700"
                               >
                                 Open Full Report
                               </Link>
                               <Link 
                                  href={`/interview?job_title=${encodeURIComponent(session.job_title)}`}
                                  className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-sm font-semibold transition"
                               >
                                 Re-attempt Interview
                               </Link>
                            </div>

                            {/* Answers Breakdown */}
                            {details?.answers && details.answers.length > 0 && (
                              <div className="space-y-6">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500">Answer Breakdown</h4>
                                {details.answers.map((answer, idx) => (
                                  <div key={idx} className="bg-white/[0.02] border border-white/10 rounded-xl p-5 space-y-4">
                                    <h5 className="text-sm font-bold text-white">Answer {idx + 1}</h5>
                                    
                                    {/* Transcript */}
                                    {answer.transcript && (
                                      <div className="bg-black/50 border border-gray-800 rounded-xl p-4 text-gray-300 text-sm leading-relaxed italic border-l-4 border-l-blue-500">
                                        &ldquo;{answer.transcript}&rdquo;
                                      </div>
                                    )}

                                    {/* Score Bars */}
                                    {answer.scores && (
                                      <div className="space-y-2">
                                        {SCORE_DIMENSIONS.map(dim => {
                                          const val = (answer.scores as any)[dim] ?? 0;
                                          const pct = (val / 20) * 100;
                                          const colors = getScoreColor(val, 20);
                                          return (
                                            <div key={dim} className="flex items-center gap-3">
                                              <span className="text-[11px] text-gray-400 uppercase tracking-wider w-36 shrink-0">{dim.replace(/_/g, ' ')}</span>
                                              <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                              </div>
                                              <span className={`text-xs font-bold w-12 text-right ${colors.text}`}>{val}/20</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* AI Feedback */}
                                    {answer.scores?.feedback && (
                                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
                                        <span className="text-lg shrink-0">💡</span>
                                        <div>
                                          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">AI Feedback</div>
                                          <p className="text-sm text-blue-200/90 leading-relaxed">{answer.scores.feedback}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Metrics (top-level aggregated scores if present) */}
                            {details?.metrics && (
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Aggregated Metrics</h4>
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                  {Object.entries(details.metrics).filter(([k]) => !['overall_score', 'fairness_adjustment'].includes(k)).map(([k, v]) => (
                                    <div key={k} className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                                       <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{k.replace(/_/g, ' ')}</div>
                                       <div className="text-lg font-bold text-white">{v as number}{k.includes('score') ? '' : '/20'}</div>
                                    </div>
                                  ))}
                                  {details.metrics.fairness_adjustment ? (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
                                       <div className="text-[10px] text-rose-400 uppercase tracking-widest mb-1">Fairness Bias Shift</div>
                                       <div className="text-lg font-bold text-rose-400">+{details.metrics.fairness_adjustment}</div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {/* Violations */}
                            {details?.violations && details.violations.length > 0 && (
                               <div>
                                 <h4 className="text-xs font-bold uppercase tracking-widest text-red-500/80 mb-3">Proctoring Flags</h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {details.violations.map((violation: any, idx: number) => (
                                      <div key={idx} className="p-3 rounded-lg border flex items-start gap-3 bg-red-500/10 border-red-500/30 text-red-400">
                                         <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                         </svg>
                                         <div>
                                           <div className="text-xs font-bold uppercase">{violation.type?.replace(/_/g, ' ') || 'Violation'}</div>
                                           <div className="text-sm opacity-90">{violation.message || JSON.stringify(violation)}</div>
                                         </div>
                                      </div>
                                    ))}
                                 </div>
                               </div>
                            )}

                         </div>
                       )}
                    </div>
                  );
               })}
             </div>
          )}
        </section>

        {/* In Progress Section */}
        {!isLoading && inProgressInterviews.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              In Progress
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProgressInterviews.map((session) => (
                <Link
                  key={session.id}
                  href="/interview"
                  className="block p-5 rounded-xl bg-[#111827] border border-[#1e293b] hover:border-amber-500/40 transition group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-white group-hover:text-amber-300 transition">{session.job_title}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      session.status === 'evaluating' 
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{new Date(session.created_at).toLocaleDateString()} · Click to continue →</p>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
