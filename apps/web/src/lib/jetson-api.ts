export type RemoteFileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
};

export type DirectoryListing = {
  device: string;
  workspace: string;
  path: string;
  entries: RemoteFileEntry[];
};

export type RemoteFileContent = {
  name: string;
  path: string;
  language: "python" | "yaml" | "json" | "markdown" | "text" | "log";
  size: number;
  content: string;
};

export type SystemHealth = {
  camera: {
    id: string;
    ip: string;
    status: "online" | "offline";
    latency_ms: number | null;
  };
  jetson: {
    id: string;
    status: "healthy" | "warning";
    gpu_percent: number;
    temperature_c: number;
    memory_used_mb: number;
    memory_total_mb: number;
    storage_percent: number;
    uptime_seconds: number;
  };
  updated_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function listJetsonFiles(path = ""): Promise<DirectoryListing> {
  const response = await fetch(
    `${API_URL}/api/v1/workspaces/default/files?path=${encodeURIComponent(path)}`,
  );

  if (!response.ok) {
    throw new Error("Jetson tidak dapat dijangkau");
  }

  return response.json() as Promise<DirectoryListing>;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const response = await fetch(`${API_URL}/api/v1/system/health`);
  if (!response.ok) throw new Error("Kondisi perangkat tidak dapat dibaca");
  return response.json() as Promise<SystemHealth>;
}

export function getCameraFrameUrl(version: number): string {
  return `${API_URL}/api/v1/cameras/main/frame?v=${version}`;
}

export async function readJetsonFile(path: string): Promise<RemoteFileContent> {
  const response = await fetch(
    `${API_URL}/api/v1/workspaces/default/file?path=${encodeURIComponent(path)}`,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Berkas tidak dapat dibaca");
  }

  return response.json() as Promise<RemoteFileContent>;
}
