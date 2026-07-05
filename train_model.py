"""
Diabetes Prediction — Model Training / Export Script
Replicates the notebook pipeline exactly:
  1. Load PIMA dataset
  2. Replace biologically-impossible zeros with column median
  3. StandardScaler
  4. SVM (linear kernel, probability=True)
Exports: model.pkl, scaler.pkl, meta.json
"""

import json
import pickle

import numpy as np
import pandas as pd
from sklearn import svm
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "Pregnancies", "Glucose", "BloodPressure", "SkinThickness",
    "Insulin", "BMI", "DiabetesPedigreeFunction", "Age",
]
ZERO_COLS = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]

df = pd.read_csv("diabetes.csv")

df_clean = df.copy()
medians = {}
for col in ZERO_COLS:
    median_val = df_clean[col].replace(0, np.nan).median()
    medians[col] = float(median_val)
    df_clean[col] = df_clean[col].replace(0, median_val)

X = df_clean[FEATURES]
Y = df_clean["Outcome"]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, Y_train, Y_test = train_test_split(
    X_scaled, Y, test_size=0.2, stratify=Y, random_state=2
)

classifier = svm.SVC(kernel="linear", probability=True)
classifier.fit(X_train, Y_train)

train_acc = accuracy_score(Y_train, classifier.predict(X_train))
test_pred = classifier.predict(X_test)
test_acc = accuracy_score(Y_test, test_pred)
cv_scores = cross_val_score(classifier, X_scaled, Y, cv=5, scoring="accuracy")
roc_auc = roc_auc_score(Y_test, classifier.predict_proba(X_test)[:, 1])
cm = confusion_matrix(Y_test, test_pred).tolist()

print(f"Train accuracy : {train_acc:.4f}")
print(f"Test accuracy  : {test_acc:.4f}")
print(f"CV accuracy    : {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
print(f"ROC AUC        : {roc_auc:.4f}")
print("Confusion matrix:", cm)

with open("model/model.pkl", "wb") as f:
    pickle.dump(classifier, f)

with open("model/scaler.pkl", "wb") as f:
    pickle.dump(scaler, f)

# Feature stats used by the frontend for input hints / validation ranges
stats = {}
for col in FEATURES:
    stats[col] = {
        "min": float(df_clean[col].min()),
        "max": float(df_clean[col].max()),
        "mean": float(df_clean[col].mean()),
        "median": float(df_clean[col].median()),
    }

meta = {
    "features": FEATURES,
    "zero_cols": ZERO_COLS,
    "medians_for_zero_fill": medians,
    "stats": stats,
    "metrics": {
        "train_accuracy": round(train_acc, 4),
        "test_accuracy": round(test_acc, 4),
        "cv_accuracy_mean": round(float(cv_scores.mean()), 4),
        "cv_accuracy_std": round(float(cv_scores.std()), 4),
        "roc_auc": round(float(roc_auc), 4),
        "confusion_matrix": cm,
    },
    "sklearn_note": "Model retrained locally to match deployment sklearn version.",
}

with open("model/meta.json", "w") as f:
    json.dump(meta, f, indent=2)

print("\nSaved model/model.pkl, model/scaler.pkl, model/meta.json")
