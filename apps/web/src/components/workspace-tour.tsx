"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

const STORAGE_KEY = "brin-workspace-tour-v1";

const steps = [
  {
    target: "tour-workspace",
    eyebrow: "Petunjuk 1 dari 3",
    title: "Berkas workspace",
    body: "Telusuri folder dan pilih berkas Jetson dari panel ini. Workspace hanya dapat membaca berkas yang diizinkan di dalam direktori BRIN.",
  },
  {
    target: "tour-code",
    eyebrow: "Petunjuk 2 dari 3",
    title: "Kode dan jalankan deteksi",
    body: "Isi berkas terpilih ditampilkan sebagai kode hanya-baca. Tombol Jalankan deteksi hanya muncul pada script deteksi yang telah disetujui—bukan untuk menjalankan perintah bebas.",
  },
  {
    target: "tour-camera",
    eyebrow: "Petunjuk 3 dari 3",
    title: "Tampilan kamera",
    body: "Lihat frame kamera terbaru di sini. Gunakan tombol perbesar untuk membuka tampilan penuh, lalu pilih Gambar atau Real-Time Cam.",
  },
] as const;

type Rect = { top: number; left: number; width: number; height: number };

export function WorkspaceTour({ request = 0, onStepChange }: { request?: number; onStepChange?: (step: number | null) => void }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  const updateRect = useCallback(() => {
    const target = document.getElementById(steps[step].target);
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    setRect({ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height });
  }, [step]);

  const open = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "complete") {
      const timer = window.setTimeout(open, 650);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (request <= 0) return;
    const timer = window.setTimeout(open, 0);
    return () => window.clearTimeout(timer);
  }, [request, open]);

  useEffect(() => {
    onStepChange?.(active ? step : null);
    if (!active) return;
    const initialUpdate = window.requestAnimationFrame(updateRect);
    const delayedUpdate = window.setTimeout(updateRect, 380);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    nextButton.current?.focus();
    return () => {
      window.cancelAnimationFrame(initialUpdate);
      window.clearTimeout(delayedUpdate);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, step, updateRect, onStepChange]);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "complete");
    setActive(false);
    setRect(null);
  };

  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });

  if (!active || !rect) return null;

  const tooltipWidth = Math.min(370, window.innerWidth - 32);
  const gap = 15;
  let tooltipTop = Math.max(16, rect.top);
  let tooltipLeft = rect.left + rect.width + gap;
  if (tooltipLeft + tooltipWidth > window.innerWidth - 16) {
    tooltipLeft = Math.min(Math.max(16, rect.left), window.innerWidth - tooltipWidth - 16);
    tooltipTop = rect.top + rect.height + gap;
  }
  if (tooltipTop + 270 > window.innerHeight - 16) {
    tooltipTop = Math.max(16, rect.top - 270 - gap);
  }

  const highlightStyle: CSSProperties = {
    top: Math.max(6, rect.top - 6),
    left: Math.max(6, rect.left - 6),
    width: Math.min(window.innerWidth - 12, rect.width + 12),
    height: Math.min(window.innerHeight - 12, rect.height + 12),
  };
  const tooltipStyle: CSSProperties = { top: tooltipTop, left: tooltipLeft, width: tooltipWidth };
  const current = steps[step];

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-highlight" style={highlightStyle} aria-hidden="true" />
      <section key={step} className="tour-card" style={tooltipStyle}>
        <div className="tour-card-top"><span>{current.eyebrow}</span><button type="button" onClick={close} aria-label="Lewati petunjuk"><Icon name="x" /></button></div>
        <span className="tour-icon"><Icon name={step === 0 ? "folder" : step === 1 ? "code" : "camera"} /></span>
        <h2 id="tour-title">{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-progress" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>{steps.map((_, index) => <i key={index} className={index === step ? "active" : undefined} />)}</div>
        <div className="tour-actions">
          {step > 0 ? <button className="tour-back" type="button" onClick={() => setStep((value) => value - 1)}>Kembali</button> : <button className="tour-back" type="button" onClick={close}>Lewati</button>}
          <button ref={nextButton} className="tour-next" type="button" onClick={() => step === steps.length - 1 ? close() : setStep((value) => value + 1)}>{step === steps.length - 1 ? "Selesai" : "Berikutnya"}<Icon name="arrow-right" /></button>
        </div>
      </section>
    </div>
  );
}
