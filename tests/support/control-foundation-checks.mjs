import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDashboardSnapshot} from '../../src/server/dashboard.ts';
import {NextRequest} from 'next/server.js';

export async function runFoundationChecks({check,auth,bootstrap,config,password,instanceId,otherInstanceId,reviewer,client}) {
  const login=async username=>auth.loginOperator({username,password},{requestId:randomUUID(),ipHash:null,userAgentHash:null},config);
  for(const username of ['scope-manager','scope-target','foreign-target'])
    await auth.createOperator({actor:bootstrap,username,displayName:username,password,requestId:randomUUID()});
  const manager=await login('scope-manager'),target=await login('scope-target'),foreign=await login('foreign-target');
  const revoke=(actor,targetOperatorId,instance=instanceId)=>auth.revokeOperatorSessions({actor,instanceId:instance,targetOperatorId,requestId:randomUUID()});
  const live=account=>auth.loadOperatorSession(account.token,config,{requestId:randomUUID(),touch:false});
  await check('all internal accounts see the same registered institutions and dashboard',async()=>{
    const visible=await getDashboardSnapshot(reviewer.principal);
    assert.equal(visible.counts.pendingReviews,12);
    assert.deepEqual((await getDashboardSnapshot(manager.session.principal)).counts,visible.counts);
    assert.equal(manager.session.principal.grants.length,2);
    assert.ok(manager.session.principal.grants.every(g=>g.role==='internal_operator'));
    const directory=await auth.listManagedOperators(manager.session);
    assert.ok(directory.operators.length>=6);
    assert.ok(directory.operators.every(o=>o.role==='internal_operator'&&!('grants' in o)));
  });
  await check('global session revoke rejects missing self and unregistered targets without effects',async()=>{
    for(const [id,scope] of [[randomUUID(),instanceId],[manager.session.operator.id,instanceId],[target.session.operator.id,randomUUID()]])
      await assert.rejects(revoke(manager.session,id,scope));
    assert.ok(await live(target));assert.ok(await live(foreign));
  });
  await check('any internal account can revoke another account across registered institutions',async()=>{
    assert.equal(await revoke(manager.session,foreign.session.operator.id,otherInstanceId),1);
    assert.equal(await live(foreign),null);
  });
  await check('revoked actor cannot reuse a stale in-memory principal',async()=>{
    await auth.logoutOperator(manager.session,randomUUID());
    await assert.rejects(revoke(manager.session,target.session.operator.id),e=>e.code==='SESSION_EXPIRED');
    await assert.rejects(auth.createOperator({actor:manager.session,username:'stale-denied',displayName:'Stale denied',password,requestId:randomUUID()}));
    assert.ok(await live(target));
  });
  await check('legacy grant records cannot become live permissions through runtime SQL',async()=>{
    await assert.rejects(client.query('UPDATE control.operator_grants SET active=true,revoked_at=NULL'),e=>e.code==='42501');
    await assert.rejects(client.query("INSERT INTO control.operators(id,username_canonical,display_name,access_role) VALUES($1,'bad-role','Bad role','reviewer')",[randomUUID()]),e=>e.code==='23514');
  });
  const csrfRoute=await import('../../app/api/auth/csrf/route.ts');
  const createRoute=await import('../../app/api/operators/route.ts');
  const grantRoute=await import('../../app/api/instances/[instanceId]/operator-grants/route.ts');
  const revokeRoute=await import('../../app/api/instances/[instanceId]/operators/[operatorId]/revoke-sessions/route.ts');
  const dashboardRoute=await import('../../app/api/dashboard/route.ts');
  const freshManager=await login('scope-manager');
  const cookie='control_session='+freshManager.token,origin=config.CONTROL_PUBLIC_ORIGIN;
  const csrfResponse=await csrfRoute.GET(new NextRequest(origin+'/api/auth/csrf',{headers:{cookie}}));
  assert.equal(csrfResponse.status,200);const csrf=(await csrfResponse.json()).data.token;
  const request=(path,body,{session=cookie,token=csrf}={})=>new NextRequest(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie:session,'x-csrf-token':token},body:JSON.stringify(body)});
  const create=body=>createRoute.POST(request('/api/operators',body));
  const apiRevoke=(operatorId,opts)=>revokeRoute.POST(request(`/api/instances/${instanceId}/operators/${operatorId}/revoke-sessions`,{},opts),{params:Promise.resolve({instanceId,operatorId})});
  await check('account creation accepts only name username password and grants full internal access',async()=>{
    const body={username:'http-operator',displayName:'Operator HTTP',password};
    assert.equal((await create({...body,roles:['reviewer'],instanceId})).status,400);
    assert.equal((await create({...body,access_role:'observer'})).status,400);
    const response=await create(body);assert.equal(response.status,201);
    const account=await login(body.username);assert.equal(account.session.principal.grants.length,2);
    for(const scope of [instanceId,otherInstanceId])await auth.requireInstancePermission(account.session,'delivery.retry',scope,randomUUID());
    assert.equal((await create(body)).status,409);
    assert.equal((await createRoute.POST(request('/api/operators',{...body,username:'no-csrf'},{token:'bad'}))).status,403);
    assert.equal((await createRoute.POST(request('/api/operators',{...body,username:'anonymous'},{session:''}))).status,401);
  });
  await check('retired role endpoint returns 410 not fake success and preserves all historical records',async()=>{
    const before=(await client.query('SELECT count(*)::int n FROM control.operator_grants')).rows[0].n;
    const response=await grantRoute.POST(request(`/api/instances/${instanceId}/operator-grants`,{targetOperatorId:target.session.operator.id,role:'reviewer',active:true}));
    assert.equal(response.status,410);assert.equal((await response.json()).error.code,'ROLE_MANAGEMENT_REMOVED');
    assert.equal((await client.query('SELECT count(*)::int n FROM control.operator_grants')).rows[0].n,before);
  });
  await check('dashboard and session revoke HTTP retain authentication CSRF and self protection',async()=>{
    const response=await dashboardRoute.GET(new NextRequest(origin+'/api/dashboard',{headers:{cookie}}));
    assert.equal(response.status,200);assert.equal((await response.json()).data.counts.pendingReviews,12);
    assert.equal((await apiRevoke(target.session.operator.id,{session:''})).status,401);
    assert.equal((await apiRevoke(target.session.operator.id,{token:'bad'})).status,403);
    assert.equal((await apiRevoke(freshManager.session.operator.id)).status,403);
    const success=await apiRevoke(target.session.operator.id);assert.equal(success.status,200);
    assert.equal((await success.json()).data.revoked,1);assert.equal(await live(target),null);
  });
}
