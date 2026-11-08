// Explicit fault injection: creator exits before cleanup so recovery can be tested.
import {createDisposable,writeOwnedSecret} from './control-disposable.mjs';
import {randomBytes} from 'node:crypto';
if(process.argv[2]!=='--owned-recovery-test')throw Error('EXPLICIT_FAULT_FLAG_REQUIRED');
const run=await createDisposable();
writeOwnedSecret(run,randomBytes(32).toString('hex'));
console.log(JSON.stringify({root:run.root,runId:run.runId}));
