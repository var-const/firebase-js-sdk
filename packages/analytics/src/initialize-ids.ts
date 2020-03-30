import { DynamicConfig, Gtag } from '@firebase/analytics-types';
import { GtagCommand, GA_FID_KEY, ORIGIN_KEY } from './constants';
import { FirebaseInstallations } from '@firebase/installations-types';
import { fetchDynamicConfig } from './get-config';
import { logger } from './logger';
import { FirebaseApp } from '@firebase/app-types';

/**
 * Initialize the analytics instance in gtag.js by calling config command with fid.
 *
 * NOTE: We combine analytics initialization and setting fid together because we want fid to be
 * part of the `page_view` event that's sent during the initialization
 * @param app Firebase app
 * @param gtagCore The gtag function that's not wrapped.
 */
export async function initializeGAId(
  app: FirebaseApp,
  dynamicConfigPromisesList: Array<Promise<DynamicConfig>>,
  measurementIdToAppId: { [key: string]: string },
  installations: FirebaseInstallations,
  gtagCore: Gtag
): Promise<string> {
  const dynamicConfigPromise = fetchDynamicConfig(app);
  // Once fetched, map measurementIds to appId, for ease of lookup in wrapped gtag function.
  dynamicConfigPromise
    .then(config => (measurementIdToAppId[config.measurementId] = config.appId))
    .catch(e => logger.error(e));
  // Add to list to track state of all dynamic config promises.
  dynamicConfigPromisesList.push(dynamicConfigPromise);

  const [dynamicConfig, fid] = await Promise.all([
    dynamicConfigPromise,
    installations.getId()
  ]);

  // This command initializes gtag.js and only needs to be called once for the entire web app,
  // but since it is idempotent, we can call it multiple times.
  // We keep it together with other initialization logic for better code structure.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gtagCore('js' as any, new Date());

  // It should be the first config command called on this GA-ID
  // Initialize this GA-ID and set FID on it using the gtag config API.
  gtagCore(GtagCommand.CONFIG, dynamicConfig.measurementId, {
    [GA_FID_KEY]: fid,
    // guard against developers accidentally setting properties with prefix `firebase_`
    [ORIGIN_KEY]: 'firebase',
    update: true
  });
  return dynamicConfig.measurementId;
}
