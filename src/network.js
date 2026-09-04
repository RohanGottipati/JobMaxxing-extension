export const NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE';

function targetOrigin(input) {
  try {
    return new URL(String(input)).origin;
  } catch {
    return String(input);
  }
}

export function createNetworkUnavailableError(service, input, hint, cause) {
  const suffix = hint ? ` ${hint}` : '';
  const error = new Error(`Could not connect to ${service} at ${targetOrigin(input)}.${suffix}`);
  error.name = 'NetworkUnavailableError';
  error.code = NETWORK_UNAVAILABLE;
  error.cause = cause;
  return error;
}

export function isNetworkUnavailableError(error) {
  return error?.code === NETWORK_UNAVAILABLE;
}

export async function fetchWithNetworkError(
  input,
  init,
  { service = 'the server', hint = '', fetchImpl = globalThis.fetch } = {},
) {
  try {
    return await fetchImpl(input, init);
  } catch (cause) {
    throw createNetworkUnavailableError(service, input, hint, cause);
  }
}
