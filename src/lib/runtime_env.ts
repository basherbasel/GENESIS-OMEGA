/**
 * Environment accessor safe on both Node and browser.
 *
 * Several model/catalog modules are imported by React views and therefore end
 * up in the Vite client bundle, where a bare `process` reference throws
 * ReferenceError. All such reads must go through this helper.
 */
export function runtimeEnvValue(key: string): string {
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return nodeEnv?.[key] || '';
}

export function runtimeEnvFlag(key: string): boolean {
  return runtimeEnvValue(key) === '1';
}
