const {defineConfig}=require('@playwright/test');
const base=require('./playwright.config.cjs');
module.exports=defineConfig({
 ...base,
 testIgnore:[],
 testMatch:'**/visual.spec.cjs',
 retries:process.env.CI?1:0,
 reporter:process.env.CI?[['github'],['html',{open:'never',outputFolder:'playwright-visual-report'}]]:[['list']]
});
