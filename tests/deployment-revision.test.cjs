const test=require('node:test');
const assert=require('node:assert/strict');
const handlerPromise=import('../api/deployment-revision.js');
const respond=()=>{const data={code:200,headers:{},value:null};return {data,setHeader(k,v){data.headers[k]=v;return this},status(c){data.code=c;return this},json(v){data.value=v;return this}}};
test('deployment endpoint requires GET and never caches revision',async()=>{
 const handler=(await handlerPromise).default;const res=respond();
 handler({method:'POST'},res);
 assert.equal(res.data.code,405);
 assert.equal(res.data.headers.Allow,'GET');
 assert.equal(res.data.headers['Cache-Control'],'no-store, max-age=0');
});
test('deployment endpoint returns 503 rather than accidentally accepting an unknown SHA',async()=>{
 const handler=(await handlerPromise).default;
 const original=process.env.VERCEL_GIT_COMMIT_SHA;
 try{delete process.env.VERCEL_GIT_COMMIT_SHA;const res=respond();handler({method:'GET'},res);assert.equal(res.data.code,503);}
 finally{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;}
});
test('deployment endpoint reveals only the public SHA and nothing secret',async()=>{
 const handler=(await handlerPromise).default;
 const original=process.env.VERCEL_GIT_COMMIT_SHA;
 try{process.env.VERCEL_GIT_COMMIT_SHA='0123456789012345678901234567890123456789';const res=respond();handler({method:'GET'},res);assert.equal(res.data.code,200);assert.deepEqual(res.data.value,{sha:process.env.VERCEL_GIT_COMMIT_SHA});}
 finally{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;}
});
