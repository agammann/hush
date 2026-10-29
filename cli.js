#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { run } from './hush.js';
try {
  if (!process.argv[2]) throw Error('Usage: node cli.js recipe.json [output-directory]');
  const recipe=JSON.parse(await readFile(process.argv[2],'utf8'));
  const result=await run(recipe,{output:process.argv[3]});
  console.log(`${result.status}: ${result.name}`);
  process.exitCode=result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2;
} catch (e) { console.error(e.message); process.exitCode=2; }
