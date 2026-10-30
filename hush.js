import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export function validate(recipe) {
  if (!recipe || typeof recipe.name !== 'string' || !Array.isArray(recipe.steps) || !recipe.steps.length) throw Error('Recipe needs a name and nonempty steps');
  const supported = ['goto','fill','click','expectText','offline','reload','restart','export','import','screenshot','serviceWorkerReady','switchBuild'];
  for (const [i, s] of recipe.steps.entries()) {
    if (!supported.includes(s.action)) throw Error(`Step ${i+1}: unsupported action ${s.action}`);
    if (['fill','click','expectText','export','import'].includes(s.action) && typeof s.selector !== 'string') throw Error(`Step ${i+1}: selector required`);
    if (['fill','expectText'].includes(s.action) && typeof s.value !== 'string') throw Error(`Step ${i+1}: value required`);
    if (s.action === 'switchBuild' && !/^https?:\/\//.test(s.url ?? '')) throw Error(`Step ${i+1}: switchBuild http(s) URL required`);
    if (s.action === 'goto' && !/^https?:\/\//.test(s.url ?? '')) throw Error(`Step ${i+1}: http(s) URL required`);
    if (s.action === 'offline' && typeof s.value !== 'boolean') throw Error(`Step ${i+1}: boolean value required`);
  }
}
export function html(report) {
  const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  return `<!doctype html><meta charset="utf-8"><title>Hush evidence</title><style>body{font:16px system-ui;max-width:850px;margin:3rem auto;padding:0 1rem;color:#17223b}li{padding:.65rem;border-bottom:1px solid #ddd}code{white-space:pre-wrap}</style><h1>${esc(report.name)}</h1><p>Chromium · ${esc(report.status)} · ${esc(report.started)}</p><ol>${report.steps.map(s=>`<li><b>${esc(s.status)}</b> ${esc(s.action)} <code>${esc(s.detail || '')}</code></li>`).join('')}</ol><p>Evidence may contain application data. Review before sharing.</p>`;
}
export function classifyError(stage, error, action) {
  const message = String(error?.message ?? error);
  if (stage === 'setup' && /\bspawn\b[^\n]*\bEPERM\b/.test(message)) return 'environment-blocked';
  if (stage === 'journey' && ['goto','reload','restart','import'].includes(action) && /\bnet::ERR_NETWORK_ACCESS_DENIED\b/.test(message)) return 'environment-blocked';
  return 'failed';
}
export async function run(recipe, options = {}) {
  validate(recipe);
  const out = path.resolve(options.output || 'hush-evidence');
  // Reserve the entire evidence namespace before creating any evidence.
  // mkdir without recursive is atomic and fails if any file or directory exists.
  await mkdir(out);
  const report = {name:recipe.name, started:new Date().toISOString(), browser:'chromium', status:'passed', steps:[]};
  let context, page, backup, offline = false;
  let profile = await mkdtemp(path.join(os.tmpdir(),'hush-profile-'));
  const profiles = [profile];
  let stage = 'setup';
  try {
    const chromium = options.chromium ?? require('playwright').chromium;
    const launch = async () => { context = await chromium.launchPersistentContext(profile,{headless:true}); page = context.pages()[0] || await context.newPage(); page.on('console', msg => logs.push(`console ${msg.type()}: ${msg.text()}`)); page.on('pageerror', err => logs.push(`pageerror: ${err.message}`)); await context.setOffline(offline); };
    const logs=[];
    try {
      await launch();
      stage = 'journey';
      for (const [i, step] of recipe.steps.entries()) {
        const entry={index:i+1,action:step.action,status:'passed'}; report.steps.push(entry);
        try {
          switch(step.action) {
            case 'goto': await page.goto(step.url,{waitUntil:'load',timeout:10000}); break;
            case 'fill': await page.locator(step.selector).fill(step.value,{timeout:5000}); break;
            case 'click': await page.locator(step.selector).click({timeout:5000}); break;
            case 'expectText': { await page.waitForFunction(({selector,value}) => document.querySelector(selector)?.innerText.includes(value), {selector:step.selector,value:step.value}, {timeout:5000}); break; }
            case 'switchBuild': { const current=new URL(page.url()); const target=new URL(step.url); if (current.origin !== target.origin) throw Error('Build switch endpoint must have the current origin'); const response=await context.request.post(step.url); if (!response.ok()) throw Error(`Build switch returned HTTP ${response.status()}`); break; }
            case 'offline': offline=step.value; await context.setOffline(offline); break;
            case 'serviceWorkerReady': await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {timeout:10000}); break;
            case 'reload': await page.reload({waitUntil:'load',timeout:10000}); break;
            case 'restart': { const url=page.url(); await context.close(); await launch(); await page.goto(url,{waitUntil:'load',timeout:10000}); break; }
            case 'export': { const [download]=await Promise.all([page.waitForEvent('download',{timeout:5000}),page.locator(step.selector).click()]); backup=path.join(out,'backup.bin'); await download.saveAs(backup); break; }
            case 'import': { const input=step.fixture ? path.resolve(step.fixture) : backup; if (!input) throw Error('No export in this run'); const url=page.url(); await context.close(); profile=await mkdtemp(path.join(os.tmpdir(),'hush-profile-')); profiles.push(profile); await launch(); await page.goto(url,{waitUntil:'load',timeout:10000}); await page.locator(step.selector).setInputFiles(input); break; }
            case 'screenshot': await page.screenshot({path:path.join(out,`step-${i+1}.png`)}); break;
          }
        } catch(e) { entry.status=classifyError('journey',e,step.action); entry.detail=e.message; report.status=entry.status; try { await page.screenshot({path:path.join(out,`failure-${i+1}.png`)}); } catch {} break; }
      }
    } finally { try { await writeFile(path.join(out,'browser.log'),logs.join('\n')); } catch (e) { report.status='failed'; report.steps.push({action:'evidence',status:'failed',detail:`Cannot write browser.log: ${e.message}`}); } }
  } catch(e) { const status=classifyError(stage,e); if (report.status !== 'failed') report.status=status; report.steps.push({action:stage,status,detail:e.message}); }
  finally { if(context) await context.close().catch(()=>{}); for (const dir of profiles) await rm(dir,{recursive:true,force:true}); }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)); await writeFile(path.join(out,'report.html'),html(report));
  return report;
}
