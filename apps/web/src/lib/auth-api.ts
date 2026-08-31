const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type SessionUser = { username: string };

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch(`${API_URL}/api/v1/auth/session`, {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Layanan autentikasi tidak tersedia");
  return response.json() as Promise<SessionUser>;
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Nama pengguna atau kata sandi salah");
  }
  return response.json() as Promise<SessionUser>;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/v1/auth/session`, {
    method: "DELETE",
    credentials: "include",
  });
}
