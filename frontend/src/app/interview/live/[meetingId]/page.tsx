"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StreamVideo, StreamVideoClient, Call, StreamTheme, SpeakerLayout, CallControls, StreamCall } from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { BACKEND_URL } from '@/app/config';

export default function LiveMeetingPage() {
  const params = useParams();
  const meetingId = params?.meetingId as string;
  const router = useRouter();
  
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [role, setRole] = useState<"hr" | "candidate" | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState("");

  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const monitorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = stream;
      }

      monitorIntervalRef.current = setInterval(async () => {
        if (hiddenVideoRef.current && hiddenVideoRef.current.readyState >= 2) {
          const video = hiddenVideoRef.current;
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async (blob) => {
              if (blob) {
                const formData = new FormData();
                formData.append("file", blob, "frame.jpg");
                let currentInterviewId = interviewId;
                if (!currentInterviewId) {
                   // Try to get from meeting info endpoint if not ready
                   currentInterviewId = "1"; // fallback for monitor if ID missing
                }

                try {
                  const token = localStorage.getItem("voxassess_token");
                  const res = await fetch(`${BACKEND_URL}/detect`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData,
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.is_suspicious) {
                      setAlerts(data.alerts || []);
                      setIsSuspicious(true);
                      // In a real app we would broadcast this via Stream Custom Events to HR
                    } else {
                      setAlerts([]);
                      setIsSuspicious(false);
                    }
                  }
                } catch (e) {
                  // Ignore
                }
              }
            }, "image/jpeg", 0.7);
          }
        }
      }, 2000);
    } catch(err) {
      console.error("Failed to start hidden monitoring camera", err);
    }
  };

  useEffect(() => {
    if (!meetingId || !hasJoined) return;

    let streamClient: StreamVideoClient | null = null;

    async function initClient() {
      const token = localStorage.getItem("voxassess_token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/stream/token`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) {
           setError("Failed to get stream token from backend.");
           return;
        }
        
        const data = await res.json();
        const apiKey = data.api_key;
        
        if (apiKey === "placeholder_api_key") {
            setError("Stream API keys not configured. Please supply STREAM_API_KEY to the backend .env.");
            return;
        }

        const user = { id: data.user_id, name: data.name, role: role === 'hr' ? 'admin' : 'user' };
        streamClient = new StreamVideoClient({ apiKey, user, token: data.token });
        
        const sessionCall = streamClient.call('default', meetingId);
        await sessionCall.join({ create: true });
        
        setClient(streamClient);
        setCall(sessionCall);

        if (role === "candidate") {
            startMonitoring();
        }
      } catch (e) {
        console.error("Stream init error:", e);
        setError("Failed to initialize Stream Video.");
      }
    }

    initClient();

    return () => {
      if (streamClient) {
        streamClient.disconnectUser();
      }
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
      }
      if (hiddenVideoRef.current?.srcObject) {
         (hiddenVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [meetingId, router, hasJoined, role]);

  const endCall = () => {
    call?.leave();
    router.push(role === "hr" ? "/hr-dashboard" : "/dashboard");
  };

  if (!hasJoined) {
    return (
      <main className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-6">
        <div className="bg-[#111827] border border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Join Live Interview</h2>
            <p className="text-gray-400 mb-8 text-sm">Select your role to join the secure Stream Video room.</p>
            {error && <p className="text-red-400 mb-4">{error}</p>}
            <div className="flex flex-col w-full gap-3">
            <button
                onClick={() => { setRole("hr"); setHasJoined(true); }}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition"
            >
                Start as HR / Admin
            </button>
            <button
                onClick={() => { setRole("candidate"); setHasJoined(true); }}
                className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition border border-gray-700"
            >
                Join as Candidate
            </button>
            </div>
        </div>
      </main>
    );
  }

  if (!client || !call) {
    return (
       <div className="min-h-screen bg-[#0a0f1a] text-white flex flex-col items-center justify-center space-y-4">
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
         <p className="text-gray-400 font-medium">{error || "Connecting to secure live interview room via Stream..."}</p>
       </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0f1a] p-4 lg:p-8 flex flex-col items-center justify-center relative">
      <video ref={hiddenVideoRef} className="hidden" autoPlay playsInline muted />
      
      <div className="w-full max-w-7xl relative mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_60px_-15px_rgba(79,70,229,0.3)]">
         {/* Top Bar overlay */}
         <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center pointer-events-none">
            <div className="flex items-center gap-3">
               <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse-glow" />
               <span className="font-bold text-white tracking-widest uppercase text-sm drop-shadow-md">Live Session : {meetingId}</span>
            </div>
            
            <div className="hidden md:flex items-center gap-2">
               <span className="px-3 py-1 rounded bg-black/50 text-emerald-400 text-xs font-bold border border-emerald-500/30 backdrop-blur-md">Powered by Stream SDK</span>
            </div>
         </div>

         {/* Proctoring Banner for Candidate */}
         {role === 'candidate' && isSuspicious && alerts.length > 0 && (
             <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 backdrop-blur-md px-6 py-2 rounded-full border border-red-400 shadow-xl shadow-red-900/50 animate-bounce">
                 <span className="text-white font-bold text-sm">⚠️ Suspicious Activity: {alerts.join(", ")}</span>
             </div>
         )}

         {/* Stream Video Context */}
        <StreamVideo client={client}>
          <StreamTheme as="div" className="str-video">
            <StreamCall call={call}>
              <div className="h-[80vh] bg-black relative flex flex-col">
                <SpeakerLayout />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                   <div className="bg-[#111827]/90 backdrop-blur-xl px-8 py-3 rounded-2xl border border-white/10 shadow-2xl flex gap-4 overflow-hidden">
                      <CallControls onLeave={endCall} />
                   </div>
                </div>
              </div>
            </StreamCall>
          </StreamTheme>
        </StreamVideo>
      </div>
    </main>
  );
}
