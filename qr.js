// ============================================================
//  QR Scanner Module – Treasure Hunt
//  Self-contained camera-based QR reader with zero globals.
//  Uses BarcodeDetector (Chrome/Edge/Android) with jsQR fallback
//  for Safari / older browsers.
// ============================================================
(function () {
  "use strict";

  // ── Constants ───────────────────────────────────────────────
  const SCAN_INTERVAL_MS = 250; // how often we sample frames
  const JSQR_CDN = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";

  // ── State ───────────────────────────────────────────────────
  let stream = null;
  let scanTimer = null;
  let detector = null; // BarcodeDetector instance (if supported)
  let jsQRLoaded = false;
  let modalOpen = false;

  // ── DOM refs (created once) ─────────────────────────────────
  let overlay, modal, video, canvas, ctx, closeBtn, instruction, errorMsg;

  // ── Build modal UI (called once on first open) ──────────────
  function ensureModal() {
    if (overlay) return;

    overlay = el("div", { id: "qr-overlay" });
    modal = el("div", { id: "qr-modal" });

    closeBtn = el("button", { id: "qr-close", type: "button" });
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", closeScanner);

    instruction = el("p", { id: "qr-instruction" });
    instruction.textContent = "Point camera at QR code";

    video = el("video", { id: "qr-video", autoplay: true, playsinline: true, muted: true });
    canvas = el("canvas", { id: "qr-canvas" });
    canvas.style.display = "none";
    ctx = canvas.getContext("2d", { willReadFrequently: true });

    errorMsg = el("p", { id: "qr-error" });

    modal.append(closeBtn, video, instruction, errorMsg);
    overlay.append(modal, canvas);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeScanner();
    });
  }

  // ── Open scanner ────────────────────────────────────────────
  async function openScanner() {
    if (modalOpen) return;
    modalOpen = true;

    ensureModal();
    errorMsg.textContent = "";
    instruction.style.display = "block";
    overlay.classList.add("qr-visible");
    document.body.style.overflow = "hidden";

    // Initialise detector (once)
    if (!detector) {
      if (typeof BarcodeDetector !== "undefined") {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          if (formats.includes("qr_code")) {
            detector = new BarcodeDetector({ formats: ["qr_code"] });
          }
        } catch (_) {
          /* fall through to jsQR */
        }
      }
    }

    // If no native support, lazy-load jsQR
    if (!detector && !jsQRLoaded) {
      try {
        await loadScript(JSQR_CDN);
        jsQRLoaded = true;
      } catch (_) {
        showScanError("QR scanning is not supported on this browser.");
        return;
      }
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showScanError("Camera permission denied. Please allow camera access and try again.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        showScanError("No camera found on this device.");
      } else if (err.name === "NotReadableError") {
        showScanError("Camera is in use by another app.");
      } else {
        showScanError("Could not access camera.");
      }
      return;
    }

    video.srcObject = stream;

    // Wait for video to be playable before scanning
    video.onloadedmetadata = () => {
      video.play().catch(() => {});
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      startScanning();
    };
  }

  // ── Frame-by-frame scan loop ────────────────────────────────
  function startScanning() {
    stopScanning(); // clear any prior timer
    scanTimer = setInterval(scanFrame, SCAN_INTERVAL_MS);
  }

  async function scanFrame() {
    if (!video || video.readyState < 2) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let result = null;

    if (detector) {
      // Native BarcodeDetector
      try {
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) result = barcodes[0].rawValue;
      } catch (_) {
        /* skip frame */
      }
    } else if (window.jsQR) {
      // jsQR fallback
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imgData.data, canvas.width, canvas.height, {
        inversionAttempts: "dontInvert",
      });
      if (code && code.data) result = code.data;
    }

    if (result) {
      handleDetectedCode(result);
    }
  }

  // ── Handle detected QR content ──────────────────────────────
  // Security model: CONTENT-BASED validation, not origin-based.
  //
  // We never redirect to the raw URL from the QR code. Instead we
  // extract the clue number and navigate locally with ?clue=N.
  // This means:
  //   ✅ QR codes from production work on localhost (and vice-versa)
  //   ✅ External / phishing URLs are blocked — we never open them
  //   ✅ Only valid integer clue numbers are accepted
  // ─────────────────────────────────────────────────────────────
  function handleDetectedCode(raw) {
    closeScanner();

    const cleaned = raw.trim();
    if (!cleaned) return;

    // Case 1: plain number → treat as clue number
    if (/^\d+$/.test(cleaned)) {
      navigateToClue(parseInt(cleaned, 10));
      return;
    }

    // Case 2: URL (any origin) — extract ?clue=N, ignore everything else
    let url;
    try {
      url = new URL(cleaned);
    } catch (_) {
      /* not a URL */
    }

    if (url) {
      const clueParam = url.searchParams.get("clue");
      if (clueParam && /^\d+$/.test(clueParam)) {
        // Valid clue found — navigate locally regardless of the QR's domain.
        // We never use url.href, so phishing / external URLs are harmless.
        navigateToClue(parseInt(clueParam, 10));
        return;
      }

      // URL without a valid ?clue param → reject
      showToast("QR code does not contain a valid clue.");
      return;
    }

    // Case 3: "clue=3" style text
    const match = cleaned.match(/^clue\s*=\s*(\d+)$/i);
    if (match) {
      navigateToClue(parseInt(match[1], 10));
      return;
    }

    // Unrecognised content
    showToast("Unrecognised QR code.");
  }

  function navigateToClue(num) {
    if (!Number.isFinite(num) || num < 1 || num > 9999) {
      showToast("Invalid clue number.");
      return;
    }
    window.location.href = window.location.pathname + "?clue=" + num;
  }

  // ── Close scanner & release camera ──────────────────────────
  function closeScanner() {
    modalOpen = false;
    stopScanning();

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (video) {
      video.srcObject = null;
    }
    if (overlay) {
      overlay.classList.remove("qr-visible");
    }
    document.body.style.overflow = "";
  }

  function stopScanning() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  function showScanError(msg) {
    if (errorMsg) {
      errorMsg.textContent = msg;
      instruction.style.display = "none";
    }
  }

  function showToast(msg) {
    // Quick non-blocking notification
    const toast = el("div", { className: "qr-toast" });
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("qr-toast-show"));
    setTimeout(() => {
      toast.classList.remove("qr-toast-show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function el(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs)
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "className") e.className = v;
        else e.setAttribute(k, v);
      });
    return e;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Bind to Scan button on DOMContentLoaded ─────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("qr-scan-btn");
    if (btn) btn.addEventListener("click", openScanner);
  });
})();
