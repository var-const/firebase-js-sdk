/**
 * @license
 * Copyright 2017 Google LLC
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

import * as rollup from 'rollup';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';

/**
 * This functions builds a simple JS app that only depends on the provided
 * export. It then uses Rollup to gather all top-level classes and functions
 * that that the export depends on.
 *
 * @return a list of dependencies for the given export
 */
async function extractDependencies(exportName: string): Promise<string[]> {
  const input = tmp.fileSync().name;
  const output = tmp.fileSync().name;

  const beforeContent = `export { ${exportName} } from '${path.resolve(
    __dirname,
    '../../dist/lite/index.js'
  )}';`;
  fs.writeFileSync(input, beforeContent);

  // Run Rollup on the JavaScript above to produce a tree-shaken build
  const bundle = await rollup.rollup({
    input,
    external: id => id.startsWith('@firebase/')
  });
  await bundle.write({ file: output, format: 'es' });

  const afterContent = fs.readFileSync(output, 'utf-8');

  const dependencies: string[] = [];
  for (const line of afterContent.split('\n')) {
    const identifierRe = /^(?:async )?(?:function|class) ([\w]*)/;
    const match = line.match(identifierRe);
    if (match) {
      dependencies.push(match[1]);
    }
  }
  dependencies.sort();
  
  fs.unlinkSync(input);
  fs.unlinkSync(output);
  
  return dependencies;
}

const baseDependencies = [
  'BasePath',
  'Blob',
  'ByteString',
  'DocumentKey',
  'FieldPath',
  'FirestoreError',
  'ObjectValue',
  'PlatformSupport',
  'ResourcePath',
  'Timestamp',
  'argToString',
  'arrayEquals',
  'assertBase64Available',
  'assertUint8ArrayAvailable',
  'binaryStringFromUint8Array',
  'blobEquals',
  'debugAssert',
  'fail',
  'formatPlural',
  'geoPointEquals',
  'getLocalWriteTime',
  'hardAssert',
  'invalidClassError',
  'isMapValue',
  'isNegativeZero',
  'isPlainObject',
  'isServerTimestamp',
  'logError',
  'makeConstructorPrivate',
  'normalizeByteString',
  'normalizeNumber',
  'normalizeTimestamp',
  'numberEquals',
  'objectEquals',
  'objectSize',
  'ordinal',
  'primitiveComparator',
  'timestampEquals',
  'tryGetCustomObjectType',
  'typeOrder',
  'uint8ArrayFromBinaryString',
  'validateArgType',
  'validateExactNumberOfArgs',
  'validateType',
  'valueDescription',
  'valueEquals'
];

const dependencies = new Map<string, string[]>();
dependencies.set('FirebaseFirestore', [
  'DatabaseId',
  'DatabaseInfo',
  'Datastore',
  'FirestoreSettings',
  'OAuthToken',
  'DatastoreImpl',
  'FirebaseCredentialsProvider',
  'Firestore',
  'User',
  'newDatastore',
  ...baseDependencies
]);
dependencies.set('initializeFirestore', [
  'initializeFirestore',
  'FirestoreSettings',
  ...baseDependencies
]);
dependencies.set('DocumentSnapshot', [
  'DatabaseId',
  'DocumentReference',
  'DocumentSnapshot',
  'GeoPoint',
  'UserDataWriter',
  'forEach',
  'getPreviousValue',
  'isValidResourceName',
  ...baseDependencies
]);
dependencies.set(
  'CollectionReference',
  ['DocumentReference', 'CollectionReference', 'AutoId', ...baseDependencies]!
);
dependencies.set(
  'DocumentReference',
  ['DocumentReference', ...baseDependencies]!
);
dependencies.set('getDocument', [
  'Datastore',
  'DatastoreImpl',
  'Document',
  'MaybeDocument',
  'compareArrays',
  'compareBlobs',
  'compareGeoPoints',
  'compareMaps',
  'compareNumbers',
  'compareReferences',
  'compareTimestamps',
  'debugCast',
  'getDocument',
  'invokeBatchGetDocumentsRpc',
  'valueCompare',
  ...dependencies.get('DocumentSnapshot')!
]);
dependencies.set(
  'setDocument',
  ['DocumentReference', ...baseDependencies]!
);

describe('Dependencies', () => {
  dependencies.forEach((actualDependencies, api) => {
    it(api, () => {
      return extractDependencies(api).then(extractedDependencies => {
        actualDependencies.sort();
        expect(extractedDependencies).to.have.members(actualDependencies);
      });
    });
  });
});
