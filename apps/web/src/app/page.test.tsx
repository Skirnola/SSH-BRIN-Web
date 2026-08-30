import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("menampilkan ruang kerja utama", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}>{await Home()}</QueryClientProvider>);

    expect(screen.getByRole("heading", { name: "Selamat pagi, Iqbal." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tampilan kamera" })).toBeInTheDocument();
    expect(screen.getAllByText("Hanya baca").length).toBeGreaterThan(0);
  });
});
