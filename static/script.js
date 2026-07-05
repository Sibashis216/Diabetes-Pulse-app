// ============================================================
// PULSE — Diabetes Risk Monitor — frontend logic
// ============================================================

// Update this to your deployed Flask backend URL after deployment.
// e.g. const API_BASE = "https://pulse-diabetes-api.vercel.app";
// const API_BASE = "http://localhost:5000";
const API_BASE = "https://diabetes-pulse-app.vercel.app/";

const FEATURES = [
  "Pregnancies", "Glucose", "BloodPressure", "SkinThickness",
  "Insulin", "BMI", "DiabetesPedigreeFunction", "Age",
];

// ---------- EKG waveform ----------

const VIEW_W = 1200;
const VIEW_H = 220;
const BASELINE = 120;

const ekgPath = document.getElementById("ekgPath");
const stripReading = document.getElementById("strip-reading");

let ekgState = { amplitude: 26, beatsPerScreen: 3, jitter: 3, speed: 7 }; // idle sinus rhythm
let phase = 0;
let rafId = null;

function beatUnit(x0, width, amplitude, jitter) {
  // A single PQRST-ish beat drawn as a compact path segment starting/ending at baseline.
  const j = () => (Math.random() - 0.5) * jitter;
  const y = BASELINE;
  const p1 = x0 + width * 0.12;
  const p2 = x0 + width * 0.20;
  const q = x0 + width * 0.34;
  const r = x0 + width * 0.40;
  const s = x0 + width * 0.46;
  const t1 = x0 + width * 0.66;
  const t2 = x0 + width * 0.78;
  const end = x0 + width;

  return [
    `L ${x0 + width * 0.0} ${y + j()}`,
    `L ${p1} ${y - amplitude * 0.12 + j()}`,
    `L ${p2} ${y + j()}`,
    `L ${q} ${y + amplitude * 0.15 + j()}`,
    `L ${r} ${y - amplitude + j()}`,
    `L ${s} ${y + amplitude * 0.35 + j()}`,
    `L ${(s + t1) / 2} ${y + j()}`,
    `L ${t1} ${y - amplitude * 0.22 + j()}`,
    `L ${t2} ${y + j()}`,
    `L ${end} ${y + j()}`,
  ].join(" ");
}

function buildPath({ amplitude, beatsPerScreen, jitter }) {
  const totalWidth = VIEW_W * 2; // two screens worth, tiled seamlessly
  const beatWidth = VIEW_W / beatsPerScreen;
  const numBeats = Math.round(totalWidth / beatWidth);
  let d = `M 0 ${BASELINE}`;
  for (let i = 0; i < numBeats; i++) {
    d += " " + beatUnit(i * beatWidth, beatWidth, amplitude, jitter);
  }
  return d;
}

function animateEkg() {
  phase -= ekgState.speed;
  if (phase <= -VIEW_W) phase += VIEW_W;
  ekgPath.setAttribute("transform", `translate(${phase}, 0)`);
  rafId = requestAnimationFrame(animateEkg);
}

function refreshEkgPath() {
  ekgPath.setAttribute("d", buildPath(ekgState));
}

function setEkgState(next) {
  ekgState = { ...ekgState, ...next };
  refreshEkgPath();
}

refreshEkgPath();
animateEkg();
// Occasionally re-jitter the idle path so it doesn't look perfectly static/looped
setInterval(() => { if (!document.body.classList.contains("has-result")) refreshEkgPath(); }, 3000);

// ---------- form + prediction ----------

const form = document.getElementById("predict-form");
const runBtn = document.getElementById("runBtn");
const formError = document.getElementById("formError");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const readoutEmpty = document.getElementById("readoutEmpty");
const readoutBody = document.getElementById("readoutBody");
const scoreNumber = document.getElementById("scoreNumber");
const bandBadge = document.getElementById("bandBadge");
const bandText = document.getElementById("bandText");
const gaugeFill = document.getElementById("gaugeFill");
const verdictText = document.getElementById("verdictText");

const BAND_COPY = {
  low: {
    label: "Low",
    ekgClass: "",
    verdict: "Measurements fall closer to the non-diabetic patients in the training data. Routine monitoring is still worthwhile.",
    heart: { amplitude: 24, beatsPerScreen: 2.5, jitter: 2, speed: 5 },
  },
  guarded: {
    label: "Guarded",
    ekgClass: "",
    verdict: "Some measurements sit in a mixed zone. Consider a follow-up glucose panel to clarify the picture.",
    heart: { amplitude: 30, beatsPerScreen: 3.2, jitter: 3, speed: 6.5 },
  },
  elevated: {
    label: "Elevated",
    ekgClass: "risk-elevated",
    verdict: "Several inputs resemble the diabetic cohort's profile. A clinical follow-up is recommended.",
    heart: { amplitude: 38, beatsPerScreen: 4, jitter: 5, speed: 8.5 },
  },
  high: {
    label: "High",
    ekgClass: "risk-high",
    verdict: "This profile closely matches diabetic outcomes in the training data. Please consult a healthcare provider.",
    heart: { amplitude: 46, beatsPerScreen: 5, jitter: 7, speed: 11 },
  },
};

function animateScoreTo(targetPct) {
  const start = parseFloat(scoreNumber.textContent) || 0;
  const duration = 700;
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = start + (targetPct - start) * eased;
    scoreNumber.textContent = val.toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showResult(data) {
  const pct = data.probability * 100;
  const band = BAND_COPY[data.risk_band] || BAND_COPY.guarded;

  readoutEmpty.hidden = true;
  readoutBody.hidden = false;

  animateScoreTo(pct);
  scoreNumber.style.color =
    data.risk_band === "high" ? "var(--coral)" :
    data.risk_band === "elevated" ? "var(--amber)" :
    "var(--text-primary)";

  bandBadge.className = `band-badge ${data.risk_band}`;
  bandText.textContent = `${band.label} risk · ${data.result}`;

  requestAnimationFrame(() => { gaugeFill.style.width = `${pct}%`; });

  verdictText.textContent = band.verdict;

  ekgPath.classList.remove("risk-elevated", "risk-high");
  if (band.ekgClass) ekgPath.classList.add(band.ekgClass);
  setEkgState(band.heart);

  stripReading.textContent = `${band.label.toUpperCase()} · ${pct.toFixed(1)}% probability`;
  document.body.classList.add("has-result");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const payload = {};
  for (const key of FEATURES) {
    const el = document.getElementById(key);
    const val = parseFloat(el.value);
    if (Number.isNaN(val)) {
      formError.textContent = `Please provide a valid number for ${key}.`;
      el.focus();
      return;
    }
    payload[key] = val;
  }

  runBtn.disabled = true;
  runBtn.classList.add("loading");
  statusDot.className = "dot live";
  statusText.textContent = "Running assessment…";

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Request failed (${res.status})`);
    }

    const data = await res.json();
    showResult(data);

    statusDot.className = data.risk_band === "high" || data.risk_band === "elevated" ? "dot alert" : "dot live";
    statusText.textContent = "Reading complete";
  } catch (err) {
    formError.textContent = err.message || "Could not reach the prediction service.";
    statusDot.className = "dot";
    statusText.textContent = "Model standing by";
  } finally {
    runBtn.disabled = false;
    runBtn.classList.remove("loading");
  }
});

// ---------- model metadata footer ----------

async function loadMeta() {
  const footerMetrics = document.getElementById("footerMetrics");
  try {
    const res = await fetch(`${API_BASE}/api/meta`);
    if (!res.ok) throw new Error("meta unavailable");
    const meta = await res.json();
    const m = meta.metrics;
    footerMetrics.textContent =
      `SVM (linear kernel) · test accuracy ${(m.test_accuracy * 100).toFixed(1)}% · ` +
      `5-fold CV ${(m.cv_accuracy_mean * 100).toFixed(1)}% ± ${(m.cv_accuracy_std * 100).toFixed(1)} · ROC AUC ${m.roc_auc.toFixed(3)}`;
  } catch {
    footerMetrics.textContent = "Model metrics unavailable — is the backend running?";
  }
}

loadMeta();
