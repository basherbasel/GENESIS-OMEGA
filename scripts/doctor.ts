import { checkToolchains } from '../src/lib/toolchain_doctor';

const report = checkToolchains();

console.log('GENESIS-OMEGA — toolchain doctor\n');
for (const tool of report.tools) {
  const mark = tool.available ? 'OK     ' : 'MISSING';
  console.log(`[${mark}] ${tool.command.padEnd(10)} ${tool.version || tool.installHint}`);
}
console.log(
  `\nReady ecosystems: ${report.readyEcosystems}/${report.totalEcosystems}` +
    `   ·   Verifiable solution domains: ${report.readyDomains}/${report.totalDomains}`,
);

const missing = report.tools.filter((t) => !t.available);
if (missing.length > 0) {
  console.log('\nTo install missing toolchains on Windows:');
  for (const tool of missing) console.log(`  ${tool.installHint}`);
  process.exitCode = 1;
}
