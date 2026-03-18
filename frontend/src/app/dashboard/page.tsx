"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { BACKEND_URL } from "@/app/config";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_USER_ID = 1; // Assuming Jash is Alice for now (id=1 from seed)

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

type MonitoringAlert = {
  type: string;
  message: string;
  severity: "high" | "medium" | "low";
  confidence: number;
};

type DetailedFeedback = {
  transcript?: string;
  scores?: ScoreResult;
  alerts?: MonitoringAlert[];
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
  
  // Calculate average score of last 5 for a simple trend
  const recentScores = completedInterviews.slice(0, 5).map(i => i.evaluation?.overall_score || 0).reverse();
  const avgScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((acc, curr) => acc + (curr.evaluation?.overall_score || 0), 0) / completedInterviews.length)
    : 0;

  // Prepare data for Recharts
  const chartData = [...completedInterviews].reverse().map((session, index) => ({
    name: `Mock #${index + 1}`,
    score: session.evaluation?.overall_score ? Math.round(session.evaluation.overall_score) : 0,
    date: new Date(session.created_at).toLocaleDateString()
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111827] border border-white/10 p-3 rounded-lg shadow-xl">
          <p className="text-gray-300 text-xs mb-1">{label}</p>
          <p className="text-blue-400 font-bold text-lg">{payload[0].value}%</p>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] flex flex-col justify-between">
            <div>
               <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Average Score</p>
               <p className="text-4xl font-black text-white">{avgScore}<span className="text-xl text-gray-500 ml-1">%</span></p>
            </div>
            <p className="text-sm text-gray-500 mt-4">Across all completed sessions.</p>
          </div>
          
          <div className="col-span-1 md:col-span-2 p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
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
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#fff', stroke: '#3b82f6' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 tracking-widest uppercase text-sm font-semibold">
                  No data yet. Complete an interview!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
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
                           {/* Main Score Badge */}
                           <div className={`px-4 py-2 rounded-xl border ${
                               score >= 80 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 
                               score >= 60 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 
                               'border-red-500/30 bg-red-500/10 text-red-400'
                             }`}>
                             <div className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-0.5">Overall</div>
                             <div className="text-xl font-black">{Math.round(score)}%</div>
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

                            {/* Sub Scores Grid */}
                            {details?.scores && (
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Linguistic Breakdown</h4>
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                  {Object.entries(details.scores).filter(([k]) => !['overall_score', 'fairness_adjustment'].includes(k)).map(([k, v]) => (
                                    <div key={k} className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                                       <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{k.replace('_', ' ')}</div>
                                       <div className="text-lg font-bold text-white">{v}{k.includes('score') ? '' : '/20'}</div>
                                    </div>
                                  ))}
                                  {details.scores.fairness_adjustment ? (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
                                       <div className="text-[10px] text-rose-400 uppercase tracking-widest mb-1">Fairness Bias Shift</div>
                                       <div className="text-lg font-bold text-rose-400">+{details.scores.fairness_adjustment}</div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {/* Transcript */}
                            {details?.transcript && (
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">AI Speech Transcription</h4>
                                <div className="bg-black/50 border border-gray-800 rounded-xl p-4 text-gray-300 text-sm leading-relaxed italic border-l-4 border-l-blue-500">
                                  "{details.transcript}"
                                </div>
                              </div>
                            )}

                            {/* Alerts */}
                            {details?.alerts && details.alerts.length > 0 && (
                               <div>
                                 <h4 className="text-xs font-bold uppercase tracking-widest text-red-500/80 mb-3">Proctoring Flags</h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {details.alerts.map((alert, idx) => (
                                      <div key={idx} className={`p-3 rounded-lg border flex items-start gap-3 ${
                                        alert.severity === 'high' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                        alert.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' :
                                        'bg-gray-800/50 border-gray-700 text-gray-400'
                                      }`}>
                                         <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                         </svg>
                                         <div>
                                           <div className="text-xs font-bold uppercase">{alert.type.replace('_', ' ')}</div>
                                           <div className="text-sm opacity-90">{alert.message}</div>
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
      </div>
    </main>
  );
}
