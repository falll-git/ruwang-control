import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandNotFoundError,ConflictError,RequestValidationError,toPublicError} from '../src/server/errors.ts';
test('only explicit Control command absence is recoverable, not generic validation',()=>{
  assert.deepEqual(toPublicError(new CommandNotFoundError()),{code:'COMMAND_NOT_FOUND',message:'Keputusan belum tercatat di Control.',status:404});
  assert.equal(toPublicError(new RequestValidationError('COMMAND_NOT_FOUND')).status,400);
});
test('duplicate username has an actionable credential error, without changing version conflicts',()=>{
  assert.equal(toPublicError(new ConflictError('USERNAME_ALREADY_EXISTS')).message,'Username sudah digunakan. Pilih username lain.');
  assert.match(toPublicError(new ConflictError()).message,/Data sumber sudah berubah/);
});
