"use client";

import { usePathname } from "next/navigation";

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInterview = pathname?.startsWith("/interview");

  return (
    <div className={isInterview ? "" : "pt-20"}>
      {children}
    </div>
  );
}
