export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export const WS_BACKEND_URL = BACKEND_URL.replace(/^http/, "ws");
