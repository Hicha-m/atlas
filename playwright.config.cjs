const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
 testDir:'./e2e',
 testIgnore:['**/production.spec.cjs','**/visual.spec.cjs'],
 timeout:30000,
 expect:{timeout:10000},
 fullyParallel:true,
 workers:process.env.CI?3:undefined,
 forbidOnly:!!process.env.CI,
 retries:process.env.CI?1:0,
 reporter:process.env.CI?[['github'],['html',{open:'never',outputFolder:'playwright-report'}]]:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:8765',trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
 projects:[
  {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
  {name:'tablet-chromium',use:{...devices['Desktop Chrome'],viewport:{width:900,height:1100}}},
  {name:'mobile-chromium',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
 ],
 webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1',url:'http://127.0.0.1:8765/',reuseExistingServer:!process.env.CI,timeout:20000}
});
