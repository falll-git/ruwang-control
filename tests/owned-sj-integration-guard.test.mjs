import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedEnvironment} from './support/owned-sj-integration.mjs';

test('integration launcher rejects inherited operational targets before spawning anything', () => {
  for (const key of ['DATABASE_URL','DATABASE_SYSTEM_URL','CONTROL_MIGRATION_DATABASE_URL','REDIS_URL','SJ_TEST_CENTRAL_BASE_URL','SJ_TEST_PUBLIC_WEB_BASE_URL','SJ_MEDIA_FILESYSTEM_ROOT','UPLOAD_DIR','UPLOAD_TEMP_DIR']) {
    assert.throws(() => isolatedEnvironment({[key]:'sentinel-operational-target'}), /EXTERNAL_TEST_TARGET_REJECTED/);
  }
});
test('integration launcher forwards infrastructure only, never secrets or legacy opt-ins', () => {
  assert.deepEqual(isolatedEnvironment({PATH:'tools',SECRET:'private',CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE:'private',RUN_CONTROL_ADAPTER_INTEGRATION:'true',NODE_ENV:'production'}), {PATH:'tools'});
});
