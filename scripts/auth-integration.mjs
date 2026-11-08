// Compatibility entry point: only the ownership-verified disposable harness may mutate test data.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('./control-disposable-check.mjs',import.meta.url));
const child=spawn(process.execPath,[target,'--review-api'],{env:process.env,windowsHide:true,stdio:'inherit'});
child.on('error',()=>{console.error('DISPOSABLE_RUNNER_FAILED');process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
