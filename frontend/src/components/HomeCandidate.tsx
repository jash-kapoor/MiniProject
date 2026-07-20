"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/app/config";

type UserInfo = {
  full_name: string;
  email: string;
};

type InterviewStat = {
  total: number;
  avgScore: number;
};

export default function HomeCandidate({ user }: { user: UserInfo }) {
  const [stats, setStats] = useState<InterviewStat>({ total: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = localStorage.getItem("voxassess_token");
        const res = await fetch(`${BACKEND_URL}/users/me/interviews`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const completed = data.filter(
            (i: { status: string; evaluation?: { overall_score?: number } }) =>
              i.status === "completed" && i.evaluation?.overall_score
          );
          const avg =
            completed.length > 0
              ? completed.reduce(
                (sum: number, i: { evaluation?: { overall_score?: number } }) =>
                  sum + (i.evaluation?.overall_score || 0),
                0
              ) / completed.length
              : 0;
          setStats({ total: data.length, avgScore: Math.round(avg) });
        }
      } catch (err) {
        console.error("Failed to fetch interview stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 260, damping: 22 },
    },
  };

  const firstName = user.full_name?.split(" ")[0] || "there";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0a0f1a] text-gray-100 overflow-hidden">
      <div className="relative flex flex-col items-center max-w-4xl w-full text-center space-y-10">
        {/* Decorative blurs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />

        <motion.div
          className="space-y-6 relative z-10 w-full"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Welcome */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight"
          >
            Welcome back, {firstName} 👋
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            Ready to improve your interview skills today?
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-xl mx-auto"
          >
            <Link
              href="/practice"
              className="group relative flex flex-col items-center justify-center p-6 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all duration-300 shadow-xl shadow-blue-600/20 overflow-hidden transform hover:-translate-y-1"
            >
              <span className="text-xl font-bold text-white mb-1">
                🎤 Start Practice Interview
              </span>
              <span className="text-sm text-blue-100 font-medium">
                Sharpen your responses with AI
              </span>
            </Link>

            <Link
              href="/dashboard"
              className="group relative flex flex-col items-center justify-center p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden transform hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/0 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-xl font-bold text-white mb-1">
                📊 View Progress Dashboard
              </span>
              <span className="text-sm text-gray-400 group-hover:text-indigo-300 transition-colors">
                Track your improvement over time
              </span>
            </Link>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            variants={itemVariants}
            className="pt-6 grid grid-cols-2 gap-6 max-w-md mx-auto"
          >
            <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] text-center">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-gray-500">
                Total Interviews
              </p>
              <p className="text-3xl font-bold text-blue-400">
                {loading ? "-" : stats.total}
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] text-center">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-gray-500">
                Average Score
              </p>
              <p className="text-3xl font-bold text-emerald-400">
                {loading ? "-" : stats.avgScore > 0 ? `${stats.avgScore}%` : "N/A"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
