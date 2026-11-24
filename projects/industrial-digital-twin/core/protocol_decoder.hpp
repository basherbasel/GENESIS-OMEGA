#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace idt {

struct DecodedFrame {
  std::uint16_t magic = 0;
  std::uint16_t deviceId = 0;
  std::uint32_t timestampMs = 0;
  float accelX = 0.0F;
  float accelY = 0.0F;
  std::uint16_t tempRaw = 0;
  std::uint16_t crc = 0;
  double temperatureK = 0.0;
};

/** CRC-16/MODBUS: reflected poly 0xA001, init 0xFFFF. */
std::uint16_t crc16Modbus(const std::uint8_t* data, std::size_t length);

/** Strict 40-character hex -> 20 raw bytes. Fails closed on any other input. */
bool decodeHex(const std::string& hex, std::vector<std::uint8_t>& out, std::string& error);

/** Validates magic, length, CRC, endianness and finite floats. */
bool decodeFrame(const std::vector<std::uint8_t>& bytes, DecodedFrame& out, std::string& error);

}  // namespace idt
