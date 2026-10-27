#!/usr/bin/env node
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {loadConfig,pickSuite,authorizeSuite} from '../src/config.mjs';
import {runSuite} from '../src/runner.mjs';
import {markdownReport,csvReport} from '../src/report.mjs';
import {markdownComparison} from '../src/comparison.mjs';

const usage=[
 'Quality Kit · Node >=20, sans dépendances',
 'Commands:',
 '  quality-kit validate --config <project.json>',
 '  quality-kit probe --config <project.json> --suite <id|all> [--target http://localhost:8765] [--out path.ndjson]',
 '  quality-kit report --input <path.ndjson> [--out path.md]',
 '  quality-kit compare --baseline <old.ndjson> --current <new.ndjson> [--out comparison.md]',
 '  quality-kit plan --config <project.json> [--target http://localhost:8765]',
 'Remote access is blocked without --allow-remote and an exact allowedRemoteOrigins match.',
 'Suites marked mayCallUpstream also require --allow-upstream.',
 'No automatic or concurrent load test is performed by this CLI.'
].join('\n');
function parse(args){
 const opts={};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(!arg.startsWith('--'))throw Error('Unknown argument '+arg);
  const k=arg.slice(2);
  if(['allow-remote','allow-upstream'].includes(k)){opts[k]=true;continue;}
  if(i+1>=args.length||args[i+1].startsWith('--'))throw Error('Missing value for '+arg);
  opts[k]=args[++i];
 }
 return opts;
}
function recordsFromNdjson(source){
 const entries=source.split(/\r?\n/).filter(Boolean);
 if(entries.length>100000)throw Error('Too many rows');
 return entries.map(x=>JSON.parse(x));
}
async function main(){
 const [command,...args]=process.argv.slice(2);
 if(!command||command==='help'||command==='--help'){console.log(usage);return;}
 const opts=parse(args);
 if(command==='compare'){
  if(!opts.baseline||!opts.current)throw Error('--baseline and --current required');
  const previous=recordsFromNdjson(await readFile(resolve(opts.baseline),'utf8'));
  const latest=recordsFromNdjson(await readFile(resolve(opts.current),'utf8'));
  const content=markdownComparison(previous,latest);
  if(opts.out){const file=resolve(opts.out);await mkdir(dirname(file),{recursive:true});await writeFile(file,content,'utf8');}
  console.log(content);
  return;
 }
 if(command==='report'){
  if(!opts.input)throw Error('--input required');
  const records=recordsFromNdjson(await readFile(resolve(opts.input),'utf8'));
  const markdown=markdownReport(records,{title:'Quality Kit — Mesures réelles'});
  const file=opts.out?resolve(opts.out):null;
  if(file){await mkdir(dirname(file),{recursive:true});await writeFile(file,markdown,'utf8');}
  console.log(markdown);
  return;
 }
 if(!opts.config)throw Error('--config required');
 const config=await loadConfig(opts.config);
 if(command==='validate'){
  console.log(JSON.stringify({valid:true,project:config.project,suites:config.suites.map(s=>s.id)},null,2));
  return;
 }
 const target=opts.target||config.baseUrl;
 if(command==='plan'){
  for(const suite of config.suites){
   const blocked=(()=>{try{authorizeSuite(config,suite,target,{allowRemote:!!opts['allow-remote'],allowUpstream:!!opts['allow-upstream']});return null;}catch(e){return e.message;}})();
   console.log(JSON.stringify({project:config.project,suite:suite.id,target,
    samples:suite.samples,intervalMs:suite.intervalMs,timeoutMs:suite.timeoutMs,
    mayCallUpstream:suite.mayCallUpstream,
    executable:blocked===null,reason:blocked}));
  }
  return;
 }
 if(command!=='probe')throw Error('Unknown command: '+command);
 if(!opts.suite)throw Error('--suite required');
 const suites=opts.suite==='all'?config.suites:[pickSuite(config,opts.suite)];
 for(const suite of suites)authorizeSuite(config,suite,target,{
  allowRemote:!!opts['allow-remote'],allowUpstream:!!opts['allow-upstream']
 });
 const records=[];
 for(const suite of suites){
  const result=await runSuite({config,suite,target,
   allowRemote:!!opts['allow-remote'],allowUpstream:!!opts['allow-upstream']
  });
  records.push(...result.records);
  console.log(JSON.stringify({project:config.project,suite:suite.id,...result.summary}));
 }
 if(opts.out){
  const file=resolve(opts.out);
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,records.map(record=>JSON.stringify(record)).join('\n')+'\n','utf8');
  await writeFile(file.replace(/\.ndjson$/i,'')+'.csv',csvReport(records),'utf8');
 }
 if(records.some(x=>!x.ok))process.exitCode=1;
}
main().catch(error=>{
 console.error('Quality Kit:',error.message);
 process.exitCode=1;
});
