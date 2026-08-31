"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthGate } from "@/components/auth-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15_000 },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}><AuthGate>{children}</AuthGate></QueryClientProvider>;
}
