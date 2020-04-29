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

import * as firestore from '../../';

import { hardAssert } from '../../../src/util/assert';

import { Document } from '../../../src/model/document';
import { DocumentKey } from '../../../src/model/document_key';
import { Firestore } from './database';
import { ResourcePath } from '../../../src/model/path';
import { Code, FirestoreError } from '../../../src/util/error';
import { AutoId } from '../../../src/util/misc';
import {
  invokeBatchGetDocumentsRpc,
  invokeCommitRpc
} from '../../../src/remote/datastore';
import {
  ServerTimestampBehavior,
  UserDataWriter
} from '../../../src/api/user_data_writer';
import {Precondition} from "../../../src/model/mutation";
import {invalidClassError} from "../../../src/util/input_validation";
import {applyFirestoreDataConverter} from "../../../src/api/database";
import {
  DocumentKeyReference,
  UserDataReader
} from "../../../src/api/user_data_reader";
import {PlatformSupport} from "../../../src/platform/platform";
import {DatabaseId} from "../../../src/core/database_info";

/**
 * A reference to a particular document in a collection in the database.
 */
export class DocumentReference<T = firestore.DocumentData>
  implements firestore.DocumentReference<T> {
  constructor(public _key: DocumentKey, readonly firestore: Firestore) {}
}

export class DocumentSnapshot<T = firestore.DocumentData> {
  constructor(
    private _firestore: Firestore,
    private _key: DocumentKey,
    public _document: Document | null
  ) {}

  get exists(): boolean {
    return this._document !== null;
  }

  data(): T | undefined {
    if (!this._document) {
      return undefined;
    } else {
      const userDataWriter = new UserDataWriter(
        this._firestore._databaseId,
        /* timestampsInSnapshots= */ false,
        /* serverTimestampBehavior=*/ 'none',
        key => new DocumentReference(key, this._firestore)
      );
      return userDataWriter.convertValue(this._document.toProto()) as T;
    }
  }
}

export class CollectionReference<T = firestore.DocumentData>
  implements firestore.CollectionReference<T> {
  constructor(readonly _path: ResourcePath, readonly firestore: Firestore) {}

  doc(pathString?: string): DocumentReference<T> {
    if (pathString === '') {
      throw new FirestoreError(
        Code.INVALID_ARGUMENT,
        'Document path must be a non-empty string'
      );
    }
    const path = ResourcePath.fromString(pathString || AutoId.newId());
    return new DocumentReference<T>(
      new DocumentKey(this._path.child(path)),
      this.firestore
    );
  }
}

export async function getDocument<T>(
  reference: DocumentReference<T>
): Promise<DocumentSnapshot> {
  const firestore = reference.firestore;
  await firestore._ensureClientConfigured();
  const result = await invokeBatchGetDocumentsRpc(firestore._datastore!, [
    reference._key
  ]);
  hardAssert(result.length == 1, 'Expected a single document result');
  const maybeDocument = result[0];
  return new DocumentSnapshot<firestore.DocumentData>(
    firestore,
    reference._key,
    maybeDocument instanceof Document ? maybeDocument : null
  );
}

export async function setDocument<T>(
  reference: DocumentReference<T>,
  data: T,
  options: firestore.SetOptions = {}
): Promise<void> {
  const firestore = reference.firestore;
  await firestore._ensureClientConfigured();
  const convertedValue = data; // TODO(support converter)
  const dataReader = new UserDataReader(PlatformSupport.getPlatform().newSerializer(firestore._databaseId), v => userDataReaderPreConverter(firestore._databaseId, v));
  const parsed =
    options.merge || options.mergeFields
      ? dataReader.parseMergeData(
      'setDocument',
      convertedValue,
      options.mergeFields
      )
      : dataReader.parseSetData(
      'setDocument',
      convertedValue
      );
  await invokeCommitRpc(firestore._datastore!, parsed.toMutations(reference._key, Precondition.none()));
}


function userDataReaderPreConverter(databaseId: DatabaseId, value: unknown): unknown {
  if (value instanceof DocumentReference) {
    const thisDb = databaseId;
    const otherDb = value.firestore._databaseId;
    if (!otherDb.isEqual(thisDb)) {
      throw new FirestoreError(
        Code.INVALID_ARGUMENT,
        'Document reference is for database ' +
        `${otherDb.projectId}/${otherDb.database} but should be ` +
        `for database ${thisDb.projectId}/${thisDb.database}`
      );
    }
    return new DocumentKeyReference(databaseId, value._key);
  } else {
    return value;
  }
}
