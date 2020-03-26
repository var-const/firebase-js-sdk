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

const DYNAMIC_CONFIG_URL =
  'https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig';

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

export async function getMeasurementId(app: FirebaseApp): Promise<string> {
  const { measurementId } = await fetchDynamicConfig(app);
  return measurementId;
}
