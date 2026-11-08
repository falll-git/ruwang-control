// Explicit one-shot maintenance. No dotenv, scheduler, preview or target fallback.
import './control-server-loader.mjs';
import {getRuntimeConfig} from '../src/lib/env.ts';
import {checkDatabaseReadiness,query} from '../src/server/database.ts';
import {runReviewDispatchCycle} from '../src/server/review-adapter.ts';
const [flag,instanceId,...extra]=process.argv.slice(2);
try{
  if(flag!=='--instance'||extra.length||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(instanceId??''))throw Error('INSTANCE_ARGUMENT_REQUIRED');
  const config=getRuntimeConfig();
  if(!config.CONTROL_ENABLE_BANK_INTEGRATION)throw Error('BANK_INTEGRATION_DISABLED');
  const [identity]=await query(`SELECT current_user AS role, current_database() AS database, rolsuper, rolbypassrls,
    has_schema_privilege(current_user,'control','CREATE') AS can_create FROM pg_roles WHERE rolname=current_user`);
  if(identity?.role!==config.CONTROL_DATABASE_RUNTIME_ROLE||identity.database!==config.CONTROL_DATABASE_NAME||identity.rolsuper||identity.rolbypassrls||identity.can_create)throw Error('RUNTIME_ROLE_REQUIRED');
  await checkDatabaseReadiness();
  const [instance]=await query("SELECT id FROM control.instances WHERE id=$1 AND enabled=true AND review_authority='central'",[instanceId]);
  if(!instance)throw Error('CENTRAL_INSTANCE_REQUIRED');
  const result=await runReviewDispatchCycle(instanceId);
  console.log(JSON.stringify({instanceId,...result}));
  if(result.failed)process.exitCode=1;
}catch(error){
  // No connection strings, credentials, raw response or free-text exception.
  console.error(JSON.stringify({status:'failed',code:/^[A-Z_]+$/.test(error.message)?error.message:'DISPATCH_CYCLE_FAILED'}));process.exitCode=1;
}finally{await globalThis.__ruwangControlPool?.end();}
