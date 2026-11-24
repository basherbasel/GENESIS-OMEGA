# Industrial Rotating-Machinery Vibration & Thermal Digital Twin

تطبيق v5.0 حقيقي بطبقات ثلاث وأقسام R&D السبعة، بدون أي اعتمادية خارجية.كل شيء يُترجم ويُشغَّل على نظام التشغيل الفعلي.

## البنية

| الطبقة | الملفات | المسؤولية |
|---|---|---|
| 1 — Core C++17 | `core/protocol_decoder.*`, `core/physics_dsp.*`, `core/main.cpp`, `core/test_core.cpp` | فك إطار 20 بايت بـ CRC-16/MODBUS، DSP/RK4، CLI JSON، اختبارات أصلية |
| 2 — Middleware | `middleware/bridge_server.py` | جسر `subprocess` آمن، تقييم شذوذ محلي حتمي، HMAC-SHA256، HTTP API |
| 3 — HMI | `ui/index.html` | لوحة Canvas ثنائية اللغة للموجة والطيف والحرارة وسجل الإنذارات |

## البناء والتحقق

```powershell
# Windows (g++ من MinGW)
$env:PATH = "C:\mingw64\bin;$env:PATH"
g++ -std=c++17 -O2 -Wall -Wextra -Werror -static `
  core/protocol_decoder.cpp core/physics_dsp.cpp core/main.cpp -o core/engine_cli.exe
g++ -std=c++17 -O2 -Wall -Wextra -Werror -static `
  core/protocol_decoder.cpp core/physics_dsp.cpp core/test_core.cpp -o core/test_core.exe
.\core\test_core.exe
.\core\engine_cli.exe --decode-hex 5a3c12346553f1003fc00000bf4ccccd012c84f1
python3 -m unittest discover -s tests -p 'test_system.py' -v
```

```bash
# Linux / macOS
g++ -std=c++17 -O2 -Wall -Wextra -Werror \
  core/protocol_decoder.cpp core/physics_dsp.cpp core/main.cpp -o core/engine_cli.exe
g++ -std=c++17 -O2 -Wall -Wextra -Werror \
  core/protocol_decoder.cpp core/physics_dsp.cpp core/test_core.cpp -o core/test_core.exe
./core/test_core.exe
python3 -m unittest discover -s tests -p 'test_system.py' -v
```

## التشغيل

```bash
python3 middleware/bridge_server.py --port 8765
# افتح http://127.0.0.1:8765/
```

مفتاح التوقيع اختياري ويُمرَّر وقت التشغيل فقط:

```bash
python3 middleware/bridge_server.py --hmac-key "$IDT_HMAC_KEY"
```

## نموذج الإطار

الإطار الصالح：`5a3c12346553f1003fc00000bf4ccccd012c84f1`

`[MAGIC=0x5A3C][DEVICE_ID=0x1234][TS_MS][ACCEL_X=1.5][ACCEL_Y=-0.8][TEMP_RAW=300][CRC16]`

درجة الحرارة：$T_K = 233.15 + TEMP\_RAW \times 0.0625$.

## الأمان

- hex صارم `^[0-9a-fA-F]{40}$` قبل أي استدعاء.
- `subprocess.run([...], shell=False)` مع بيئة مُطهَّرة من مفاتيح `API_KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL/AUTH`.
- رفض fail-closed للإطارات التالفة أو النانو/اللانهاية أو الحقن.
- لا مفاتيح ثابتة؛ HMAC يأخذ المفتاح من `--hmac-key` أو `IDT_HMAC_KEY`.

النطاق دفاعي/توافقي فقط: لا برمجيات خبيثة ولا تجاوز DRM.
