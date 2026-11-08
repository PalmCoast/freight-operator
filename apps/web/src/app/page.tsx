import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { Providers } from "@/lib/api";

export default function HomePage() {
  return (
    <Providers>
      <Suspense fallback={<p className="p-8 text-ink-soft">Opening the desk…</p>}>
        <Dashboard />
      </Suspense>
    </Providers>
  );
}
