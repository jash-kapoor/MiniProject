"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/app/config";
import HomeCandidate from "@/components/HomeCandidate";
import HomeHR from "@/components/HomeHR";

type UserInfo = {
  full_name: string;
  email: string;
  role: string;
};

export default function Home() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem("voxassess_token");
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/users/me`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setAuthChecked(true);
      }
    }
    checkAuth();
  }, []);

  // Show nothing until auth is resolved to avoid flash
  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0f1a]">
        <div className="animate-pulse text-gray-500 text-sm">Loading...</div>
      </main>
    );
  }

  // --- Logged-in views ---
  if (user) {
    if (user.role === "hr" || user.role === "recruiter" || user.role === "admin") {
      return <HomeHR user={user} />;
    }
    return <HomeCandidate user={user} />;
  }

  // --- Generic landing page (not logged in) ---
  return <GenericLandingPage />;
}

function GenericLandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0a0f1a] text-gray-100 overflow-hidden">
      <div className="relative flex flex-col items-center max-w-4xl w-full text-center space-y-12">
        {/* Decorative background elements */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />

        <motion.div
          className="space-y-6 relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <motion.h1
            variants={itemVariants}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-2 leading-tight"
          >
            VoxAssess <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">
              AI Interview Platform
            </span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            The future of talent assessment. Intelligent, unbiased, and
            data-driven evaluation powered by advanced AI and computer vision.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-xl mx-auto"
          >
            <Link
              href="/signup"
              className="group relative flex flex-col items-center justify-center p-6 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all duration-300 shadow-xl shadow-blue-600/20 overflow-hidden transform hover:-translate-y-1"
            >
              <span className="text-xl font-bold text-white mb-1">
                Get Started
              </span>
              <span className="text-sm text-blue-100 font-medium">
                Create your candidate profile
              </span>
            </Link>

            <Link
              href="/login"
              className="group relative flex flex-col items-center justify-center p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden transform hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/0 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-xl font-bold text-white mb-1">
                Sign In
              </span>
              <span className="text-sm text-gray-400 group-hover:text-indigo-300 transition-colors">
                Access your dashboard
              </span>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="pt-16 relative z-10"
        >
          <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-6 text-center">
            Powered By cutting-edge AI
          </p>
          <div className="flex flex-wrap items-center gap-6 md:gap-10 justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
            <span className="text-sm md:text-base font-bold text-gray-300 font-mono tracking-tight">
              Whisper AI
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
            <span className="text-sm md:text-base font-bold text-gray-300 font-mono tracking-tight">
              MediaPipe
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
            <span className="text-sm md:text-base font-bold text-gray-300 font-mono tracking-tight">
              OpenCV
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
            <span className="text-sm md:text-base font-bold text-gray-300 font-mono tracking-tight">
              YOLOv8
            </span>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
