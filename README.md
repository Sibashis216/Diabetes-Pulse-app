# PULSE — Diabetes Risk Monitor

A full-stack ML web app that predicts diabetes risk from the 8 PIMA Indians
Diabetes diagnostic measurements, served by a linear-kernel SVM.

**Live demo UI theme:** a clinical vitals-monitor aesthetic — an animated EKG
strip that changes rhythm and color with the predicted risk band, next to a
"patient chart" input form and a digital readout panel.

---

## 1. Project structure

```
diabetes-project/
├── diabetes.csv           # PIMA dataset (training source)
├── train_model.py         # Reproduces the notebook pipeline, exports pickles
├── app.py                 # Flask backend (serves API + static frontend)
├── requirements.txt
├── vercel.json            # Vercel serverless config
├── model/
│   ├── model.pkl          # Trained SVC (kernel='linear', probability=True)
│   ├── scaler.pkl         # StandardScaler fit on cleaned training data
│   └── meta.json          # Feature stats + evaluation metrics
└── static/
    ├── index.html
    ├── style.css
    └── script.js
```

## 2. Model pipeline (matches the notebook exactly)

1. Load `diabetes.csv` (768 rows, 8 features + `Outcome`).
2. Replace biologically-impossible zeros (`Glucose`, `BloodPressure`,
   `SkinThickness`, `Insulin`, `BMI`) with the column median.
3. `StandardScaler` on all 8 features.
4. `train_test_split` (80/20, stratified, `random_state=2`).
5. `svm.SVC(kernel='linear', probability=True)`.

Current metrics (from `train_model.py`, will match `model/meta.json`):

| Metric | Value |
|---|---|
| Train accuracy | ~78% |
| Test accuracy | ~76.6% |
| 5-fold CV accuracy | ~76.4% ± 1.6% |
| ROC AUC | ~0.82 |

## 3. API

`POST /api/predict`

```json
{
  "Pregnancies": 5,
  "Glucose": 166,
  "BloodPressure": 72,
  "SkinThickness": 19,
  "Insulin": 175,
  "BMI": 25.8,
  "DiabetesPedigreeFunction": 0.587,
  "Age": 51
}
```

Response:

```json
{
  "prediction": 1,
  "result": "Diabetic",
  "probability": 0.6027,
  "risk_band": "elevated",
  "input": { ... }
}
```

`risk_band` thresholds: `low` < 0.25, `guarded` < 0.5, `elevated` < 0.75, else `high`.

Other endpoints: `GET /api/meta` (feature stats + metrics), `GET /api/health`.

## 4. Run locally

```bash
cd diabetes-project
pip install -r requirements.txt

# (Optional) retrain / regenerate pickles:
python train_model.py

# Start the backend (also serves the frontend at http://localhost:5000)
python app.py
```

Open `http://localhost:5000` — the frontend's `API_BASE` in `static/script.js`
already points at `http://localhost:5000` for local dev.

## 5. Deploy

### Backend → Vercel

Vercel's Python runtime auto-detects a Flask app that exposes an `app`
variable in `app.py` at the project root — **no `builds`/`routes` config
needed**. `vercel.json` here is intentionally minimal:

```json
{
  "functions": { "app.py": {} }
}
```

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel, keep the default settings.
3. Deploy. Note the resulting URL, e.g. `https://pulse-diabetes.vercel.app`.
4. Verify routing worked by opening `<your-url>/api/health` directly in the
   browser before testing anything else — you should see `{"status": "ok"}`,
   not a 404 page.

> **Common pitfall:** older Vercel/Flask tutorials use a legacy
> `"builds": [...], "routes": [...]` config. That style can cause nested
> routes like `/api/meta` to 404 even though `/` loads fine. If you ever see
> that happen, delete `vercel.json` (or reduce it to the minimal form above)
> and redeploy.

> Vercel's filesystem is read-only at runtime — this is why `model/model.pkl`
> and `model/scaler.pkl` are committed to the repo rather than generated at
> import time. If you retrain locally, always re-run `train_model.py` with
> the **same scikit-learn version pinned in `requirements.txt`** before
> committing the new pickles, to avoid pickle/sklearn version mismatches at
> deploy time.

### Frontend

The frontend is already served by Flask from `/static`, so deploying the
backend deploys the frontend too. If you split them into separate Vercel
projects instead, update the one line in `static/script.js`:

```js
const API_BASE = "https://<your-backend>.vercel.app";
```

## 6. Notes / known patterns from this build

- CORS is enabled via `flask-cors` since the frontend may be hosted on a
  different origin than the API.
- Input validation on the backend rejects missing fields or non-numeric
  values with a `400` and a message the frontend surfaces inline.
- The EKG waveform's amplitude, beat rate, and color are driven directly by
  `risk_band` / `probability` from the API response — it's a genuine (if
  playful) visualization of the model output, not decoration.
