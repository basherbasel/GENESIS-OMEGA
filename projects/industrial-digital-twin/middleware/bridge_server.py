#!/usr/bin/env python3
"""Zero-dependency Python middleware + local edge anomaly scorer for IDT.

The native C++ core is invoked through an argument vector with a sanitized
environment and strict hex validation. No shell, no third-party ML libraries,
no hardcoded secrets. HMAC signing key comes from --hmac-key or IDT_HMAC_KEY.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import re
import shutil
import subprocess
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "core" / "engine_cli.exe"
UI_FILE = ROOT / "ui" / "index.html"
HEX_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")
SENSITIVE = ("API_KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL", "AUTH")
MAX_BODY_BYTES = 4096
WINDOW = 16


def sanitized_env() -> Dict[str, str]:
    """Removes secret-shaped variables before spawning the native core."""
    clean = {
        key: value
        for key, value in os.environ.items()
        if value is not None and not any(token in key.upper() for token in SENSITIVE)
    }
    compiler = shutil.which("g++")
    if compiler is None:
        for candidate in ("C:/mingw64/bin/g++.exe", "C:/msys64/ucrt64/bin/g++.exe"):
            if Path(candidate).is_file():
                compiler = candidate
                break
    if compiler:
        compiler_dir = str(Path(compiler).parent)
        current = clean.get("PATH", "")
        clean["PATH"] = compiler_dir + os.pathsep + current if current else compiler_dir
    return clean


def decode_frame(hex_payload: str) -> Dict[str, Any]:
    """Fail-closed bridge to engine_cli; never interprets user text as a shell string."""
    if not isinstance(hex_payload, str) or HEX_PATTERN.fullmatch(hex_payload) is None:
        raise ValueError("strict 40-character hex frame required")
    if not ENGINE.is_file():
        raise RuntimeError("native core is not compiled")
    completed = subprocess.run(
        [str(ENGINE), "--decode-hex", hex_payload],
        cwd=str(ROOT),
        env=sanitized_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=2.0,
        check=False,
        text=True,
        shell=False,
    )
    try:
        parsed = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"native core returned invalid JSON: {exc}") from exc
    if completed.returncode != 0 or not parsed.get("valid"):
        raise ValueError(str(parsed.get("error", "native core rejected the frame")))
    return parsed


def dft_peak_and_entropy(samples: List[float], sample_rate_hz: float = 64.0) -> tuple[float, float]:
    """Deterministic Naive DFT peak and Shannon entropy using only math."""
    if len(samples) < WINDOW:
        samples = list(samples) + [0.0] * (WINDOW - len(samples))
    window = samples[-WINDOW:]
    bins = WINDOW // 2 + 1
    power: List[float] = []
    for k in range(bins):
        real = 0.0
        imaginary = 0.0
        for n, value in enumerate(window):
            angle = -2.0 * math.pi * k * n / WINDOW
            real += value * math.cos(angle)
            imaginary += value * math.sin(angle)
        power.append((real * real + imaginary * imaginary) / WINDOW)
    peak_hz = 0.0
    peak_power = -1.0
    for k in range(1, bins):
        if power[k] > peak_power:
            peak_power = power[k]
            peak_hz = k * sample_rate_hz / WINDOW
    total = sum(power)
    entropy = 0.0
    if total > 0.0:
        for value in power:
            if value <= 0.0:
                continue
            probability = value / total
            entropy -= probability * math.log2(probability)
    return peak_hz, entropy


class EdgeAnomalyScorer:
    """Mahalanobis-style diagonal z-score health index; deterministic, no ML deps."""

    def __init__(self) -> None:
        self.history: Deque[Dict[str, float]] = deque(maxlen=64)
        self.lock = threading.Lock()
        self.baseline_mean = (1.0, 1.0, 0.0)
        self.baseline_std = (0.5, 1.0, 1.0)

    @staticmethod
    def features(frame: Dict[str, Any], magnitudes: List[float]) -> Dict[str, float]:
        magnitude = float(frame["accelMagnitude"])
        peak_hz, entropy = dft_peak_and_entropy(magnitudes)
        current_k = float(frame["temperatureK"])
        predicted_k = float(frame["predictedTempK"])
        return {
            "vibrationRms": magnitude,
            "spectralEntropy": entropy,
            "thermalRiseRateKps": (predicted_k - current_k) / 60.0,
            "spectralPeakHz": peak_hz,
        }

    def score(self, features: Dict[str, float]) -> Dict[str, Any]:
        keys = ("vibrationRms", "spectralEntropy", "thermalRiseRateKps")
        with self.lock:
            samples = list(self.history)
            z_scores: List[float] = []
            for index, key in enumerate(keys):
                values = [item[key] for item in samples] + [self.baseline_mean[index] * 3]
                mean = sum(values) / len(values)
                variance = sum((value - mean) ** 2 for value in values) / len(values)
                std = max(math.sqrt(variance), self.baseline_std[index])
                z_scores.append((features[key] - mean) / std)
            health_index = math.sqrt(sum(value * value for value in z_scores) / len(z_scores))
            state = "NOMINAL" if health_index < 1.5 else "WARNING" if health_index < 3.0 else "CRITICAL"
            rul_minutes = max(0, int(round(720.0 - health_index * 120.0)))
            self.history.append(features)
            return {
                "healthIndex": round(health_index, 6),
                "state": state,
                "rulMinutes": rul_minutes,
                "framesProcessed": len(self.history),
            }


class RuntimeState:
    def __init__(self, hmac_key: Optional[str]) -> None:
        self.scorer = EdgeAnomalyScorer()
        self.magnitudes: List[float] = []
        self.key = hmac_key.encode("utf-8") if hmac_key else None

    def ingest(self, hex_payload: str) -> Dict[str, Any]:
        frame = decode_frame(hex_payload)
        self.magnitudes.append(float(frame["accelMagnitude"]))
        self.magnitudes = self.magnitudes[-64:]
        features = self.scorer.features(frame, self.magnitudes)
        health = self.scorer.score(features)
        result = {"frame": frame, "features": features, "health": health}
        result["signature"] = self.sign(result)
        return result

    def sign(self, payload: Dict[str, Any]) -> Optional[str]:
        if self.key is None:
            return None
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(self.key, encoded, hashlib.sha256).hexdigest()

    def telemetry(self) -> Dict[str, Any]:
        with self.scorer.lock:
            history = list(self.scorer.history)
        payload = {
            "frames": len(history),
            "history": history[-16:],
            "engine": str(ENGINE),
            "hmacConfigured": self.key is not None,
        }
        payload["signature"] = self.sign(payload)
        return payload


class Handler(BaseHTTPRequestHandler):
    state: RuntimeState

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: Dict[str, Any]) -> None:
        self._send(status, json.dumps(payload, sort_keys=True).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            self._json(200, {
                "status": "ok",
                "engineReady": ENGINE.is_file(),
                "hmacConfigured": self.state.key is not None,
            })
            return
        if self.path == "/api/telemetry":
            self._json(200, self.state.telemetry())
            return
        if self.path in ("/", "/index.html"):
            if not UI_FILE.is_file():
                self._json(404, {"error": "ui not found"})
                return
            self._send(200, UI_FILE.read_bytes(), "text/html; charset=utf-8")
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/ingest-frame":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid content length"})
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(413, {"error": "payload too large or empty"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            result = self.state.ingest(str(body.get("hex", "")))
            self._json(200, result)
        except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="IDT zero-dependency telemetry bridge")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--hmac-key", default=os.environ.get("IDT_HMAC_KEY"))
    args = parser.parse_args()

    if not ENGINE.is_file():
        raise SystemExit("native core missing: compile with g++ -std=c++17 -O2 -Wall -Wextra -Werror")
    server = ThreadingHTTPServer((args.host, args.port), type("BoundHandler", (Handler,), {"state": RuntimeState(args.hmac_key)}))
    print(f"IDT bridge on http://{args.host}:{args.port} (engine={ENGINE})")
    server.serve_forever()


if __name__ == "__main__":
    main()
