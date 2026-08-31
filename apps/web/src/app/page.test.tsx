import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "./providers";
import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  });

  it("meminta autentikasi sebelum menampilkan workspace", async () => {
    render(<Providers>{await Home()}</Providers>);

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama pengguna")).toBeInTheDocument();
    expect(screen.getByLabelText("Kata sandi")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("heading", { name: "Selamat Datang, Admin." })).not.toBeInTheDocument();
  });
});
