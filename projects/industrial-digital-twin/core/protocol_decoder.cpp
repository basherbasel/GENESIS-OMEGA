#include "protocol_decoder.hpp"

#include <cmath>
#include <cstring>

namespace idt {
namespace {

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

std::uint16_t readU16BE(const std::uint8_t* p) {
  return static_cast<std::uint16_t>((static_cast<std::uint16_t>(p[0]) << 8) | p[1]);
}

std::uint32_t readU32BE(const std::uint8_t* p) {
  return (static_cast<std::uint32_t>(p[0]) << 24) |
         (static_cast<std::uint32_t>(p[1]) << 16) |
         (static_cast<std::uint32_t>(p[2]) << 8) |
         static_cast<std::uint32_t>(p[3]);
}

float readF32BE(const std::uint8_t* p) {
  const std::uint32_t raw = readU32BE(p);
  float value = 0.0F;
  std::memcpy(&value, &raw, sizeof(value));
  return value;
}

}  // namespace

std::uint16_t crc16Modbus(const std::uint8_t* data, std::size_t length) {
  std::uint16_t crc = 0xFFFF;
  for (std::size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      crc = (crc & 1U) != 0U ? static_cast<std::uint16_t>((crc >> 1) ^ 0xA001U)
                            : static_cast<std::uint16_t>(crc >> 1);
    }
  }
  return crc;
}

bool decodeHex(const std::string& hex, std::vector<std::uint8_t>& out, std::string& error) {
  out.clear();
  if (hex.size() != 40) {
    error = "frame must be exactly 40 hex characters (20 bytes)";
    return false;
  }
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    const int high = hexValue(hex[i]);
    const int low = hexValue(hex[i + 1]);
    if (high < 0 || low < 0) {
      error = "invalid hexadecimal character";
      out.clear();
      return false;
    }
    out.push_back(static_cast<std::uint8_t>((high << 4) | low));
  }
  return true;
}

bool decodeFrame(const std::vector<std::uint8_t>& bytes, DecodedFrame& out, std::string& error) {
  if (bytes.size() != 20) {
    error = "frame length must be 20 bytes";
    return false;
  }
  const std::uint16_t computed = crc16Modbus(bytes.data(), 18);
  const std::uint16_t received = readU16BE(bytes.data() + 18);
  if (computed != received) {
    error = "CRC-16/MODBUS mismatch";
    return false;
  }

  DecodedFrame frame;
  frame.magic = readU16BE(bytes.data());
  if (frame.magic != 0x5A3C) {
    error = "unexpected frame magic";
    return false;
  }
  frame.deviceId = readU16BE(bytes.data() + 2);
  frame.timestampMs = readU32BE(bytes.data() + 4);
  frame.accelX = readF32BE(bytes.data() + 8);
  frame.accelY = readF32BE(bytes.data() + 12);
  frame.tempRaw = readU16BE(bytes.data() + 16);
  frame.crc = received;

  if (!std::isfinite(frame.accelX) || !std::isfinite(frame.accelY)) {
    error = "non-finite acceleration value";
    return false;
  }
  frame.temperatureK = 233.15 + (static_cast<double>(frame.tempRaw) * 0.0625);
  if (!std::isfinite(frame.temperatureK)) {
    error = "non-finite calibrated temperature";
    return false;
  }

  out = frame;
  return true;
}

}  // namespace idt
