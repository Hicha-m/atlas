const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./e2e',testMatch:'**/production.spec.cjs',
 fullyParallel:false,
 timeout:45000,
 expect:{timeout:30000},
 retries:1,
 reporter:[['list'],['html',{outputFolder:'playwright-production-report',open:'never'}]],
 use:{trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure',ignoreHTTPSErrors:false},
 projects:[
  {name:'live-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
  {name:'live-mobile',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
 ]
});
