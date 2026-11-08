import assert from 'node:assert/strict';

export async function runRetirementChecks({check,reviewer,double,items,client,getReviewDetail}) {
  await check('retired public checking performs no network and supplies no public claim',async()=>{
    const before=double.stats().requests;
    for(const snapshot of items){
      const detail=await getReviewDetail(reviewer.principal,snapshot.snapshot_id);
      for(const field of ['publicVisibility','publicObservation','publicEvidence'])assert.ok(!(field in detail));
    }
    assert.equal(double.stats().requests,before);
  });
  await check('retired audit tables absent from runtime schema and inaccessible to runtime role',async()=>{
    for(const table of ['verified_subject_bindings','subject_binding_versions','public_observation_attempts']){
      assert.equal((await client.query("SELECT to_regclass($1) AS value",['control.'+table])).rows[0].value,null);
      await assert.rejects(client.query('SELECT * FROM control_audit_archive.'+table),e=>e.code==='42501');
    }
  });
}
