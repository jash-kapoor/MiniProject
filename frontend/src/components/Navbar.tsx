"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL } from "@/app/config";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}/users/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout request failed:", e);
    }
    localStorage.removeItem("voxassess_token");
    setIsLoggedIn(false);
    setUserEmail(null);
    setUserRole(null);
    router.push("/");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("voxassess_token");
      if (token) {
        setIsLoggedIn(true);
        try {
          // Optionally fetch user info to show in navbar
          const res = await fetch(`${BACKEND_URL}/users/me`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUserEmail(data.email);
            setUserRole(data.role);
          } else if (res.status === 401) {
            // Token expired
            handleLogout();
          }
        } catch (error) {
          console.error("Failed to fetch user:", error);
        }
      } else {
        setIsLoggedIn(false);
        setUserEmail(null);
        setUserRole(null);
      }
    };

    checkAuth();
    
    // Listen for storage changes (in case of login/logout in other tabs)
    window.addEventListener("storage", checkAuth);
    return () => window.removeEventListener("storage", checkAuth);
  }, [pathname, handleLogout]);

  // Hide Navbar during active interview
  if (pathname?.startsWith("/interview")) return null;

  const navLinks = [
    { name: "Home", href: "/" },
  ];

  if (isLoggedIn) {
    if (userRole === "hr" || userRole === "admin") {
      navLinks.push({ name: "HR Dashboard", href: "/hr-dashboard" });
    } else {
      navLinks.push({ name: "Dashboard", href: "/dashboard" });
      navLinks.push({ name: "Practice", href: "/practice" });
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6">
      <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#111827]/80 backdrop-blur-xl border border-white/10 shadow-2xl">
        <Link href="/" className="flex items-center mr-4">
          <span className="text-xl font-black tracking-tighter text-white">
            Vox<span className="text-blue-500">Assess</span>
          </span>
        </Link>
        
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3 ml-4 pl-4 border-l border-white/10">
          {isLoggedIn ? (
            <>
              {userEmail && (
                <span className="text-xs text-gray-500 max-w-[120px] truncate hidden md:block">
                  {userEmail}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 rounded-full text-sm font-medium text-white bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-all duration-300 border border-white/5"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="px-4 py-1.5 rounded-full text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all duration-300"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
