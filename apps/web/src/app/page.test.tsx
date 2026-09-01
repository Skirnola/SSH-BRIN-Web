import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "./providers";
import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  });

  it("meminta autentikasi dan dapat menampilkan atau menyembunyikan kata sandi", async () => {
    const user = userEvent.setup();
    render(<Providers>{await Home()}</Providers>);

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama pengguna")).toBeInTheDocument();
    const password = screen.getByLabelText("Kata sandi");
    const toggle = screen.getByRole("button", { name: "Tampilkan kata sandi" });
    expect(password).toHaveAttribute("type", "password");

    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Sembunyikan kata sandi" }));
    expect(password).toHaveAttribute("type", "password");
    expect(screen.queryByRole("heading", { name: "Selamat Datang, Admin." })).not.toBeInTheDocument();
  });
});
