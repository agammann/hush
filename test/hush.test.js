import test from 'node:test'; import assert from 'node:assert/strict';
import {validate,html,run,classifyError} from '../hush.js';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
const recipe={name:'x',steps:[{action:'screenshot'}]};
const blocked={launchPersistentContext:async()=>{throw Error('spawn chromium EPERM')}};
async function workspace(fn){const root=await mkdtemp(path.join(os.tmpdir(),'hush-test-'));try{await fn(root,path.join(root,'out'));}finally{await rm(root,{recursive:true,force:true})}}
test('accepts valid recipe',()=>assert.doesNotThrow(()=>validate(recipe)));
test('rejects unknown action',()=>assert.throws(()=>validate({name:'x',steps:[{action:'invent'}]}),/unsupported/));
test('rejects malformed offline value',()=>assert.throws(()=>validate({name:'x',steps:[{action:'offline',value:'false'}]}),/boolean/));
test('rejects missing selector',()=>assert.throws(()=>validate({name:'x',steps:[{action:'fill',value:'a'}]}),/selector/));
test('escapes report content',()=>assert.ok(!html({name:'<script>',status:'passed',started:'now',steps:[]}).includes('<script>')));
test('writes blocked setup report',()=>workspace(async(root,out)=>{const r=await run(recipe,{output:out,chromium:blocked});assert.equal(r.status,'environment-blocked');assert.equal(JSON.parse(await readFile(path.join(out,'report.json'))).status,r.status)}));
test('classifies only known restrictions as blocked',()=>{assert.equal(classifyError('setup',Error('spawn chromium EPERM')),'environment-blocked');assert.equal(classifyError('journey',Error('net::ERR_NETWORK_ACCESS_DENIED'),'goto'),'environment-blocked');assert.equal(classifyError('setup',Error('bug')),'failed');assert.equal(classifyError('evidence',Error('spawn chromium EPERM')),'failed');assert.equal(classifyError('journey',Error('net::ERR_NETWORK_ACCESS_DENIED'),'screenshot'),'failed');assert.equal(classifyError('journey',Error('assertion timed out'),'expectText'),'failed')});
test('unexpected setup error fails',()=>workspace(async(root,out)=>{const chromium={launchPersistentContext:async()=>{throw Error('unexpected launch bug')}};const r=await run(recipe,{output:out,chromium});assert.equal(r.status,'failed');assert.match(r.steps.at(-1).detail,/unexpected launch bug/)}));
test('browser log write error fails',()=>workspace(async(root,out)=>{const chromium={launchPersistentContext:async()=>{await mkdir(path.join(out,'browser.log'));throw Error('launch bug')}};const r=await run(recipe,{output:out,chromium});assert.equal(r.status,'failed');assert.ok(r.steps.some(s=>s.action==='evidence'&&s.status==='failed'))}));
test('report write error rejects',()=>workspace(async(root,out)=>{const chromium={launchPersistentContext:async()=>{await mkdir(path.join(out,'report.json'));throw Error('launch bug')}};await assert.rejects(run(recipe,{output:out,chromium}))}));
test('evidence failure wins over known restriction',()=>workspace(async(root,out)=>{const chromium={launchPersistentContext:async()=>{await mkdir(path.join(out,'browser.log'));throw Error('spawn chromium EPERM')}};const r=await run(recipe,{output:out,chromium});assert.equal(r.status,'failed');assert.ok(r.steps.some(s=>s.action==='evidence'));assert.ok(r.steps.some(s=>s.status==='environment-blocked'))}));
test('existing directory is preserved',()=>workspace(async(root,out)=>{await mkdir(out);await writeFile(path.join(out,'report.json'),'keep');await assert.rejects(run(recipe,{output:out,chromium:blocked}),{code:'EEXIST'});assert.equal(await readFile(path.join(out,'report.json'),'utf8'),'keep')}));
test('existing file is preserved',()=>workspace(async(root,out)=>{await writeFile(out,'keep');await assert.rejects(run(recipe,{output:out,chromium:blocked}),{code:'EEXIST'});assert.equal(await readFile(out,'utf8'),'keep')}));
test('fixture within existing output is preserved',()=>workspace(async(root,out)=>{await mkdir(out);const fixture=path.join(out,'backup.bin');await writeFile(fixture,'fixture');const r={name:'x',steps:[{action:'import',selector:'input',fixture}]};await assert.rejects(run(r,{output:out,chromium:blocked}),{code:'EEXIST'});assert.equal(await readFile(fixture,'utf8'),'fixture')}));
test('concurrent reservations allow exactly one run',()=>workspace(async(root,out)=>{const results=await Promise.allSettled([run(recipe,{output:out,chromium:blocked}),run(recipe,{output:out,chromium:blocked})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='EEXIST').length,1)}));
test('repeated run rejects and preserves prior report',()=>workspace(async(root,out)=>{await run(recipe,{output:out,chromium:blocked});const before=await readFile(path.join(out,'report.json'),'utf8');await assert.rejects(run(recipe,{output:out,chromium:blocked}),{code:'EEXIST'});assert.equal(await readFile(path.join(out,'report.json'),'utf8'),before)}));
test('import survives restart in the fresh profile',()=>workspace(async(root,out)=>{
  const profiles=new Map();
  const launches=[];
  function context(profile) {
    const state=profiles.get(profile) ?? {text:'original'};
    profiles.set(profile,state);
    const page={
      url:()=> 'http://example.test/',
      goto:async()=>{},
      on:()=>{},
      locator:()=>({click:async()=>{},setInputFiles:async()=>{state.text='restored'}}),
      waitForEvent:async()=>({saveAs:async file=>writeFile(file,'synthetic backup')}),
      waitForFunction:async(_fn,arg)=>{if(!state.text.includes(arg.value)) throw Error('restored content missing after restart')},
      screenshot:async()=>{}
    };
    return {pages:()=>[page],newPage:async()=>page,setOffline:async()=>{},close:async()=>{}};
  }
  const chromium={
    launchPersistentContext:async profile=>{launches.push(profile);return context(profile)},
    launch:async()=>({newContext:async()=>context('ephemeral'),close:async()=>{}})
  };
  const journey={name:'synthetic import restart',steps:[
    {action:'goto',url:'http://example.test/'},
    {action:'export',selector:'#export'},
    {action:'import',selector:'#import'},
    {action:'restart'},
    {action:'expectText',selector:'#content',value:'restored'}
  ]};
  const report=await run(journey,{output:out,chromium});
  assert.equal(report.status,'passed');
  assert.equal(new Set(launches).size,2);
}));
