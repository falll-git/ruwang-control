import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('login and operator username HTML patterns support Unicode sets without weakening allowed names',()=>{
  for(const name of ['../app/login/login-form.tsx','../components/operator-management-client.tsx']){
    const source=fs.readFileSync(new URL(name,import.meta.url),'utf8');
    const literal=source.match(/pattern=\{("(?:[^"\\]|\\.)*")\}/)?.[1];
    assert.ok(literal,'explicit HTML pattern required');
    const pattern=new RegExp('^(?:'+JSON.parse(literal)+')$','v');
    for(const value of ['operator-a','reviewer.test','bank_01','abc','a'.repeat(64)])assert.equal(pattern.test(value),true,value);
    for(const value of ['ab','a'.repeat(65),'Reviewer','_name','a/b','user name','name@bank'])assert.equal(pattern.test(value),false,value);
  }
});
