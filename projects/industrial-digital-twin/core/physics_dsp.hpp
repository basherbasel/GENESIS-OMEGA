#pragma once

#include <cstddef>
#include <vector>

namespace idt {

struct ThermalParams {
  double eta = 1.0;        // mechanical-to-thermal coupling factor (W per (m/s^2)^2)
  double hA = 0.8;         // convection conductance (W/K)
  double ambientK = 298.15;  // ambient temperature (K)
  double cTh = 240.0;      // lumped heat capacity (J/K)
};

struct DspResult {
  double accelMagnitude = 0.0;   // m/s^2
  double accelRms = 0.0;         // m/s^2
  double velocityRmsProxy = 0.0; // m/s
  double peakHz = 0.0;           // Hz
  double spectralEntropy = 0.0;  // bits
  double predictedTempK = 0.0;   // K at horizon
  double thermalRiseRate = 0.0;  // K/s
};

/** One RK4 step of the lumped-capacitance thermal balance. */
double rk4Step(double temperatureK, double aRms, const ThermalParams& params, double dtSeconds);

/** Predicts `horizonSeconds` ahead using fixed 0.5 s RK4 steps. */
double rk4Predict(double temperatureK, double aRms, const ThermalParams& params, double horizonSeconds);

/** Spectral peak and Shannon entropy of a Naive DFT over one 16-sample window. */
void dftPeakAndEntropy(const std::vector<double>& window, double sampleRateHz,
                       double& peakHz, double& entropyBits);

/** Full deterministic DSP analysis over the acceleration-magnitude series. */
DspResult analyze(const std::vector<double>& accelMagnitudes, double sampleRateHz,
                  double currentTempK, const ThermalParams& params, double horizonSeconds);

}  // namespace idt
