#!/usr/bin/env python3
"""Real end-to-end OS verification suite for the industrial digital twin."""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "middleware"))
from bridge_server import RuntimeState, decode_frame, dft_peak_and_entropy, sanitized_env  # noqa: E402

VALID_HEX = "5a3c12346553f1003fc00000bf4ccccd012c84f1"
CORRUPT_HEX = "5a3c12346553f1003fc00000bf4ccccd012c84f2"
HMAC_KEY = "runtime-verification-key"


def find_gpp() -> str | None:
    found = shutil.which("g++")
    if found:
        return found
    for candidate in (Path("C:/mingw64/bin/g++.exe"), Path("C:/msys64/ucrt64/bin/g++.exe")):
        if candidate.is_file():
            return str(candidate)
    return None


class SystemTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.gpp = find_gpp()
        if cls.gpp is None:
            raise unittest.SkipTest("g++ C++17 compiler not available on this host")
        flags = ["-std=c++17", "-O2", "-Wall", "-Wextra", "-Werror"]
        if os.name == "nt":
            flags.append("-static")
        core = [str(ROOT / "core" / name) for name in ("protocol_decoder.cpp", "physics_dsp.cpp")]
        cli = subprocess.run(
            [cls.gpp, *flags, *core, str(ROOT / "core" / "main.cpp"), "-o", str(ROOT / "core" / "engine_cli.exe")],
            cwd=str(ROOT), capture_output=True, text=True, timeout=120, check=False,
        )
        assert cli.returncode == 0, cli.stderr
        native = subprocess.run(
            [cls.gpp, *flags, *core, str(ROOT / "core" / "test_core.cpp"), "-o", str(ROOT / "core" / "test_core.exe")],
            cwd=str(ROOT), capture_output=True, text=True, timeout=120, check=False,
        )
        assert native.returncode == 0, native.stderr
        native_run = subprocess.run([str(ROOT / "core" / "test_core.exe")], cwd=str(ROOT), capture_output=True, text=True, timeout=30, check=False)
        assert native_run.returncode == 0, native_run.stdout + native_run.stderr
        assert "IDT_CORE_OK" in native_run.stdout

        cls.state = RuntimeState(HMAC_KEY)
        cls.server = None
        cls.thread = None
        cls.base = ""
        cls._start_http()

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.server is not None:
            cls.server.shutdown()
            cls.server.server_close()
        if cls.thread is not None:
            cls.thread.join(timeout=5)

    @classmethod
    def _start_http(cls) -> None:
        from http.server import ThreadingHTTPServer
        from bridge_server import Handler
        bound_handler = type("BoundHandler", (Handler,), {"state": cls.state})
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), bound_handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    def _cli(self, hex_value: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(ROOT / "core" / "engine_cli.exe"), "--decode-hex", hex_value],
            cwd=str(ROOT), capture_output=True, text=True, timeout=10, check=False,
        )

    def _get(self, path: str) -> tuple[int, bytes]:
        try:
            with urllib.request.urlopen(self.base + path, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def _post(self, path: str, payload: dict[str, Any]) -> tuple[int, bytes]:
        request = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def test_native_core_decodes_real_frame_with_exact_calibration(self) -> None:
        result = self._cli(VALID_HEX)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["deviceId"], 0x1234)
        self.assertEqual(payload["timestampMs"], 1700000000)
        self.assertAlmostEqual(payload["accelX"], 1.5, places=6)
        self.assertAlmostEqual(payload["accelY"], -0.8, places=6)
        self.assertAlmostEqual(payload["temperatureK"], 233.15 + 300 * 0.0625, places=6)

    def test_native_core_fails_closed_on_corruption_truncation_and_injection(self) -> None:
        for payload in (CORRUPT_HEX, "5a3c", "0103; rm -rf /", "zz" * 20, VALID_HEX + "00"):
            result = self._cli(payload)
            self.assertNotEqual(result.returncode, 0, payload)
            parsed = json.loads(result.stdout)
            self.assertFalse(parsed["valid"])
            self.assertIn("error", parsed)

    def test_python_bridge_rejects_command_injection_and_sanitizes_env(self) -> None:
        for payload in ("0103; rm -rf /", "5a3c", "$(id)", VALID_HEX + "; cat /etc/passwd"):
            with self.assertRaises(ValueError):
                decode_frame(payload)
        os.environ["IDT_SECRET_TEST"] = "must-not-reach-child"
        self.assertNotIn("IDT_SECRET_TEST", sanitized_env())
        os.environ.pop("IDT_SECRET_TEST", None)

    def test_dft_peak_and_entropy_are_accurate(self) -> None:
        samples = [2.0 * math.sin(2.0 * math.pi * 4.0 * i / 64.0) for i in range(16)]
        peak, entropy = dft_peak_and_entropy(samples)
        self.assertAlmostEqual(peak, 4.0, delta=1e-4)
        self.assertGreaterEqual(entropy, 0.0)
        self.assertLessEqual(entropy, 4.0)

    def test_http_health_ingest_telemetry_and_ui(self) -> None:
        status, body = self._get("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["engineReady"])

        status, body = self._post("/api/ingest-frame", {"hex": VALID_HEX})
        self.assertEqual(status, 200, body)
        payload = json.loads(body)
        self.assertEqual(payload["frame"]["deviceId"], 0x1234)
        self.assertIn(payload["health"]["state"], ("NOMINAL", "WARNING", "CRITICAL"))
        self.assertIsNotNone(payload["signature"])

        status, body = self._post("/api/ingest-frame", {"hex": "0103; rm -rf /"})
        self.assertEqual(status, 400)

        status, body = self._get("/api/telemetry")
        self.assertEqual(status, 200)
        telemetry = json.loads(body)
        self.assertGreaterEqual(telemetry["frames"], 1)
        self.assertIsNotNone(telemetry["signature"])
        expected = hmac.new(
            HMAC_KEY.encode("utf-8"),
            json.dumps({k: v for k, v in telemetry.items() if k != "signature"}, sort_keys=True, separators=(",", ":")).encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(telemetry["signature"], expected)

        status, body = self._get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"<canvas", body)
        self.assertIn(b"Industrial Digital Twin", body)


if __name__ == "__main__":
    unittest.main(verbosity=2)
