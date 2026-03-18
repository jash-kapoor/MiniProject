"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";

import { BACKEND_URL } from "@/app/config";

type Evaluation = {
  overall_score: number;
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

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("voxassess_token");
    if (!token) {
      router.push("/login?auth=required");
      return;
    }

    async function fetchUserSessions() {
      try {
        const res = await fetch(`${BACKEND_URL}/users/me/interviews`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.status === 401) {
          router.push("/login?auth=expired");
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setInterviews(data);
        }
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchUserSessions();
  }, [router]);

  const completedInterviews = interviews.filter(i => i.status === 'completed');
  const avgScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((acc, curr) => acc + (curr.evaluation?.overall_score || 0), 0) / completedInterviews.length)
    : 0;

  return (
    <main className="min-h-screen bg-[#0a0f1a] p-6 lg:p-10 text-gray-100">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Page Title & Action */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
              Candidate <span className="text-blue-500">Practice</span>
            </h1>
            <p className="text-gray-400">Welcome back! Ready to sharpen your skills?</p>
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
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Average Score</p>
            <p className="text-3xl font-bold text-white">{avgScore}%</p>
          </div>
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Total Sessions</p>
            <p className="text-3xl font-bold text-white">{interviews.length}</p>
          </div>
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b]">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Completed</p>
            <p className="text-3xl font-bold text-white">{completedInterviews.length}</p>
          </div>
        </div>

        {/* Recent Activity */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Recent Sessions</h2>
          <div className="overflow-hidden rounded-2xl border border-[#1e293b] bg-[#111827]">
            {isLoading ? (
              <div className="p-20 text-center text-gray-500">Loading your sessions...</div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 border-b border-[#1e293b]">
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Category</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Score</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {interviews.map((session) => (
                    <tr key={session.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 text-gray-300">{new Date(session.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-medium text-white">{session.job_title}</td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        <span className="capitalize">{session.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          (session.evaluation?.overall_score || 0) >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 
                          (session.evaluation?.overall_score || 0) >= 60 ? 'bg-amber-500/10 text-amber-400' : 
                          session.status === 'completed' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {session.evaluation?.overall_score ? `${Math.round(session.evaluation.overall_score)}%` : 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/reports/${session.id}`} className="text-blue-400 hover:text-blue-300 font-medium text-sm">View Report</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

