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

import { expect } from 'chai';
import { SinonStub, stub } from 'sinon';
import '../testing/setup';
import { initializeIds } from './initialize-ids';
import {
  getFakeApp,
  getFakeInstallations
} from '../testing/get-fake-firebase-services';
import { GtagCommand } from './constants';

const mockAnalyticsId = 'abcd-efgh-ijkl';
const mockFid = 'fid-1234-zyxw';
const fakeAppParams = { appId: 'abcdefgh12345:23405', apiKey: 'AAbbCCdd12345' };

describe('FirebaseAnalytics methods', () => {
  it('initializeIds gets FID and measurement ID and calls gtag config with them', async () => {
    const gtagStub: SinonStub = stub();
    const fetchStub = stub(window, 'fetch');
    const mockResponse = new window.Response(
      JSON.stringify({ measurementId: mockAnalyticsId }),
      {
        status: 200
      }
    );
    fetchStub.returns(Promise.resolve(mockResponse));
    const app = getFakeApp(fakeAppParams);
    const installations = getFakeInstallations(mockFid);
    await initializeIds(app, [], {}, installations, gtagStub);
    expect(gtagStub).to.be.calledWith(GtagCommand.CONFIG, mockAnalyticsId, {
      'firebase_id': mockFid,
      'origin': 'firebase',
      update: true
    });
    fetchStub.restore();
  });
});
