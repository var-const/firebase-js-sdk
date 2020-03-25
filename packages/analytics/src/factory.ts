/**
 * @license
 * Copyright 2019 Google LLC
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

import {
  FirebaseAnalytics,
  Gtag,
  SettingsOptions,
  DynamicConfig
} from '@firebase/analytics-types';
import {
  logEvent,
  setCurrentScreen,
  setUserId,
  setUserProperties,
  setAnalyticsCollectionEnabled
} from './functions';
import {
  initializeGAId,
  insertScriptTag,
  getOrCreateDataLayer,
  wrapOrCreateGtag,
  findGtagScriptOnPage
} from './helpers';
import { AnalyticsError, ERROR_FACTORY } from './errors';
import { FirebaseApp } from '@firebase/app-types';
import { FirebaseInstallations } from '@firebase/installations-types';
import { fetchDynamicConfig } from './get-config';
import { logger } from './logger';

/**
 * Maps appId to full initialization promise.
 */
let initializationPromisesMap: { [appId: string]: Promise<void> } = {};

/**
 * List of dynamic config fetch promises.
 */
let dynamicConfigPromisesList: Array<Promise<DynamicConfig>> = [];

/**
 * Maps fetched measurementIds to appId.
 */
const measurementIdToAppId: { [measurementId: string]: string } = {};

/**
 * Name for window global data layer array used by GA: defaults to 'dataLayer'.
 */
let dataLayerName: string = 'dataLayer';

/**
 * Name for window global gtag function used by GA: defaults to 'gtag'.
 */
let gtagName: string = 'gtag';

/**
 * Reproduction of standard gtag function or reference to existing
 * gtag function on window object.
 */
let gtagCoreFunction: Gtag;

/**
 * Wrapper around gtag function that ensures FID is sent with all
 * relevant event and config calls.
 */
let wrappedGtagFunction: Gtag;

/**
 * Flag to ensure page initialization steps (creation or wrapping of
 * dataLayer and gtag script) are only run once per page load.
 */
let globalInitDone: boolean = false;

/**
 * For testing
 */
export function resetGlobalVars(
  newGlobalInitDone = false,
  newGaInitializedPromise = {},
  newDynamicPromises = []
): void {
  globalInitDone = newGlobalInitDone;
  initializationPromisesMap = newGaInitializedPromise;
  dynamicConfigPromisesList = newDynamicPromises;
  dataLayerName = 'dataLayer';
  gtagName = 'gtag';
}

/**
 * For testing
 */
export function getGlobalVars(): {
  initializationPromisesMap: { [gaId: string]: Promise<void> };
  dynamicConfigPromisesList: Array<Promise<DynamicConfig>>;
} {
  return {
    initializationPromisesMap,
    dynamicConfigPromisesList
  };
}

/**
 * This must be run before calling firebase.analytics() or it won't
 * have any effect.
 * @param options Custom gtag and dataLayer names.
 */
export function settings(options: SettingsOptions): void {
  if (globalInitDone) {
    throw ERROR_FACTORY.create(AnalyticsError.ALREADY_INITIALIZED);
  }
  if (options.dataLayerName) {
    dataLayerName = options.dataLayerName;
  }
  if (options.gtagName) {
    gtagName = options.gtagName;
  }
}

export function factory(
  app: FirebaseApp,
  installations: FirebaseInstallations
): FirebaseAnalytics {
  // const analyticsId = app.options[ANALYTICS_ID_FIELD];
  // if (!analyticsId) {
  //   throw ERROR_FACTORY.create(AnalyticsError.NO_GA_ID);
  // }
  const appId = app.options.appId;
  if (!appId) {
    //TODO: Change to AppId error
    throw ERROR_FACTORY.create(AnalyticsError.NO_GA_ID);
  }

  if (initializationPromisesMap[appId] != null) {
    //TODO: Change to AppId error?
    throw ERROR_FACTORY.create(AnalyticsError.ALREADY_EXISTS, {
      id: appId
    });
  }

  if (!globalInitDone) {
    // Steps here should only be done once per page: creation or wrapping
    // of dataLayer and global gtag function.

    // Detect if user has already put the gtag <script> tag on this page.
    if (!findGtagScriptOnPage()) {
      insertScriptTag(dataLayerName);
    }
    getOrCreateDataLayer(dataLayerName);

    const { wrappedGtag, gtagCore } = wrapOrCreateGtag(
      initializationPromisesMap,
      dynamicConfigPromisesList,
      measurementIdToAppId,
      dataLayerName,
      gtagName
    );
    wrappedGtagFunction = wrappedGtag;
    gtagCoreFunction = gtagCore;

    globalInitDone = true;
  }
  // Async but non-blocking.
  const dynamicConfigPromise = fetchDynamicConfig(app);
  // Once fetched, map measurementIds to appId, for ease of lookup in wrapped gtag function.
  dynamicConfigPromise
    .then(config => (measurementIdToAppId[config.measurementId] = config.appId))
    .catch(e => logger.error(e));
  // Add to list to track state of all dynamic config promises.
  dynamicConfigPromisesList.push(dynamicConfigPromise);
  // This map reflects the completion state of all promises for each appId.
  initializationPromisesMap[appId] = initializeGAId(
    dynamicConfigPromise,
    installations,
    gtagCoreFunction
  );
  // fidPromisesMap[appId] = initializeGAId(
  //   app,
  //   installations,
  //   gtagCoreFunction
  // );

  const analyticsInstance: FirebaseAnalytics = {
    app,
    logEvent: (eventName, eventParams, options) =>
      logEvent(
        wrappedGtagFunction,
        dynamicConfigPromise,
        eventName,
        eventParams,
        options
      ),
    setCurrentScreen: (screenName, options) =>
      setCurrentScreen(
        wrappedGtagFunction,
        dynamicConfigPromise,
        screenName,
        options
      ),
    setUserId: (id, options) =>
      setUserId(wrappedGtagFunction, dynamicConfigPromise, id, options),
    setUserProperties: (properties, options) =>
      setUserProperties(
        wrappedGtagFunction,
        dynamicConfigPromise,
        properties,
        options
      ),
    setAnalyticsCollectionEnabled: enabled =>
      setAnalyticsCollectionEnabled(dynamicConfigPromise, enabled)
  };

  return analyticsInstance;
}
