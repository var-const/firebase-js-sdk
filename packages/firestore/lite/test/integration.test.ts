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

import { expect } from 'chai';
import { withTestDoc } from './helpers';
import { getDocument, setDocument } from '../src/api/reference';

describe('Database', () => {
  it('can get a document', () => {
    return withTestDoc(async docRef => {
      const docSnap = await getDocument(docRef);
      expect(docSnap.exists).to.be.false;
    });
  });

  it('can set a document', () => {
    return withTestDoc(async docRef => {
      await setDocument(docRef, { foo: 'bar' });
      const docSnap = await getDocument(docRef);
      expect(docSnap.data()).to.deep.equal({ foo: 'bar' });
    });
  });

  it('can merge a document', () => {
    return withTestDoc(async docRef => {
      await setDocument(docRef, { foo: 'foo' }, { merge: true });
      await setDocument(docRef, { bar: 'bar' }, { merge: true });
      const docSnap = await getDocument(docRef);
      expect(docSnap.data()).to.deep.equal({ foo: 'foo', bar: 'bar' });
    });
  });
});
