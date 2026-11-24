#include "physics_dsp.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

namespace idt {
namespace {

constexpr std::size_t kWindowSize = 16;
constexpr double kPi = 3.14159265358979323846;

double derivative(double temperatureK, double accelRms, const ThermalParams& p) {
  const double generation = p.eta * accelRms * accelRms;
  const double convection = p.hA * (temperatureK - p.ambientK);
  return (generation - convection) / p.cTh;
}

}  // namespace

double rk4Step(double temperatureK, double aRms, const ThermalParams& p, double dtSeconds) {
  const double k1 = derivative(temperatureK, aRms, p);
  const double k2 = derivative(temperatureK + 0.5 * dtSeconds * k1, aRms, p);
  const double k3 = derivative(temperatureK + 0.5 * dtSeconds * k2, aRms, p);
  const double k4 = derivative(temperatureK + dtSeconds * k3, aRms, p);
  return temperatureK + (dtSeconds / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

double rk4Predict(double temperatureK, double aRms, const ThermalParams& p, double horizonSeconds) {
  if (!std::isfinite(temperatureK) || !std::isfinite(aRms) || horizonSeconds <= 0.0) return temperatureK;
  constexpr double kStep = 0.5;
  const std::size_t steps = static_cast<std::size_t>(std::ceil(horizonSeconds / kStep));
  double value = temperatureK;
  for (std::size_t i = 0; i < steps; ++i) {
    value = rk4Step(value, aRms, p, kStep);
    if (!std::isfinite(value)) return temperatureK;
  }
  return value;
}

void dftPeakAndEntropy(const std::vector<double>& window, double sampleRateHz,
                       double& peakHz, double& entropyBits) {
  peakHz = 0.0;
  entropyBits = 0.0;
  if (sampleRateHz <= 0.0) return;

  std::vector<double> samples(kWindowSize, 0.0);
  const std::size_t copyCount = std::min(window.size(), kWindowSize);
  for (std::size_t i = 0; i < copyCount; ++i) {
    samples[i] = std::isfinite(window[i]) ? window[i] : 0.0;
  }

  const std::size_t bins = kWindowSize / 2 + 1;
  std::vector<double> power(bins, 0.0);
  for (std::size_t k = 0; k < bins; ++k) {
    double real = 0.0;
    double imaginary = 0.0;
    for (std::size_t n = 0; n < kWindowSize; ++n) {
      const double angle = -2.0 * kPi * static_cast<double>(k * n) / static_cast<double>(kWindowSize);
      real += samples[n] * std::cos(angle);
      imaginary += samples[n] * std::sin(angle);
    }
    power[k] = (real * real + imaginary * imaginary) / static_cast<double>(kWindowSize);
  }

  double peakPower = -1.0;
  for (std::size_t k = 1; k < bins; ++k) {
    if (power[k] > peakPower) {
      peakPower = power[k];
      peakHz = static_cast<double>(k) * sampleRateHz / static_cast<double>(kWindowSize);
    }
  }

  double total = 0.0;
  for (const double value : power) total += value;
  if (total > 0.0) {
    for (const double value : power) {
      if (value <= 0.0) continue;
      const double probability = value / total;
      entropyBits -= probability * std::log2(probability);
    }
  }
}

DspResult analyze(const std::vector<double>& accelMagnitudes, double sampleRateHz,
                  double currentTempK, const ThermalParams& params, double horizonSeconds) {
  DspResult result;
  if (accelMagnitudes.empty()) return result;

  result.accelMagnitude = accelMagnitudes.back();
  double sumSquares = 0.0;
  for (const double value : accelMagnitudes) {
    const double safe = std::isfinite(value) ? value : 0.0;
    sumSquares += safe * safe;
  }
  result.accelRms = std::sqrt(sumSquares / static_cast<double>(accelMagnitudes.size()));

  std::vector<double> window;
  const std::size_t start = accelMagnitudes.size() > kWindowSize ? accelMagnitudes.size() - kWindowSize : 0;
  for (std::size_t i = start; i < accelMagnitudes.size(); ++i) window.push_back(accelMagnitudes[i]);
  dftPeakAndEntropy(window, sampleRateHz, result.peakHz, result.spectralEntropy);

  result.velocityRmsProxy = result.accelRms / (2.0 * kPi * std::max(result.peakHz, 1.0));
  result.predictedTempK = rk4Predict(currentTempK, result.accelRms, params, horizonSeconds);
  if (horizonSeconds > 0.0) {
    result.thermalRiseRate = (result.predictedTempK - currentTempK) / horizonSeconds;
  }
  return result;
}

}  // namespace idt
