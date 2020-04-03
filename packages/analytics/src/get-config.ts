/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FirebaseApp } from '@firebase/app-types';
import { DynamicConfig } from '@firebase/analytics-types';
import { FirebaseError } from '@firebase/util';
import { calculateBackoffMillis } from './exponential_backoff';
import { AnalyticsError, ERROR_FACTORY } from './errors';

/**
 * Encapsulates metadata concerning throttled fetch requests.
 */
export interface ThrottleMetadata {
  // The number of times fetch has backed off. Used for resuming backoff after a timeout.
  backoffCount: number;
  // The Unix timestamp in milliseconds when callers can retry a request.
  throttleEndTimeMillis: number;
}

const FETCH_TIMEOUT_MILLIS = 60 * 1000;

const DYNAMIC_CONFIG_URL =
  'https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig';

const appThrottleMetadata: { [appId: string]: ThrottleMetadata } = {};

function getHeaders(apiKey: string): Headers {
  return new Headers({
    Accept: 'application/json',
    'x-goog-api-key': apiKey
  });
}

/**
 * Fetches dynamic config from backend.
 * @param app Firebase app to fetch config for.
 */
export async function fetchDynamicConfig(
  app: FirebaseApp
): Promise<DynamicConfig> {
  if (!app.options.apiKey || !app.options.appId) {
    //TODO: Put in proper error, may need two.
    throw new Error('no api key');
  }
  const request: RequestInit = {
    method: 'GET',
    headers: getHeaders(app.options.apiKey)
  };
  const appUrl = DYNAMIC_CONFIG_URL.replace('{app-id}', app.options.appId);
  const response = await fetch(appUrl, request);
  return response.json();
}

/**
 * Fetches dynamic config from backend, retrying if failed.
 * @param app Firebase app to fetch config for.
 */
export async function fetchDynamicConfigWithRetry(
  app: FirebaseApp
): Promise<DynamicConfig> {
  if (!app.options.apiKey || !app.options.appId) {
    //TODO: Put in proper error, may need two.
    throw new Error('no api key');
  }

  const throttleMetadata: ThrottleMetadata = appThrottleMetadata[
    app.options.appId
  ] || {
    backoffCount: 0,
    throttleEndTimeMillis: Date.now()
  };

  const signal = new AnalyticsAbortSignal();

  setTimeout(async () => {
    // Note a very low delay, eg < 10ms, can elapse before listeners are initialized.
    signal.abort();
  }, FETCH_TIMEOUT_MILLIS);

  return attemptFetchDynamicConfigWithRetry(app, throttleMetadata, signal);
}

/**
 * Runs one retry attempt.
 * @param app Firebase app to fetch config for.
 * @param throttleMetadata Ongoing metadata to determine throttling times.
 * @param signal Abort signal.
 */
async function attemptFetchDynamicConfigWithRetry(
  app: FirebaseApp,
  { throttleEndTimeMillis, backoffCount }: ThrottleMetadata,
  signal: AnalyticsAbortSignal
): Promise<DynamicConfig> {
  if (!app.options.apiKey || !app.options.appId) {
    //TODO: Put in proper error, may need two.
    throw new Error('no api key');
  }
  // Starts with a (potentially zero) timeout to support resumption from stored state.
  // Ensures the throttle end time is honored if the last attempt timed out.
  // Note the SDK will never make a request if the fetch timeout expires at this point.
  await setAbortableTimeout(signal, throttleEndTimeMillis);

  try {
    const response = await fetchDynamicConfig(app);

    // Note the SDK only clears throttle state if response is success or non-retriable.
    delete appThrottleMetadata[app.options.appId];

    return response;
  } catch (e) {
    if (!isRetriableError(e)) {
      delete appThrottleMetadata[app.options.appId];
      throw e;
    }

    // Increments backoff state.
    const throttleMetadata = {
      throttleEndTimeMillis: Date.now() + calculateBackoffMillis(backoffCount),
      backoffCount: backoffCount + 1
    };

    // Persists state.
    appThrottleMetadata[app.options.appId] = throttleMetadata;

    return attemptFetchDynamicConfigWithRetry(app, throttleMetadata, signal);
  }
}

export function setAbortableTimeout(
  signal: AnalyticsAbortSignal,
  throttleEndTimeMillis: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Derives backoff from given end time, normalizing negative numbers to zero.
    const backoffMillis = Math.max(throttleEndTimeMillis - Date.now(), 0);

    const timeout = setTimeout(resolve, backoffMillis);

    // Adds listener, rather than sets onabort, because signal is a shared object.
    signal.addEventListener(() => {
      clearTimeout(timeout);

      // If the request completes before this timeout, the rejection has no effect.
      reject(
        ERROR_FACTORY.create(AnalyticsError.FETCH_THROTTLE, {
          throttleEndTimeMillis
        })
      );
    });
  });
}

/**
 * Returns true if the {@link Error} indicates a fetch request may succeed later.
 */
function isRetriableError(e: Error): boolean {
  if (!(e instanceof FirebaseError)) {
    return false;
  }

  // Uses string index defined by ErrorData, which FirebaseError implements.
  const httpStatus = Number(e['httpStatus']);

  return (
    httpStatus === 429 ||
    httpStatus === 500 ||
    httpStatus === 503 ||
    httpStatus === 504
  );
}

/**
 * Shims a minimal AbortSignal (copied from Remote Config).
 *
 * <p>AbortController's AbortSignal conveniently decouples fetch timeout logic from other aspects
 * of networking, such as retries. Firebase doesn't use AbortController enough to justify a
 * polyfill recommendation, like we do with the Fetch API, but this minimal shim can easily be
 * swapped out if/when we do.
 */
export class AnalyticsAbortSignal {
  listeners: Array<() => void> = [];
  addEventListener(listener: () => void): void {
    this.listeners.push(listener);
  }
  abort(): void {
    this.listeners.forEach(listener => listener());
  }
}
