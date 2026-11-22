import type { EcosystemKey, EcosystemMeta, ProjectTemplate } from './types';

export const ECOSYSTEM_CATALOG: Record<EcosystemKey, EcosystemMeta> = {
  python: {
    key: 'python',
    displayName: 'Python 3.12 (Modern / AI / Backend / CLI)',
    category: 'Modern & Data/Web',
    keywords: ['python', 'بايثون', 'fastapi', 'flask', 'django', 'sqlite', 'سكربت'],
    baseImage: 'python:3.12-slim',
    buildCmd: 'none',
    testCmd: 'python -m unittest discover -v',
    dockerCmd: 'CMD ["python", "main.py"]',
    entryFile: 'main.py',
  },
  nodejs: {
    key: 'nodejs',
    displayName: 'Node.js 20 LTS (JavaScript / REST / Realtime)',
    category: 'Modern Web & Servers',
    keywords: ['node', 'nodejs', 'javascript', 'express', 'نود', 'جافاسكربت', 'js'],
    baseImage: 'node:20-alpine',
    buildCmd: 'none',
    testCmd: 'node --test',
    dockerCmd: 'CMD ["node", "index.js"]',
    entryFile: 'index.js',
  },
  typescript: {
    key: 'typescript',
    displayName: 'TypeScript 5 (Enterprise Typed Backend/Frontend)',
    category: 'Modern Web & Enterprise',
    keywords: ['typescript', 'ts', 'تايب سكربت', 'nestjs', 'nextjs', 'react'],
    baseImage: 'node:20-alpine',
    buildCmd: 'npx tsc --noEmit',
    testCmd: 'node --test',
    dockerCmd: 'CMD ["node", "dist/index.js"]',
    entryFile: 'src/index.ts',
  },
  go: {
    key: 'go',
    displayName: 'Go 1.22 (High-Concurrency Microservices & Cloud)',
    category: 'Cloud-Native & Systems',
    keywords: ['golang', 'go ', 'بلغة go', 'لغة جو', 'ميكروسيرفس', 'microservice'],
    baseImage: 'golang:1.22-alpine',
    buildCmd: 'go build ./...',
    testCmd: 'go test -v ./...',
    dockerCmd: 'CMD ["./app"]',
    entryFile: 'main.go',
  },
  rust: {
    key: 'rust',
    displayName: 'Rust 1.77 (Memory-Safe Systems & High-Speed Tools)',
    category: 'Systems & High-Performance',
    keywords: ['rust', 'cargo', 'رست', 'أنظمة آمنة'],
    baseImage: 'rust:1.77-slim',
    buildCmd: 'cargo build --release',
    testCmd: 'cargo test',
    dockerCmd: 'CMD ["./target/release/app"]',
    entryFile: 'src/main.rs',
  },
  cpp: {
    key: 'cpp',
    displayName: 'C++20 (Native Engines, Hardware & High-Performance)',
    category: 'Systems & Native',
    keywords: ['c++', 'cpp', 'g++', 'سي بلس', 'محرك'],
    baseImage: 'gcc:13-bookworm',
    buildCmd: 'g++ -O2 -std=c++20 -Wall main.cpp -o app',
    testCmd: './app',
    dockerCmd: 'CMD ["./app"]',
    entryFile: 'main.cpp',
  },
  c: {
    key: 'c',
    displayName: 'C17 (Embedded, OS Kernels, Drivers & Low-Level)',
    category: 'Systems & Embedded',
    keywords: ['c11', 'c17', 'gcc', 'لغة سي', 'embedded', 'كيرنل', 'هاردوير'],
    baseImage: 'gcc:13-bookworm',
    buildCmd: 'gcc -O2 -std=c17 -Wall main.c -o app',
    testCmd: './app',
    dockerCmd: 'CMD ["./app"]',
    entryFile: 'main.c',
  },
  csharp: {
    key: 'csharp',
    displayName: 'C# / .NET 8 (Cross-Platform Enterprise & Desktop)',
    category: 'Enterprise & Desktop',
    keywords: ['c#', 'csharp', 'dotnet', '.net', 'سي شارب'],
    baseImage: 'mcr.microsoft.com/dotnet/sdk:8.0',
    buildCmd: 'dotnet build',
    testCmd: 'dotnet test',
    dockerCmd: 'CMD ["dotnet", "run"]',
    entryFile: 'Program.cs',
  },
  java: {
    key: 'java',
    displayName: 'Java 21 LTS (Enterprise JVM Services)',
    category: 'Enterprise & Legacy/Modern',
    keywords: ['java', 'spring', 'جافا', 'jvm'],
    baseImage: 'eclipse-temurin:21-jdk-alpine',
    buildCmd: 'javac Main.java',
    testCmd: 'java Main',
    dockerCmd: 'CMD ["java", "Main"]',
    entryFile: 'Main.java',
  },
  php: {
    key: 'php',
    displayName: 'PHP 8.3 (Web Backends & APIs)',
    category: 'Web Backends',
    keywords: ['php', 'laravel', 'بي اتش بي'],
    baseImage: 'php:8.3-cli-alpine',
    buildCmd: 'php -l index.php',
    testCmd: 'php index.php',
    dockerCmd: 'CMD ["php", "-S", "0.0.0.0:8000"]',
    entryFile: 'index.php',
  },
  ruby: {
    key: 'ruby',
    displayName: 'Ruby 3.3 (Automation & Web Services)',
    category: 'Web & Scripting',
    keywords: ['ruby', 'rails', 'روبي'],
    baseImage: 'ruby:3.3-slim',
    buildCmd: 'ruby -c main.rb',
    testCmd: 'ruby main.rb',
    dockerCmd: 'CMD ["ruby", "main.rb"]',
    entryFile: 'main.rb',
  },
  bash: {
    key: 'bash',
    displayName: 'Bash / POSIX Shell (Linux SysAdmin & DevOps)',
    category: 'OS & DevOps Automation',
    keywords: ['bash', 'shell', 'linux', 'لينكس', 'شل', 'devops', 'أتمتة السيرفر'],
    baseImage: 'alpine:3.19',
    buildCmd: 'sh -n main.sh',
    testCmd: 'sh main.sh',
    dockerCmd: 'CMD ["sh", "main.sh"]',
    entryFile: 'main.sh',
  },
  powershell: {
    key: 'powershell',
    displayName: 'PowerShell 7 (Windows & Cross-OS Administration)',
    category: 'OS Administration',
    keywords: ['powershell', 'ps1', 'ويندوز', 'باورشيل'],
    baseImage: 'mcr.microsoft.com/powershell:7.4-ubuntu-22.04',
    buildCmd: 'none',
    testCmd: 'pwsh -File main.ps1',
    dockerCmd: 'CMD ["pwsh", "-File", "main.ps1"]',
    entryFile: 'main.ps1',
  },
  pascal: {
    key: 'pascal',
    displayName: 'Free Pascal / Delphi Legacy (Classic Systems)',
    category: 'Classic & Legacy',
    keywords: ['pascal', 'delphi', 'باسكال', 'دلفي'],
    baseImage: 'ubuntu:24.04',
    buildCmd: 'fpc main.pas',
    testCmd: './main',
    dockerCmd: 'CMD ["./main"]',
    entryFile: 'main.pas',
  },
  fortran: {
    key: 'fortran',
    displayName: 'Fortran 90/2018 (Scientific & High-Speed Computing)',
    category: 'Classic & Scientific',
    keywords: ['fortran', 'فورتران', 'حسابات علمية'],
    baseImage: 'gcc:13-bookworm',
    buildCmd: 'gfortran -O2 main.f90 -o app',
    testCmd: './app',
    dockerCmd: 'CMD ["./app"]',
    entryFile: 'main.f90',
  },
  cobol: {
    key: 'cobol',
    displayName: 'GnuCOBOL (Mainframe & Banking Legacy Systems)',
    category: 'Classic & Mainframe Legacy',
    keywords: ['cobol', 'كوبول', 'mainframe', 'بنوك قديمة'],
    baseImage: 'ubuntu:24.04',
    buildCmd: 'cobc -x -free main.cob -o app',
    testCmd: './app',
    dockerCmd: 'CMD ["./app"]',
    entryFile: 'main.cob',
  },
  lua: {
    key: 'lua',
    displayName: 'Lua 5.4 (Embedded Scripting & Game Logic)',
    category: 'Embedded & Scripting',
    keywords: ['lua', 'لوا'],
    baseImage: 'alpine:3.19',
    buildCmd: 'luac -p main.lua',
    testCmd: 'lua main.lua',
    dockerCmd: 'CMD ["lua", "main.lua"]',
    entryFile: 'main.lua',
  },
  flutter: {
    key: 'flutter',
    displayName: 'Dart / Flutter (Cross-Platform Mobile & Desktop)',
    category: 'Mobile & Cross-Platform UI',
    keywords: ['flutter', 'dart', 'فلاتر', 'دارت', 'موبايل', 'android', 'ios'],
    baseImage: 'ghcr.io/cirruslabs/flutter:stable',
    buildCmd: 'dart analyze',
    testCmd: 'dart test',
    dockerCmd: 'CMD ["dart", "run"]',
    entryFile: 'bin/main.dart',
  },
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'inventory-api-go',
    name: 'خادم إدارة المخزون والمبيعات (Go Microservice)',
    title: 'نظام إدارة المخزون والمبيعات',
    ecosystem: 'go',
    prompt: 'بناء خادم REST API عالي التزامن بلغة Go لإدارة المخزون والمبيعات مع قاعدة بيانات محلية SQLite WAL ونقطة /health واختبارات شاملة.',
  },
  {
    id: 'task-fullstack-py',
    name: 'نظام المهام والعملاء المتكامل (Python + SQLite)',
    title: 'نظام إدارة المهام والعملاء',
    ecosystem: 'python',
    prompt: 'تطوير نظام Full-Stack خفيف بلغة Python لإدارة العملاء والمهام اليومية مع ترحيلات SQLite وتوثيق OpenAPI والتحقق من المدخلات.',
  },
  {
    id: 'rust-sec-scanner',
    name: 'أداة فحص الشبكة والملفات عالية السرعة (Rust CLI)',
    title: 'ماسح الأمان السريع',
    ecosystem: 'rust',
    prompt: 'إنشاء أداة CLI آمنة الذاكرة بلغة Rust لفحص الملفات الحساسة وبصمات SHA-256 عبر أنظمة Windows و Linux مع رموز خروج قياسية.',
  },
  {
    id: 'cobol-modernize',
    name: 'ترقية نظام رواتب بنكي قديم (COBOL → Python 3.12)',
    title: 'تحديث نظام الرواتب البنكي',
    ecosystem: 'cobol',
    prompt: 'تحليل نظام رواتب قديم بلغة COBOL وهجرته إلى خدمة Python حديثة آمنة مع اختبارات تطابق السلوك وتقرير تدقيق كامل.',
  },
  {
    id: 'solution-rest-api',
    name: 'خادم REST API كامل (Python + SQLite)',
    title: 'خدمة REST API لإدارة المخزون',
    ecosystem: 'python',
    prompt: '[Solution Domain: rest-api] بناء خادم REST API مع عمليات CRUD وقاعدة SQLite واختبارات وحدة حقيقية.',
  },
  {
    id: 'solution-cli',
    name: 'أداة CLI آمنة لحساب البصمات',
    title: 'ماسح ملفات سريع',
    ecosystem: 'python',
    prompt: '[Solution Domain: cli-tool] أداة سطر أوامر لحساب SHA-256 لملفات مجلد مع تقرير JSON واختبارات.',
  },
  {
    id: 'solution-data-pipeline',
    name: 'خط أنابيب CSV إلى SQL',
    title: 'معالجة بيانات القياسات',
    ecosystem: 'python',
    prompt: '[Solution Domain: data-pipeline] تحويل ملفات CSV إلى SQLite مع تنظيف الصفوف وتقارير.',
  },
  {
    id: 'solution-ml',
    name: 'نموذج انحدار مع استدلال محلي',
    title: 'محرك توقع خفيف',
    ecosystem: 'python',
    prompt: '[Solution Domain: ml-inference] نموذج انحدار خطي بنزول التدرج مع حفظ وتحميل النموذج واختبارات.',
  },
  {
    id: 'solution-security',
    name: 'ماسح أمان للأسرار والمسارات',
    title: 'مدقق الأمان البرمجي',
    ecosystem: 'python',
    prompt: '[Solution Domain: security-scanner] فحص النصوص لاكتشاف المفاتيح المسربة ومحاولات اختراق المسارات.',
  },
  {
    id: 'solution-static-site',
    name: 'مولّد موقع ثابت من JSON',
    title: 'موقع منتجات ثابت',
    ecosystem: 'nodejs',
    prompt: '[Solution Domain: static-site] توليد صفحات HTML من بيانات JSON مع هروب آمن للمحتوى واختبارات.',
  },
  {
    id: 'solution-realtime',
    name: 'مركز أحداث لحظي (Pub/Sub)',
    title: 'نظام إشعارات لحظي',
    ecosystem: 'nodejs',
    prompt: '[Solution Domain: realtime-hub] خادم أحداث مع اشتراك وبث وسجل أحداث واختبارات.',
  },
  {
    id: 'solution-typed',
    name: 'خدمة TypeScript مُقيدة الأنواع',
    title: 'خدمة نطاقية مؤسسية',
    ecosystem: 'typescript',
    prompt: '[Solution Domain: typed-service] خدمة نطاقية مع واجهات صارئة وتحقق مدخلات واختبارات tsx.',
  },
  {
    id: 'solution-go',
    name: 'ميكروسيرفس Go متزامن',
    title: 'خدمة الطلبات عالية التزامن',
    ecosystem: 'go',
    prompt: '[Solution Domain: microservice] خادم HTTP بمخزن آمن التزامن ونقطة صحية واختبارات.',
  },
  {
    id: 'solution-rust',
    name: 'أداة أنظمة Rust آمنة',
    title: 'محلل نصوص عالي الأمان',
    ecosystem: 'rust',
    prompt: '[Solution Domain: systems-cli] أداة CLI ترفض المدخلات غير الآمنة مع اختبارات وحدة.',
  },
  {
    id: 'solution-flutter',
    name: 'تطبيق Flutter متعدد المنصات',
    title: 'تطبيق إدارة المهام',
    ecosystem: 'flutter',
    prompt: '[Solution Domain: mobile-app] نموذج بيانات ونطق أعمال قابل للاختبار لتطبيق موبايل.',
  },
  {
    id: 'solution-game',
    name: 'منطق لعبة Lua',
    title: 'آلة حالة للعبة',
    ecosystem: 'lua',
    prompt: '[Solution Domain: game-logic] آلة حالة انتقالات اللعبة مع اختبارات Lua.',
  },
];

const EXT_ECOSYSTEM_MAP: Record<string, EcosystemKey> = {
  '.go': 'go',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.cs': 'csharp',
  '.java': 'java',
  '.ts': 'typescript',
  '.js': 'nodejs',
  '.php': 'php',
  '.rb': 'ruby',
  '.pas': 'pascal',
  '.f90': 'fortran',
  '.cob': 'cobol',
  '.cbl': 'cobol',
  '.lua': 'lua',
  '.dart': 'flutter',
  '.ps1': 'powershell',
  '.sh': 'bash',
};

export function detectEcosystem(prompt: string, filenames: string[] = [], explicitKey?: EcosystemKey): EcosystemMeta {
  if (explicitKey && ECOSYSTEM_CATALOG[explicitKey]) {
    return ECOSYSTEM_CATALOG[explicitKey];
  }

  const tagMatch = (prompt || '').match(/\[Target Ecosystem:\s*([a-z0-9_]+)\]/i);
  if (tagMatch) {
    const k = tagMatch[1].toLowerCase() as EcosystemKey;
    if (ECOSYSTEM_CATALOG[k]) {
      return ECOSYSTEM_CATALOG[k];
    }
  }

  for (const name of filenames) {
    const dot = name.lastIndexOf('.');
    if (dot !== -1) {
      const ext = name.slice(dot).toLowerCase();
      const mapped = EXT_ECOSYSTEM_MAP[ext];
      if (mapped && ECOSYSTEM_CATALOG[mapped]) {
        return ECOSYSTEM_CATALOG[mapped];
      }
    }
  }

  const low = ` ${(prompt || '').toLowerCase()} `;
  for (const meta of Object.values(ECOSYSTEM_CATALOG)) {
    if (meta.key === 'python') continue;
    if (meta.keywords.some((kw) => low.includes(kw))) {
      return meta;
    }
  }

  return ECOSYSTEM_CATALOG.python;
}

export function generateMultiOsAndContainerBundle(title: string, eco: EcosystemMeta): {
  slug: string;
  dockerfile: string;
  dockerCompose: string;
  dockerignore: string;
  makefile: string;
  systemdService: string;
  systemdPath: string;
  runSh: string;
  runBat: string;
} {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'genesis-omega-service';
  if (!/^[a-z]/.test(slug)) slug = `svc-${slug}`;

  let extraInstall = '';
  if (eco.key === 'cobol') {
    extraInstall =
      'RUN apt-get update && apt-get install -y --no-install-recommends gnucobol && rm -rf /var/lib/apt/lists/*\n';
  } else if (eco.key === 'pascal') {
    extraInstall =
      'RUN apt-get update && apt-get install -y --no-install-recommends fp-compiler && rm -rf /var/lib/apt/lists/*\n';
  }

  const buildStep = eco.buildCmd !== 'none' ? `RUN ${eco.buildCmd}\n` : '';

  const dockerfile = [
    `# Hardened Multi-OS Container (${eco.displayName})`,
    `FROM ${eco.baseImage}`,
    '',
    'WORKDIR /app',
    extraInstall ? extraInstall.trimEnd() : null,
    'COPY . .',
    buildStep ? buildStep.trimEnd() : null,
    'RUN (addgroup -S omegauser && adduser -S omegauser -G omegauser) || useradd -m -r omegauser || true',
    'USER omegauser',
    'EXPOSE 8000',
    'HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1',
    eco.dockerCmd,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const dockerCompose = [
    'services:',
    `  ${slug}:`,
    '    build: .',
    `    container_name: ${slug}`,
    '    ports:',
    '      - "8000:8000"',
    '    restart: unless-stopped',
    '    security_opt:',
    '      - no-new-privileges:true',
    '    read_only: false',
    '',
  ].join('\n');

  const dockerignore = [
    '.git',
    '.env',
    '__pycache__',
    '*.pyc',
    'node_modules',
    'dist',
    '*.db-wal',
    '*.db-shm',
    '.DS_Store',
    '',
  ].join('\n');

  const makefile = [
    `.PHONY: build test run docker-up clean`,
    '',
    'build:',
    `\t${eco.buildCmd !== 'none' ? eco.buildCmd : '@echo "No compile step needed"'}`,
    '',
    'test:',
    `\t${eco.testCmd}`,
    '',
    'run:',
    '\tbash run.sh',
    '',
    'docker-up:',
    '\tdocker compose up --build -d',
    '',
    'clean:',
    '\trm -rf __pycache__ *.db-wal *.db-shm dist',
    '',
  ].join('\n');

  const systemdPath = `deploy/${slug}.service`;
  const systemdService = [
    '[Unit]',
    `Description=${title} (Built by GENESIS-OMEGA)`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=/opt/${slug}`,
    `ExecStart=/bin/bash /opt/${slug}/run.sh`,
    'Restart=always',
    'RestartSec=5',
    'User=omegauser',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');

  const runSh = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `echo "Starting ${title} (${eco.displayName})..."`,
    eco.buildCmd !== 'none' ? eco.buildCmd : '# No build step required',
    eco.testCmd,
    '',
  ].join('\n');

  const runBat = [
    '@echo off',
    `echo Starting ${title} (${eco.displayName})...`,
    eco.buildCmd !== 'none' ? eco.buildCmd : 'REM No build step required',
    eco.testCmd,
    '',
  ].join('\n');

  return {
    slug,
    dockerfile,
    dockerCompose,
    dockerignore,
    makefile,
    systemdService,
    systemdPath,
    runSh,
    runBat,
  };
}
