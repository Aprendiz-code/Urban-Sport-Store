import { describe, expect, it, vi } from 'vitest';
import { runProductCategoryChangeOnce } from '../admin-product-category';

describe('admin product category change', () => {
  it('sends one update when invoked twice before the first save finishes', async () => {
    const lock = { current: false };
    const onError = vi.fn();
    let resolveSave: (() => void) | undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));

    const first = runProductCategoryChangeOnce(lock, save, onError);
    await Promise.resolve();
    await expect(runProductCategoryChangeOnce(lock, save, onError)).resolves.toBe(false);
    resolveSave?.();
    await expect(first).resolves.toBe(true);

    expect(save).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(lock.current).toBe(false);
  });

  it('reports failure and releases the lock for retry', async () => {
    const lock = { current: false };
    const error = new Error('No se pudo guardar');
    const save = vi.fn().mockRejectedValueOnce(error);
    const onError = vi.fn();

    await expect(runProductCategoryChangeOnce(lock, save, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(lock.current).toBe(false);
  });
});
