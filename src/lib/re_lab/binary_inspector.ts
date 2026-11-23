/**
 * Defensive binary, firmware and protocol structural inspector (v5).
 *
 * Zero dependencies, canonical path guards, bounded memory (32 MiB default).
 * Intended strictly for diagnostics, interoperability, digital-twin parameter
 * extraction and defensive vulnerability auditing. No exploit generation.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type BinaryFormat = 'elf' | 'pe' | 'macho' | 'android-boot' | 'gpt' | 'gguf' | 'raw';

export interface BinaryPathValidation {
  ok: boolean;
  resolved: string;
  code?: 'UNSAFE_PATH' | 'FILE_NOT_FOUND';
  message: string;
}

const SYSTEM_PREFIXES = [
  '/windows', '/program files', '/program files (x86)', '/etc', '/usr', '/bin',
  '/sbin', '/system', '/library', '/applications', '/proc', '/sys', '/dev',
  '/root', '/var', '/boot', '/lib', '/private',
];

/** Canonical file guard: rejects roots, traversal, drive-relative and symlink escapes. */
export function validateBinaryPath(rawPath: string): BinaryPathValidation {
  const reject = (code: BinaryPathValidation['code'], message: string): BinaryPathValidation => ({
    ok: false,
    resolved: '',
    code,
    message,
  });
  const trimmed = (rawPath || '').trim();
  if (!trimmed) return reject('UNSAFE_PATH', 'empty binary path');
  if (trimmed.includes('\0') || /[;&|`$<>]/.test(trimmed)) return reject('UNSAFE_PATH', 'illegal characters');
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => part === '..')) return reject('UNSAFE_PATH', 'traversal rejected');
  if (/^[a-z]:[^/]/i.test(normalized)) return reject('UNSAFE_PATH', 'drive-relative path rejected');
  const tail = /^[a-z]:/.test(normalized.toLowerCase()) ? normalized.toLowerCase().slice(2) : normalized.toLowerCase();
  if (SYSTEM_PREFIXES.some((prefix) => tail === prefix || tail.startsWith(`${prefix}/`))) {
    return reject('UNSAFE_PATH', 'OS system root rejected');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(trimmed);
  } catch {
    return reject('FILE_NOT_FOUND', `path does not exist: ${trimmed}`);
  }
  if (!stat.isFile()) return reject('FILE_NOT_FOUND', 'path is not a regular file');

  const real = fs.realpathSync(trimmed);
  const realLower = real.replace(/\\/g, '/').toLowerCase();
  if (SYSTEM_PREFIXES.some((prefix) => realLower.startsWith(prefix))) {
    return reject('UNSAFE_PATH', 'resolved path is inside a forbidden root');
  }
  const relative = path.relative(path.dirname(real), real);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return reject('UNSAFE_PATH', 'symlink escape rejected');
  }
  return { ok: true, resolved: real, message: 'ok' };
}

function ascii(value: string): boolean {
  return value.length === 4 && value.charCodeAt(0) === 0x7f && value.slice(1) === 'ELF';
}

export function detectBinaryFormat(buffer: Buffer): BinaryFormat {
  if (buffer.length < 4) return 'raw';
  if (ascii(buffer.subarray(0, 4).toString('latin1'))) return 'elf';
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return 'pe';
  const magic32 = buffer.readUInt32BE(0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic32)) return 'macho';
  if (buffer.subarray(0, 8).toString('latin1') === 'ANDROID!') return 'android-boot';
  if (buffer.length >= 520 && buffer.subarray(512, 520).toString('latin1') === 'EFI PART') return 'gpt';
  if (buffer.subarray(0, 4).toString('latin1') === 'GGUF') return 'gguf';
  return 'raw';
}

export function parseElfHeader(buffer: Buffer): Record<string, string | number> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const is64 = view.getUint8(4) === 2;
  const little = view.getUint8(5) === 1;
  const num = (offset: number, size: 2 | 4): number =>
    size === 2 ? view.getUint16(offset, little) : view.getUint32(offset, little);
  const entry = is64 && little
    ? Number(view.getBigUint64(24, true))
    : is64
      ? Number(view.getBigUint64(24, false))
      : num(24, 4);
  return {
    class: is64 ? 'ELF64' : 'ELF32',
    endianness: little ? 'little' : 'big',
    machine: num(18, 2),
    version: num(20, 4),
    entryPoint: entry,
    programHeaderOffset: is64 ? Number(view.getBigUint64(32, little)) : num(28, 4),
    sectionHeaderOffset: is64 ? Number(view.getBigUint64(40, little)) : num(32, 4),
  };
}

export function parsePeHeader(buffer: Buffer): Record<string, string | number> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset + 24 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString('latin1') !== 'PE\0\0') {
    return { signature: 'MZ', error: 'PE signature missing' };
  }
  return {
    signature: 'PE\\0\\0',
    peOffset,
    machine: view.getUint16(peOffset + 4, true),
    sectionCount: view.getUint16(peOffset + 6, true),
    optionalHeaderSize: view.getUint16(peOffset + 20, true),
    optionalMagic: view.getUint16(peOffset + 24, true),
  };
}

export function parseMachOHeader(buffer: Buffer): Record<string, string | number> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, false);
  const little = magic === 0xcefaedfe || magic === 0xcffaedfe;
  const is64 = magic === 0xfeedfacf || magic === 0xcffaedfe;
  return {
    magic: `0x${magic.toString(16)}`,
    class: is64 ? 'Mach-O 64' : 'Mach-O 32',
    endianness: little ? 'little' : 'big',
    cpuType: view.getUint32(4, little),
    fileType: view.getUint32(12, little),
  };
}

export function parseAndroidBootHeader(buffer: Buffer): Record<string, number | string> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const u32 = (offset: number) => view.getUint32(offset, true);
  return {
    magic: 'ANDROID!',
    kernelSize: u32(8),
    ramdiskSize: u32(16),
    secondSize: u32(24),
    tagsAddress: u32(32),
    pageSize: u32(36),
    headerVersion: u32(40),
  };
}

export function parseGptHeader(buffer: Buffer): Record<string, number | string> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const base = 512;
  if (buffer.length < base + 92) return { magic: 'EFI PART', error: 'truncated GPT header' };
  return {
    magic: 'EFI PART',
    revision: view.getUint32(base + 8, true),
    headerSize: view.getUint32(base + 12, true),
    partitionEntryLba: Number(view.getBigUint64(base + 72, true)),
    partitionCount: view.getUint32(base + 80, true),
    partitionEntrySize: view.getUint32(base + 84, true),
  };
}

export function parseGgufHeader(buffer: Buffer): Record<string, number | string> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const version = view.getUint32(4, true);
  return {
    magic: 'GGUF',
    version,
    tensorCount: Number(view.getBigUint64(8, true)),
    kvMetadataCount: Number(view.getBigUint64(16, true)),
  };
}

/** Shannon entropy in [0, 8] bits per byte for a real byte buffer. */
export function shannonEntropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (const byte of buffer) counts[byte] += 1;
  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const probability = count / buffer.length;
    entropy -= probability * Math.log2(probability);
  }
  return Math.round(entropy * 10_000) / 10_000;
}

export interface EntropyWindow {
  offset: number;
  size: number;
  entropy: number;
  classification: 'high-entropy (compressed/encrypted)' | 'mixed' | 'low-entropy (code/tables)';
}

export function entropyProfile(buffer: Buffer, windowSize = 4_096): EntropyWindow[] {
  const size = Math.max(256, Math.min(65_536, windowSize));
  const windows: EntropyWindow[] = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    const slice = buffer.subarray(offset, Math.min(offset + size, buffer.length));
    const entropy = shannonEntropy(slice);
    windows.push({
      offset,
      size: slice.length,
      entropy,
      classification: entropy > 7.5 ? 'high-entropy (compressed/encrypted)' : entropy < 6 ? 'low-entropy (code/tables)' : 'mixed',
    });
  }
  return windows.slice(0, 256);
}

export interface ExtractedString {
  offset: number;
  encoding: 'ascii' | 'utf16le';
  value: string;
}

export function extractPrintableStrings(buffer: Buffer, minLength = 4, limit = 200): ExtractedString[] {
  const results: ExtractedString[] = [];
  let current = '';
  let start = 0;
  for (let i = 0; i < buffer.length && results.length < limit; i += 1) {
    const byte = buffer[i];
    if (byte >= 0x20 && byte <= 0x7e) {
      if (!current) start = i;
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) results.push({ offset: start, encoding: 'ascii', value: current.slice(0, 200) });
      current = '';
    }
  }
  if (current.length >= minLength && results.length < limit) results.push({ offset: start, encoding: 'ascii', value: current.slice(0, 200) });

  current = '';
  start = 0;
  for (let i = 0; i + 1 < buffer.length && results.length < limit; i += 2) {
    const code = buffer.readUInt16LE(i);
    const char = String.fromCharCode(code);
    if (code >= 0x20 && code <= 0x7e) {
      if (!current) start = i;
      current += char;
    } else {
      if (current.length >= minLength) results.push({ offset: start, encoding: 'utf16le', value: current.slice(0, 200) });
      current = '';
    }
  }
  return results;
}

export type FieldType =
  | 'uint8' | 'uint16be' | 'uint16le' | 'uint32be' | 'uint32le'
  | 'float32be' | 'float32le' | 'crc16_modbus';

export interface FrameField {
  name: string;
  type: FieldType;
}

export interface DecodedField {
  name: string;
  type: FieldType;
  offset: number;
  value: number | null;
  valid?: boolean;
}

export function crc16Modbus(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

/** Decodes a raw protocol frame against an explicit field schema (defensive RE). */
export function decodeProtocolFrame(hex: string, fields: FrameField[]): {
  bytes: number;
  fields: DecodedField[];
  crcValid: boolean | null;
} {
  const clean = (hex || '').trim().replace(/^0x/i, '').replace(/[\s:-]/g, '');
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('invalid hex payload');
  }
  const buffer = Buffer.from(clean, 'hex');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const decoded: DecodedField[] = [];
  let offset = 0;
  let crcValid: boolean | null = null;

  for (const field of fields.slice(0, 64)) {
    if (offset >= buffer.length) {
      decoded.push({ name: field.name, type: field.type, offset, value: null, valid: false });
      continue;
    }
    const little = field.type.endsWith('le');
    switch (field.type) {
      case 'uint8':
        decoded.push({ name: field.name, type: field.type, offset, value: view.getUint8(offset) });
        offset += 1;
        break;
      case 'uint16be':
      case 'uint16le':
        decoded.push({ name: field.name, type: field.type, offset, value: view.getUint16(offset, little) });
        offset += 2;
        break;
      case 'uint32be':
      case 'uint32le':
        decoded.push({ name: field.name, type: field.type, offset, value: view.getUint32(offset, little) });
        offset += 4;
        break;
      case 'float32be':
      case 'float32le':
        decoded.push({ name: field.name, type: field.type, offset, value: view.getFloat32(offset, little) });
        offset += 4;
        break;
      case 'crc16_modbus': {
        const expected = crc16Modbus(buffer.subarray(0, offset));
        const actual = view.getUint16(offset, true);
        crcValid = expected === actual;
        decoded.push({ name: field.name, type: field.type, offset, value: actual, valid: crcValid });
        offset += 2;
        break;
      }
    }
  }
  return { bytes: buffer.length, fields: decoded, crcValid };
}

export interface BinaryInspectionResult {
  file: string;
  size: number;
  format: BinaryFormat;
  header: Record<string, string | number>;
  entropy: EntropyWindow[];
  strings: ExtractedString[];
  recommendation: string[];
  at: string;
  cache?: { hit: boolean; durationMs: number };
}

/** Minimal cache contract so the inspector stays dependency-free. */
export interface InspectionCache {
  getOrCompute<T>(
    scope: string,
    files: Record<string, string>,
    version: string,
    compute: () => T,
  ): { value: T; hit: boolean; durationMs: number };
}

export function headerForFormat(format: BinaryFormat, buffer: Buffer): Record<string, string | number> {
  switch (format) {
    case 'elf': return parseElfHeader(buffer);
    case 'pe': return parsePeHeader(buffer);
    case 'macho': return parseMachOHeader(buffer);
    case 'android-boot': return parseAndroidBootHeader(buffer);
    case 'gpt': return parseGptHeader(buffer);
    case 'gguf': return parseGgufHeader(buffer);
    default: return { format: 'raw', firstBytes: buffer.subarray(0, 16).toString('hex') };
  }
}

function recommendationsFor(format: BinaryFormat, entropy: EntropyWindow[]): string[] {
  const base: Record<BinaryFormat, string> = {
    elf: 'binary-software: map sections, symbols and entry point for interoperability diagnostics',
    pe: 'binary-software: inspect COFF machine, sections and imports for compatibility auditing',
    macho: 'binary-software: inspect load commands and CPU type for portability analysis',
    'android-boot': 'firmware-embedded: extract kernel/ramdisk sizes and page geometry for digital-twin parameters',
    gpt: 'firmware-embedded: map partition table geometry before any mount or imaging',
    gguf: 'ai-model-graph: read tensor/KV counts then feed the local-edge-ai division',
    raw: 'firmware-embedded: run entropy and string profiling before selecting a parser',
  };
  const out = [base[format]];
  if (entropy.some((window) => window.entropy > 7.5)) {
    out.push('high-entropy windows detected: treat as compressed/encrypted data; do not attempt code execution');
  }
  return out;
}

/** Inspects a real file with canonical guards and bounded memory. */
export function inspectBinaryArtifact(
  filePath: string,
  options: { maxBytes?: number; windowSize?: number; maxStrings?: number } = {},
  cache?: InspectionCache,
): BinaryInspectionResult {
  const validation = validateBinaryPath(filePath);
  if (!validation.ok) throw new Error(`${validation.code}: ${validation.message}`);
  const maxBytes = Math.max(1024, Math.min(64 * 1024 * 1024, options.maxBytes ?? 32 * 1024 * 1024));
  const stat = fs.statSync(validation.resolved);
  if (stat.size > maxBytes) throw new Error(`PAYLOAD_TOO_LARGE: ${stat.size} > ${maxBytes}`);
  const buffer = fs.readFileSync(validation.resolved);

  const compute = (): Omit<BinaryInspectionResult, 'cache'> => {
    const format = detectBinaryFormat(buffer);
    const entropy = entropyProfile(buffer, options.windowSize);
    return {
      file: validation.resolved,
      size: buffer.length,
      format,
      header: headerForFormat(format, buffer),
      entropy,
      strings: extractPrintableStrings(buffer, 4, options.maxStrings ?? 200),
      recommendation: recommendationsFor(format, entropy),
      at: new Date().toISOString(),
    };
  };

  if (!cache) return compute();

  // Key by the artifact's real SHA-256 digest; unchanged bytes reuse the
  // structural inspection in milliseconds instead of re-parsing 32 MiB.
  const fileDigest = crypto.createHash('sha256').update(buffer).digest('hex');
  const cached = cache.getOrCompute(
    're-inspect',
    { [validation.resolved]: fileDigest },
    'v5.0.1',
    compute,
  );
  return { ...cached.value, cache: { hit: cached.hit, durationMs: cached.durationMs } };
}
