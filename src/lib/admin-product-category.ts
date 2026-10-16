export async function runProductCategoryChangeOnce(
  lock: { current: boolean },
  save: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;

  try {
    await save();
    return true;
  } catch (error) {
    onError(error);
    return false;
  } finally {
    lock.current = false;
  }
}
