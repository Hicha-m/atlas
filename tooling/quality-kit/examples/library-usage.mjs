/**
 * Copy-paste example: use quality-kit as a library in ANY Node project.
 * No application, external API or network service is required.
 */
import {validateConfig,runSuite,fakeFetcher} from '../src/index.mjs';

const config=validateConfig({
 version:1,project:'other-project',
 baseUrl:'http://localhost:3000',allowedRemoteOrigins:[],adapter:'generic',
 suites:[{
  id:'status',path:'/status',samples:3,intervalMs:0,timeoutMs:1200,maxBytes:1024,
  format:'json',expectedStatus:200,mayCallUpstream:false,
  fields:[{path:'status',type:'string',required:true}],hashPaths:['status']
 }]
});
// Replace fakeFetcher with globalThis.fetch when the local server is running.
const {records,summary}=await runSuite({
 config,suite:config.suites[0],fetcher:fakeFetcher('ok'),sleep:async()=>{}
});
console.log(JSON.stringify({records:records.length,summary},null,2));
