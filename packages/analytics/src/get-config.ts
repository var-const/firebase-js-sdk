import { FirebaseApp } from '@firebase/app-types';

interface DynamicConfig {
  "projectId": string,
  "appId": string,
  "databaseURL": string,
  "storageBucket": string,
  "locationId": string,
  "apiKey": string,
  "authDomain": string,
  "messagingSenderId": string,
  "measurementId": string
};

const DYNAMIC_CONFIG_URL = "https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig";

export function getHeaders(apiKey: string): Headers {
  return new Headers({
    Accept: 'application/json',
    'x-goog-api-key': apiKey
  });
}

/**
 * Fetches dynamic config from backend.
 * @param app Firebase app to fetch config for.
 */
export async function fetchDynamicConfig(app: FirebaseApp): Promise<DynamicConfig> {
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

export async function getMeasurementId(app:FirebaseApp): Promise<string> {
  const { measurementId } = await fetchDynamicConfig(app);
  return measurementId;
}