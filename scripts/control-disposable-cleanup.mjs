import {recoverDisposable} from '../tests/support/control-disposable.mjs';
const root=process.argv[2];
if(!root || process.argv.length!==3)throw Error('Usage: node scripts/control-disposable-cleanup.mjs ABSOLUTE_OWNED_RUN_DIRECTORY');
try{console.log(JSON.stringify(await recoverDisposable(root)));}
catch(error){console.error(JSON.stringify({status:'rejected',code:/^[A-Z_]+$/.test(error.message)?error.message:'CLEANUP_FAILED_NO_BROAD_FALLBACK'}));process.exitCode=1;}
