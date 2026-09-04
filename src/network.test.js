import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NETWORK_UNAVAILABLE,
  fetchWithNetworkError,
  isNetworkUnavailableError,
} from './network.js';

test('returns successful and HTTP error responses without rewriting them', async () => {
  for (const response of [{ ok: true, status: 200 }, { ok: false, status: 503 }]) {
    const result = await fetchWithNetworkError('https://example.com/api', {}, {
      fetchImpl: async () => response,
    });
    assert.equal(result, response);
  }
});

test('turns a rejected fetch into an actionable operational error', async () => {
  const cause = new TypeError('Failed to fetch');

  await assert.rejects(
    fetchWithNetworkError('http://localhost:3000/api/health', {}, {
      service: 'JobMaxxing API',
      hint: 'Start the web app and try again.',
      fetchImpl: async () => {
        throw cause;
      },
    }),
    (error) => {
      assert.equal(error.name, 'NetworkUnavailableError');
      assert.equal(error.code, NETWORK_UNAVAILABLE);
      assert.equal(error.cause, cause);
      assert.match(error.message, /JobMaxxing API at http:\/\/localhost:3000/);
      assert.match(error.message, /Start the web app and try again/);
      assert.equal(isNetworkUnavailableError(error), true);
      return true;
    },
  );
});
