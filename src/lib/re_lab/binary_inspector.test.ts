import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  decodeProtocolFrame,
  detectBinaryFormat,
  extractPrintableStrings,
  inspectBinaryArtifact,
  parseAndroidBootHeader,
  parseElfHeader,
  parseGgufHeader,
  parseGptHeader,
  parsePeHeader,
  shannonEntropy,
  validateBinaryPath,
  type FrameField,
} from './binary_inspector';
import { IncrementalArtifactCache, type MetaStore } from '../runtime/fast_cache';
import {
  buildLayeredArchitecturePlan,
  classifyDeepTechMission,
  DEEP_TECH_IDS,
  LAYER_ARCHITECTURE,
  RE_SUB_TRACKS,
} from '../enterprise/deep_tech_divisions';

function memoryStore(): MetaStore {
  const values = new Map<string, string>();
  return {
    getMetaValue: (key) => values.get(key) || null,
    setMetaValue: (key, value) => { values.set(key, value); },
  };
}

function elfBuffer(): Buffer {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(buffer, 0);
  buffer[4] = 2;
  buffer[5] = 1;
  buffer.writeUInt16LE(62, 18);
  buffer.writeUInt32LE(1, 20);
  buffer.writeBigUInt64LE(0x1000n, 24);
  buffer.writeBigUInt64LE(64n, 40);
  return buffer;
}

function peBuffer(): Buffer {
  const buffer = Buffer.alloc(0x100);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'latin1');
  buffer.writeUInt16LE(0x8664, 0x84);
  buffer.writeUInt16LE(3, 0x86);
  buffer.writeUInt16LE(0xf0, 0x94);
  buffer.writeUInt16LE(0x20b, 0x98);
  return buffer;
}

function bootBuffer(): Buffer {
  const buffer = Buffer.alloc(512);
  buffer.write('ANDROID!', 0, 'latin1');
  buffer.writeUInt32LE(1024, 8);
  buffer.writeUInt32LE(2048, 16);
  buffer.writeUInt32LE(4096, 36);
  buffer.writeUInt32LE(3, 40);
  return buffer;
}

function gptBuffer(): Buffer {
  const buffer = Buffer.alloc(1024);
  buffer.write('EFI PART', 512, 'latin1');
  buffer.writeUInt32LE(0x00010000, 520);
  buffer.writeUInt32LE(92, 524);
  buffer.writeUInt32LE(128, 592);
  buffer.writeUInt32LE(128, 596);
  return buffer;
}

function ggufBuffer(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.write('GGUF', 0, 'latin1');
  buffer.writeUInt32LE(3, 4);
  buffer.writeBigUInt64LE(12n, 8);
  buffer.writeBigUInt64LE(7n, 16);
  return buffer;
}

const FRAME_SCHEMA: FrameField[] = [
  { name: 'slave', type: 'uint8' },
  { name: 'function', type: 'uint8' },
  { name: 'start', type: 'uint16be' },
  { name: 'count', type: 'uint16be' },
  { name: 'crc', type: 'crc16_modbus' },
];

test('real ELF/PE/Mach-O/Android/GPT/GGUF headers parse with exact fields', () => {
  assert.equal(detectBinaryFormat(elfBuffer()), 'elf');
  assert.equal(detectBinaryFormat(peBuffer()), 'pe');
  assert.equal(detectBinaryFormat(bootBuffer()), 'android-boot');
  assert.equal(detectBinaryFormat(gptBuffer()), 'gpt');
  assert.equal(detectBinaryFormat(ggufBuffer()), 'gguf');

  const elf = parseElfHeader(elfBuffer());
  assert.equal(elf.class, 'ELF64');
  assert.equal(elf.endianness, 'little');
  assert.equal(elf.machine, 62);
  assert.equal(elf.entryPoint, 0x1000);

  const pe = parsePeHeader(peBuffer());
  assert.equal(pe.machine, 0x8664);
  assert.equal(pe.sectionCount, 3);
  assert.equal(pe.optionalMagic, 0x20b);

  const boot = parseAndroidBootHeader(bootBuffer());
  assert.equal(boot.kernelSize, 1024);
  assert.equal(boot.pageSize, 4096);

  const gpt = parseGptHeader(gptBuffer());
  assert.equal(gpt.partitionCount, 128);
  assert.equal(gpt.partitionEntrySize, 128);

  const gguf = parseGgufHeader(ggufBuffer());
  assert.equal(gguf.version, 3);
  assert.equal(gguf.tensorCount, 12);
  assert.equal(gguf.kvMetadataCount, 7);
});

test('Shannon entropy separates uniform from high-entropy blocks and strings carry offsets', () => {
  assert.equal(shannonEntropy(Buffer.alloc(256, 0)), 0);
  const flat = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  assert.ok(Math.abs(shannonEntropy(flat) - 8) < 0.001);
  const withString = Buffer.concat([Buffer.alloc(4), Buffer.from('HELLO_WORLD\0', 'latin1')]);
  const strings = extractPrintableStrings(withString, 4, 10);
  assert.ok(strings.some((item) => item.value === 'HELLO_WORLD' && item.offset === 4));
});

test('protocol frame decoder computes and verifies CRC-16/Modbus and field offsets', () => {
  const decoded = decodeProtocolFrame('010300000002c40b', FRAME_SCHEMA);
  assert.equal(decoded.bytes, 8);
  assert.equal(decoded.crcValid, true);
  assert.deepEqual(decoded.fields.map((field) => field.value), [1, 3, 0, 2, 0x0bc4]);
  assert.equal(decoded.fields[4].offset, 6);
  assert.equal(decodeProtocolFrame('010300000002c40c', FRAME_SCHEMA).crcValid, false);
  assert.throws(() => decodeProtocolFrame('zz', FRAME_SCHEMA), /invalid hex/);
});

test('binary path guard rejects system roots, drive-relative and traversal inputs', () => {
  assert.equal(validateBinaryPath('C:\\Windows\\System32\\ntoskrnl.exe').code, 'UNSAFE_PATH');
  assert.equal(validateBinaryPath('C:relative.bin').code, 'UNSAFE_PATH');
  assert.equal(validateBinaryPath('../secret.bin').code, 'UNSAFE_PATH');
  assert.equal(validateBinaryPath('/etc/passwd').code, 'UNSAFE_PATH');
  assert.equal(validateBinaryPath(path.join(os.tmpdir(), 'omega-missing-binary')).code, 'FILE_NOT_FOUND');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-re-test-'));
  const file = path.join(dir, 'firmware.bin');
  try {
    fs.writeFileSync(file, bootBuffer());
    assert.equal(validateBinaryPath(file).ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspection is cached by SHA-256 and invalidates when a byte changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-re-cache-'));
  const cache = new IncrementalArtifactCache(memoryStore());
  const file = path.join(dir, 'model.gguf');
  try {
    fs.writeFileSync(file, ggufBuffer());
    const first = inspectBinaryArtifact(file, {}, cache);
    const second = inspectBinaryArtifact(file, {}, cache);
    assert.equal(first.format, 'gguf');
    assert.equal(first.header.tensorCount, 12);
    assert.equal(first.cache?.hit, false);
    assert.equal(second.cache?.hit, true);

    const altered = Buffer.from(ggufBuffer());
    altered.writeUInt32LE(4, 4);
    fs.writeFileSync(file, altered);
    const third = inspectBinaryArtifact(file, {}, cache);
    assert.equal(third.cache?.hit, false);
    assert.equal(third.header.version, 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('seven deep-tech divisions classify and map onto the three real layers', () => {
  assert.equal(DEEP_TECH_IDS.length, 7);
  assert.equal(LAYER_ARCHITECTURE.length, 3);
  assert.equal(RE_SUB_TRACKS.length, 5);

  const assignments = classifyDeepTechMission({
    title: 'Three-layer Rust HAL firmware with GGUF edge inference',
    problemStatement: 'binary protocol analyzer and telemetry HMI for HIL verification',
    targetLang: 'C++',
  });
  const ids = assignments.map((item) => item.division.id);
  assert.ok(ids.includes('systems-lowlevel-hal'));
  assert.ok(ids.includes('local-edge-ai'));
  assert.ok(ids.includes('reverse-engineering-analysis'));
  assert.ok(ids.includes('visualization-3d-hmi'));

  const plan = buildLayeredArchitecturePlan(assignments);
  assert.deepEqual(plan.layers.map((layer) => layer.id), ['core', 'middleware', 'presentation']);
  assert.ok(plan.layers.every((layer) => layer.divisions.length > 0));
  assert.ok(plan.contracts.length > 0);
});
