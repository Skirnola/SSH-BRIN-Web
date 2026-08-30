export type WorkspaceFile = {
  id: string;
  name: string;
  path: string;
  language: "python" | "yaml" | "markdown";
  runnable: boolean;
  source: string;
};

export const workspaceFiles: WorkspaceFile[] = [
  {
    id: "vehicle-detection",
    name: "deteksi_kendaraan.py",
    path: "edge-vision/kamera-gerbang/deteksi_kendaraan.py",
    language: "python",
    runnable: true,
    source: `# Analisis kamera gerbang utara · BRIN
from edge_vision import Camera, Detector

camera = Camera("CAM-GU-01")
detector = Detector(model="vehicle-v4")

def inspect_frame(frame):
    results = detector.track(frame)
    for item in results:
        if item.confidence > 0.85:
            camera.publish(item)
    return results

with camera.stream() as stream:
    for frame in stream:
        inspect_frame(frame)`,
  },
  {
    id: "gate-device",
    name: "device.yaml",
    path: "edge-vision/kamera-gerbang/device.yaml",
    language: "yaml",
    runnable: false,
    source: `# Konfigurasi perangkat gerbang utara
site: KST-Samaun-Samadikun
node: JETSON-ORIN-07

camera:
  id: CAM-GU-01
  resolution: 1920x1080
  sample_rate: 24fps

health_check:
  interval: 30s
  temperature_limit: 75C
  notify_team: true`,
  },
  {
    id: "parking-monitor",
    name: "monitor.py",
    path: "edge-vision/kamera-parkir/monitor.py",
    language: "python",
    runnable: false,
    source: `# Monitor kamera area parkir
from edge_vision import CameraHealth

monitor = CameraHealth("CAM-PK-02")
status = monitor.inspect()

print(status.summary())`,
  },
  {
    id: "readme",
    name: "README.md",
    path: "edge-vision/README.md",
    language: "markdown",
    runnable: false,
    source: `# Edge Vision

Workspace untuk layanan kamera dan deteksi pada perangkat Jetson BRIN.

## Perhatian

Berkas pada layar ini hanya dapat dibaca. Setiap operasi dicatat dalam log audit.`,
  },
];
