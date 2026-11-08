// Node 24 service CLI: resolve the same server TS imports as the Next build.
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/server'||specifier==='next/headers')return next(specifier+'.js',context);
  let target;
  if(specifier.startsWith('@/'))target=new URL(specifier.slice(2),root);
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith(root.href))target=new URL(specifier,context.parentURL);
  if(target&&!/\.[a-z]+$/i.test(target.pathname)){
    const ts=new URL(target.href+'.ts');if(existsSync(fileURLToPath(ts)))return next(ts.href,context);
  }
  return next(specifier,context);
}});
