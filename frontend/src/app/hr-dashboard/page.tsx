"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { BACKEND_URL } from "@/app/config";

type Candidate = {
  id: number;
  full_name: string;
  email: string;
};

type Evaluation = {
  overall_score: number;
};

type Interview = {
  id: number;
  job_title: string;
  status: string;
  created_at: string;
  candidate: Candidate;
  evaluation?: Evaluation;
};

type PaginatedInterviews = {
  items: Interview[];
  total: number;
  skip: number;
  limit: number;
};

const PAGE_SIZE = 20;

export default function HRDashboard() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalInterviews, setTotalInterviews] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Live Session State
  const [candidateName, setCandidateName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [meetingPath, setMeetingPath] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Inline toast state for copy feedback
  const [copied, setCopied] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("voxassess_token");
    if (!token) {
      router.push("/login?auth=required");
      return;
    }
  }, [router]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName || !jobTitle) return;
    
    setIsCreatingSession(true);
    try {
      // Create the Interview record — backend assigns candidate from auth token
      const token = localStorage.getItem("voxassess_token");
      const intRes = await fetch(`${BACKEND_URL}/interviews/`, {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ job_title: jobTitle })
      });
      
      if (!intRes.ok) throw new Error("Failed to create interview");
      const interviewData = await intRes.json();
      
      // Generate the live session link
      const liveRes = await fetch(`${BACKEND_URL}/live-sessions?interview_id=${interviewData.id}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!liveRes.ok) throw new Error("Failed to generate live session");
      const liveData = await liveRes.json();
      
      // Create the frontend link
      const link = `${window.location.origin}/interview/live/${liveData.meetingId}`;
      setMeetingLink(link);
      setMeetingPath(`/interview/live/${liveData.meetingId}`);
      
    } catch (err) {
      console.error("Session creation error:", err);
      alert("Failed to create live session.");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    async function fetchInterviews() {
      const token = localStorage.getItem("voxassess_token");
      setIsLoading(true);
      try {
        const skip = currentPage * PAGE_SIZE;
        const res = await fetch(`${BACKEND_URL}/interviews/all?skip=${skip}&limit=${PAGE_SIZE}`, {
          credentials: "include",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data: PaginatedInterviews = await res.json();
          setInterviews(data.items);
          setTotalInterviews(data.total);
        } else if (res.status === 401) {
          router.push("/login?auth=expired");
        }
      } catch (error) {
        console.error("Failed to fetch interviews:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInterviews();
  }, [currentPage, router]);

  const activeJobsCount = new Set(interviews.map(i => i.job_title)).size;
  const interviewsWithScores = interviews.filter(i => i.evaluation?.overall_score !== undefined);
  const avgMatch = interviewsWithScores.length > 0 
    ? Math.round(interviewsWithScores.reduce((sum, i) => sum + (i.evaluation?.overall_score || 0), 0) / interviewsWithScores.length)
    : 0;

  const stats = [
    { label: "Active Jobs", value: activeJobsCount.toString(), color: "text-blue-400" },
    { label: "Total Candidates", value: interviews.length.toString(), color: "text-purple-400" },
    { label: "Pending Reviews", value: interviews.filter(i => i.status === 'pending').length.toString(), color: "text-amber-400" },
    { label: "Avg. Match", value: `${avgMatch}%`, color: "text-emerald-400" },
  ];

  const filteredInterviews = interviews.filter((interview) => 
    interview.candidate.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    interview.job_title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(totalInterviews / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-[#0a0f1a] p-6 lg:p-10 text-gray-100">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Page Title & Actions */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
              HR <span className="text-indigo-500">Dashboard</span>
            </h1>
            <p className="text-gray-400">Manage candidate assessments and AI-driven insights.</p>
          </div>
          <div className="flex gap-3">
            <a 
              href={`${BACKEND_URL}/export-dataset?format=csv`}
              download="voxassess_dataset.csv"
              className="px-4 py-2 rounded-lg bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-emerald-400 transition text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Dataset (CSV)
            </a>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-gray-500">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Live Interview Creator */}
        <section className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-6 lg:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 space-y-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Generate Live Session
              </h2>
              <p className="text-indigo-200/70 text-sm">Create a secure, one-time link for a real-time AI-monitored interview.</p>
            </div>
            
            <div className="flex-1 w-full bg-[#0a0f1a]/50 p-6 rounded-xl border border-white/5">
              {!meetingLink ? (
                <form onSubmit={handleCreateSession} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-400">Candidate Name</label>
                      <input 
                        type="text" required
                        value={candidateName} onChange={e => setCandidateName(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                        placeholder="e.g. Jane Doe"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-400">Job Role</label>
                      <input 
                        type="text" required
                        value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                        placeholder="e.g. Senior Developer"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isCreatingSession}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition"
                  >
                    {isCreatingSession ? "Generating..." : "Generate Link"}
                  </button>
                </form>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Session Ready</label>
                    <div className="flex items-center gap-2 bg-[#111827] border border-emerald-500/30 rounded-lg p-1 pl-4">
                      <span className="text-sm font-mono text-gray-300 truncate w-full select-all">{meetingLink}</span>
                      <button onClick={copyLink} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md transition flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {copied && (
                        <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap pr-2 animate-pulse">Copied!</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setMeetingLink(""); setMeetingPath(""); setCopied(false); }} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-lg transition text-sm">
                      Create Another
                    </button>
                    <Link href={meetingPath} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center transition text-sm group">
                      Join as Host <span className="inline-block group-hover:translate-x-1 transition-transform">→</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Candidate Table */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Recent Assessments</h2>
            <div className="relative flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Page {currentPage + 1} of {totalPages}
              </span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates..." 
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 w-64 text-white"
              />
            </div>
          </div>
          
          <div className="overflow-hidden rounded-2xl border border-[#1e293b] bg-[#111827]">
            {isLoading ? (
              <div className="p-20 text-center text-gray-500">Loading assessments...</div>
            ) : interviews.length === 0 ? (
              /* Empty State */
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <svg className="w-16 h-16 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 text-sm max-w-sm">No assessments yet. Candidates will appear here after completing interviews.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 border-b border-[#1e293b]">
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Candidate</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Position</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Score</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {filteredInterviews.map((interview) => {
                    const score = interview.evaluation?.overall_score;
                    const hasScore = score !== undefined && score !== null;
                    const roundedScore = hasScore ? Math.round(score) : 0;
                    const scoreColor = hasScore
                      ? roundedScore >= 80 ? 'text-emerald-400' : roundedScore >= 60 ? 'text-amber-400' : 'text-red-400'
                      : '';
                    const barColor = hasScore
                      ? roundedScore >= 80 ? 'bg-emerald-500' : roundedScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      : 'bg-gray-600';

                    return (
                      <tr key={interview.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-medium text-white">{interview.candidate.full_name}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">{interview.job_title}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">{new Date(interview.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          {hasScore ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                                <div className={`h-full ${barColor}`} style={{ width: `${roundedScore}%` }} />
                              </div>
                              <span className={`text-xs font-bold ${scoreColor}`}>{roundedScore}%</span>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-gray-500/10 text-gray-400 border border-gray-500/20">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                            interview.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                            interview.status === 'flagged' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {interview.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/reports/${interview.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium text-sm">Review Results</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {!isLoading && totalInterviews > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
                disabled={currentPage === 0}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
