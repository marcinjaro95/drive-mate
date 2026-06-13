import { vi } from 'vitest';

export const MOCK_USER = { id: 'user-abc' } as any;

export function createMockBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
    'single',
    'maybeSingle',
    'range',
  ]) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  builder.catch = (fn: any) => Promise.resolve(result).catch(fn);
  return builder;
}
