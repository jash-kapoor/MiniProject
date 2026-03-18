"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { BACKEND_URL } from "@/app/config";

type UserInfo = {
  full_name: string;
  email: string;
};

export default function HomeHR({ user }: { user: UserInfo }) {
  const [meetingLink, setMeetingLink] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const generateLink = async () => {
    setIsGenerating(true);
    setError("");
    setCopied(false);
    try {
      const token = localStorage.getItem("voxassess_token");

      // Create an interview record first
      const intRes = await fetch(`${BACKEND_URL}/interviews/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_title: "Live Interview", candidate_id: 1 }),
      });

      if (!intRes.ok) throw new Error("Failed to create interview");
      const interviewData = await intRes.json();

      // Generate a live session
      const liveRes = await fetch(
        `${BACKEND_URL}/live-sessions?interview_id=${interviewData.id}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!liveRes.ok) throw new Error("Failed to generate live session");
      const liveData = await liveRes.json();

      const link = `${window.location.origin}/interview/live/${liveData.meetingId}`;
      setMeetingLink(link);
    } catch (err) {
      console.error("Session creation error:", err);
      setError("Failed to generate session link. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const firstName = user.full_name?.split(" ")[0] || "Recruiter";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0a0f1a] text-gray-100 overflow-hidden">
      <div className="relative flex flex-col items-center max-w-4xl w-full text-center space-y-10">
        {/* Decorative blurs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse"
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
            Welcome back, {firstName} 👔
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            Start evaluating candidates efficiently
          </motion.p>

          {/* CTA: Go to HR Dashboard */}
          <motion.div
            variants={itemVariants}
            className="pt-4 flex justify-center"
          >
            <Link
              href="/hr-dashboard"
              className="group relative flex flex-col items-center justify-center px-10 py-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-all duration-300 shadow-xl shadow-indigo-600/20 overflow-hidden transform hover:-translate-y-1"
            >
              <span className="text-xl font-bold text-white mb-1">
                🚀 Start New Interview
              </span>
              <span className="text-sm text-indigo-100 font-medium">
                Go to your HR dashboard
              </span>
            </Link>
          </motion.div>

          {/* Generate Meeting Link Card */}
          <motion.div
            variants={itemVariants}
            className="pt-4 max-w-lg mx-auto w-full"
          >
            <div className="p-6 rounded-2xl bg-[#111827] border border-[#1e293b] space-y-5">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <h2 className="text-lg font-bold text-white">
                  Generate Interview Link
                </h2>
              </div>

              <p className="text-sm text-gray-400">
                Create a secure, one-time link for a real-time AI-monitored
                interview session.
              </p>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {!meetingLink ? (
                <button
                  onClick={generateLink}
                  disabled={isGenerating}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    "🔗 Generate Interview Link"
                  )}
                </button>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Session Ready
                    </label>
                    <div className="flex items-center gap-2 bg-[#0a0f1a] border border-emerald-500/30 rounded-lg p-1 pl-4">
                      <span className="text-sm font-mono text-gray-300 truncate w-full select-all">
                        {meetingLink}
                      </span>
                      <button
                        onClick={copyLink}
                        className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md transition flex-shrink-0"
                      >
                        {copied ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setMeetingLink("");
                        setError("");
                      }}
                      className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-lg transition text-sm"
                    >
                      Generate Another
                    </button>
                    <Link
                      href={meetingLink.replace(
                        typeof window !== "undefined"
                          ? window.location.origin
                          : "",
                        ""
                      )}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center transition text-sm group"
                    >
                      Join as Host{" "}
                      <span className="inline-block group-hover:translate-x-1 transition-transform">
                        →
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
