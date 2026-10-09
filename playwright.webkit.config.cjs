const {defineConfig}=require('@playwright/test');
const base=require('./playwright.config.cjs');
module.exports=defineConfig({...base,use:{...base.use,browserName:'webkit',channel:undefined},timeout:30000});
