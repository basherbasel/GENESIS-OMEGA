/**
 * Runtime schema for omega_store.json.
 *
 * `loadStore()` reads the whole JSON file into memory; a partial or corrupted
 * document must be rejected before any project is used. Unknown fields are
 * preserved via passthrough so older stores keep loading while still being
 * type-checked on the fields the server dereferences unconditionally.
 */

import { z } from 'zod';

const dialogueTurnSchema = z
  .object({
    id: z.number().int(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })
  .passthrough();

const projectSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    prompt: z.string(),
    status: z.string(),
    files: z.record(z.string(), z.string()),
  })
  .passthrough();

const vaultEntrySchema = z
  .object({
    id: z.number().int(),
    domain: z.string(),
    pattern: z.string(),
    verifiedWisdom: z.string(),
  })
  .passthrough();

const watchFolderSchema = z
  .object({
    id: z.number().int(),
    folderPath: z.string(),
    enabled: z.boolean(),
  })
  .passthrough();

export const storeDataSchema = z
  .object({
    nextProjectId: z.number().int().nonnegative(),
    nextVaultId: z.number().int().nonnegative(),
    nextWatchId: z.number().int().nonnegative(),
    nextDialogueId: z.number().int().nonnegative(),
    projects: z.array(projectSchema),
    vault: z.array(vaultEntrySchema),
    watches: z.array(watchFolderSchema),
    cognitive: z
      .object({
        traits: z.record(z.string(), z.string()),
        recentDialogue: z.array(dialogueTurnSchema),
        pendingSuggestion: z.unknown().nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export type StoreDataShape = z.infer<typeof storeDataSchema>;

/** Throw a readable ZodError when the persisted state is structurally invalid. */
export function parseStoreData<T>(raw: unknown): T {
  return storeDataSchema.parse(raw) as T;
}

/** Safe boolean form for callers that want to log instead of throw. */
export function isValidStoreData(raw: unknown): boolean {
  return storeDataSchema.safeParse(raw).success;
}
