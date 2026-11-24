#include "physics_dsp.hpp"
#include "protocol_decoder.hpp"

#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <numbers>
#include <vector>

namespace {

constexpr const char* kValidHex = "5a3c12346553f1003fc00000bf4ccccd012c84f1";

idt::DecodedFrame decodeValid() {
  std::vector<std::uint8_t> bytes;
  std::string error;
  assert(idt::decodeHex(kValidHex, bytes, error));
  idt::DecodedFrame frame;
  assert(idt::decodeFrame(bytes, frame, error));
  return frame;
}

}  // namespace

int main() {
  // CRC-16/MODBUS known-vector and strict hex decoding.
  std::vector<std::uint8_t> bytes;
  std::string error;
  assert(idt::decodeHex(kValidHex, bytes, error));
  assert(bytes.size() == 20);
  assert(idt::crc16Modbus(bytes.data(), 18) == 0x84F1);
  assert(!idt::decodeHex("5a3c1234", bytes, error));
  assert(idt::decodeHex(kValidHex, bytes, error));

  // Frame decoding, calibration and big-endian float32 handling.
  const idt::DecodedFrame frame = decodeValid();
  assert(frame.magic == 0x5A3C);
  assert(frame.deviceId == 0x1234);
  assert(frame.timestampMs == 1700000000U);
  assert(std::fabs(frame.accelX - 1.5F) < 1e-6);
  assert(std::fabs(frame.accelY + 0.8F) < 1e-6);
  assert(frame.tempRaw == 300);
  assert(std::fabs(frame.temperatureK - (233.15 + 300 * 0.0625)) < 1e-9);

  // Corrupted CRC, bad magic, truncation and NaN are rejected fail-closed.
  std::vector<std::uint8_t> corrupted = bytes;
  corrupted[19] ^= 0x01;
  idt::DecodedFrame rejected;
  assert(!idt::decodeFrame(corrupted, rejected, error));
  std::vector<std::uint8_t> badMagic = bytes;
  badMagic[0] = 0x00;
  badMagic[18] = static_cast<std::uint8_t>(idt::crc16Modbus(badMagic.data(), 18) >> 8);
  badMagic[19] = static_cast<std::uint8_t>(idt::crc16Modbus(badMagic.data(), 18) & 0xFF);
  assert(!idt::decodeFrame(badMagic, rejected, error));
  assert(!idt::decodeFrame(std::vector<std::uint8_t>(bytes.begin(), bytes.begin() + 19), rejected, error));

  // DFT peak accuracy within 1e-4 on a bin-aligned 4 Hz sine at 64 Hz / N=16.
  constexpr double kPi = 3.14159265358979323846;
  std::vector<double> sine(16, 0.0);
  for (std::size_t i = 0; i < sine.size(); ++i) {
    sine[i] = 2.0 * std::sin(2.0 * kPi * 4.0 * static_cast<double>(i) / 64.0);
  }
  double peakHz = 0.0;
  double entropy = 0.0;
  idt::dftPeakAndEntropy(sine, 64.0, peakHz, entropy);
  assert(std::fabs(peakHz - 4.0) < 1e-4);
  assert(entropy >= 0.0 && entropy <= 4.0);

  // RK4 thermal model: cooling is monotone toward ambient; heating is monotone.
  const idt::ThermalParams cooling;
  double temperature = 320.0;
  for (int i = 0; i < 120; ++i) {
    const double next = idt::rk4Step(temperature, 0.0, cooling, 0.5);
    assert(next <= temperature);
    assert(next >= cooling.ambientK - 1e-6);
    temperature = next;
  }
  idt::ThermalParams heating;
  heating.hA = 0.0;
  double rising = 300.0;
  for (int i = 0; i < 120; ++i) {
    const double next = idt::rk4Step(rising, 2.0, heating, 0.5);
    assert(next > rising);
    rising = next;
  }

  // Full DSP analysis is finite and bounded.
  std::vector<double> magnitudes(16, 1.5);
  const idt::DspResult result = idt::analyze(magnitudes, 64.0, 310.0, cooling, 60.0);
  assert(std::isfinite(result.accelRms) && result.accelRms > 0.0);
  assert(std::isfinite(result.predictedTempK) && result.predictedTempK > 0.0);
  assert(std::isfinite(result.spectralEntropy));

  std::cout << "IDT_CORE_OK\n";
  return 0;
}
