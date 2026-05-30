import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Icon } from "./shared";

const CameraScanner = ({ onDetect, onClose, onFilePick, onCapture }) => {
  const qrRef = useRef(null);
  const containerId = "camera-scanner-region";
  const [cameras, setCameras] = useState([]);
  const [activeCam, setActiveCam] = useState(null);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("barcode");
  const modeRef = useRef("barcode");
  const fileRef = useRef(null);
  const startedRef = useRef(false);
  const unmountedRef = useRef(false);

  // Keep modeRef in sync so the qr.start callback (registered once) reads the latest mode.
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Mirror the preview for front-facing cameras so the user sees a natural
  // selfie-view (raw front-camera streams are not pre-mirrored by the browser).
  // Back/environment cameras stay un-mirrored. CSS transform only affects the
  // preview; html5-qrcode's decode and captureFrame() read the raw video frames.
  useEffect(() => {
    if (status !== "scanning") return;
    const root = document.getElementById(containerId);
    const video = root?.querySelector("video");
    if (!video) return;
    const label = cameras.find((c) => c.id === activeCam)?.label || "";
    const isBack = /back|rear|environment/i.test(label);
    video.style.transform = isBack ? "" : "scaleX(-1)";
  }, [status, activeCam, cameras]);

  const killTracks = () => {
    // Aggressively stop tracks on every video element in the document,
    // not just ours — html5-qrcode sometimes duplicates or relocates videos.
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      const stream = video.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
      try { video.srcObject = null; } catch {}
      try { video.pause(); } catch {}
      try { video.removeAttribute("src"); video.load(); } catch {}
    });
  };

  const stopCamera = async () => {
    const qr = qrRef.current;
    qrRef.current = null;
    if (qr) {
      if (startedRef.current) {
        try { await qr.stop(); } catch {}
      }
      try { qr.clear(); } catch {}
    }
    startedRef.current = false;
    killTracks();
  };

  const startCamera = async (deviceId) => {
    await stopCamera();
    if (unmountedRef.current) return;
    setStatus("starting");
    setError(null);
    try {
      const qr = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ],
        useBarCodeDetectorIfSupported: true,
      });
      qrRef.current = qr;
      await qr.start(
        deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        {
          fps: 25,
          qrbox: { width: 280, height: 200 },
          aspectRatio: 1.333,
          disableFlip: true,
          videoConstraints: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: "continuous",
          },
        },
        async (decoded) => {
          if (modeRef.current !== "barcode") return;
          unmountedRef.current = true;
          killTracks();
          await stopCamera();
          killTracks();
          onDetect(decoded);
        },
        () => {}
      );
      if (unmountedRef.current) { await stopCamera(); return; }
      startedRef.current = true;
      setStatus("scanning");
    } catch (err) {
      setError(err?.message || "Could not access camera");
      setStatus("error");
      killTracks();
    }
  };

  useEffect(() => {
    unmountedRef.current = false;
    Html5Qrcode.getCameras()
      .then((devs) => {
        if (unmountedRef.current) return;
        setCameras(devs || []);
        const back = devs.find((d) => /back|rear|environment/i.test(d.label));
        const chosen = back?.id || devs[0]?.id || null;
        setActiveCam(chosen);
        startCamera(chosen);
      })
      .catch((err) => {
        setError(err?.message || "No camera available");
        setStatus("error");
      });
    return () => {
      unmountedRef.current = true;
      stopCamera();
      setTimeout(killTracks, 50);
    };
  }, []);

  const close = async () => {
    unmountedRef.current = true;
    killTracks();
    await stopCamera();
    killTracks();
    onClose();
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex((c) => c.id === activeCam);
    const next = cameras[(idx + 1) % cameras.length];
    setActiveCam(next.id);
    startCamera(next.id);
  };

  const handleFile = async (file) => {
    unmountedRef.current = true;
    killTracks();
    await stopCamera();
    killTracks();
    onFilePick(file);
  };

  const captureFrame = () => {
    const root = document.getElementById(containerId);
    const video = root?.querySelector("video");
    if (!video || !video.videoWidth) return null;
    const max = 800;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > max || h > max) {
      if (w > h) { h = Math.round(h * max / w); w = max; }
      else { w = Math.round(w * max / h); h = max; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const identifyFromCamera = async () => {
    const base64 = captureFrame();
    if (!base64) return;
    // Release camera BEFORE calling onCapture so the stream can't leak
    // through the unmount race.
    unmountedRef.current = true;
    killTracks();
    await stopCamera();
    killTracks();
    onCapture && onCapture(base64);
  };

  const title = mode === "barcode" ? "Scan Barcode" : "Identify Product";
  const hint = status !== "scanning"
    ? (status === "starting" ? "Requesting camera access..." : "")
    : mode === "barcode" ? "Point the camera at a barcode"
    : "Frame the product and tap Capture";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="camera" size={18} />
            <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
          </div>
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={close}><Icon name="x" size={14} /></button>
        </div>

        <div style={{ display: "flex", padding: "10px 14px 0", gap: 6 }}>
          {[
            { k: "barcode", l: "Barcode", icon: "barcode" },
            { k: "identify", l: "Product Photo", icon: "camera" },
          ].map((t) => (
            <button key={t.k} onClick={() => setMode(t.k)} style={{
              flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
              background: mode === t.k ? "rgba(124,58,237,0.12)" : "transparent",
              color: mode === t.k ? "var(--primary-light, #A78BFA)" : "var(--text-muted)",
              fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontFamily: "'Sora',sans-serif", transition: "all 0.15s",
            }}>
              <Icon name={t.icon} size={12} /> {t.l}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", background: "#000", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", margin: 14, borderRadius: 10, overflow: "hidden" }}>
          <div id={containerId} style={{ width: "100%", height: "100%" }} />
          {status === "starting" && (
            <div style={{ position: "absolute", color: "#fff", fontSize: 13 }}>Starting camera...</div>
          )}
          {status === "error" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#fff", padding: 20, textAlign: "center" }}>
              <Icon name="camera" size={32} color="#EF4444" />
              <div style={{ fontWeight: 600 }}>Camera unavailable</div>
              <div style={{ fontSize: 12, color: "#aaa", maxWidth: 320 }}>{error || "Allow camera permission or upload an image instead."}</div>
            </div>
          )}
          {status === "scanning" && mode === "barcode" && (
            <div style={{ position: "absolute", pointerEvents: "none", border: "2px solid #10B981", width: "60%", height: "35%", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
          )}
          {status === "scanning" && mode === "identify" && (
            <div style={{ position: "absolute", pointerEvents: "none", border: "2px dashed #A78BFA", width: "75%", height: "75%", borderRadius: 10 }} />
          )}
        </div>

        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {hint && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>{hint}</div>}
          {mode === "identify" && status === "scanning" && (
            <button className="btn btn-primary" onClick={identifyFromCamera} style={{ justifyContent: "center" }}>
              <Icon name="camera" size={14} /> Capture & Identify
            </button>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {cameras.length > 1 && (
              <button className="btn btn-ghost" onClick={switchCamera} style={{ flex: 1, justifyContent: "center" }}>
                <Icon name="refresh" size={14} /> Switch Camera
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} style={{ flex: 1, justifyContent: "center" }}>
              <Icon name="upload" size={14} /> Upload Image
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
};

export default CameraScanner;
