import { act } from '@testing-library/react';

/** Await actual traversal(s), including React's resulting render/effects. */
export async function settleHistory(count = 1) {
  await act(async () => {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('popstate', pop);
        reject(new Error(`Timed out waiting for ${count} history traversal(s)`));
      }, 2000);
      function pop() {
        if (--count > 0) return;
        window.clearTimeout(timeout);
        window.removeEventListener('popstate', pop);
        resolve();
      }
      window.addEventListener('popstate', pop);
    });
  });
}
