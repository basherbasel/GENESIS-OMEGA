#include "physics_dsp.hpp"
#include "protocol_decoder.hpp"

#include <cmath>
#include <iostream>
#include <string>
#include <vector>

namespace {

std::string jsonEscape(const std::string& value) {
  std::string out;
  for (const char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: out += c;
    }
  }
  return out;
}

void printError(const std::string& message) {
  std::cout << "{\"valid\":false,\"error\":\"" << jsonEscape(message) << "\"}\n";
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3 || std::string(argv[1]) != "--decode-hex") {
    printError("usage: engine_cli --decode-hex <40-char-hex>");
    return 2;
  }

  const std::string hex(argv[2]);
  std::vector<std::uint8_t> bytes;
  std::string error;
  if (!idt::decodeHex(hex, bytes, error)) {
    printError(error);
    return 1;
  }

  idt::DecodedFrame frame;
  if (!idt::decodeFrame(bytes, frame, error)) {
    printError(error);
    return 1;
  }

  const idt::ThermalParams params;
  const double magnitude = std::hypot(static_cast<double>(frame.accelX), static_cast<double>(frame.accelY));
  const double predicted = idt::rk4Predict(frame.temperatureK, magnitude, params, 60.0);

  std::cout << "{\"valid\":true"
            << ",\"magic\":\"" << std::hex << frame.magic << std::dec << "\""
            << ",\"deviceId\":" << frame.deviceId
            << ",\"timestampMs\":" << frame.timestampMs
            << ",\"accelX\":" << frame.accelX
            << ",\"accelY\":" << frame.accelY
            << ",\"tempRaw\":" << frame.tempRaw
            << ",\"crc\":\"" << std::hex << frame.crc << std::dec << "\""
            << ",\"temperatureK\":" << frame.temperatureK
            << ",\"accelMagnitude\":" << magnitude
            << ",\"predictedTempK\":" << predicted
            << "}\n";
  return 0;
}
