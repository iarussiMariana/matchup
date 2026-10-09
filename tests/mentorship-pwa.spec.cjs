const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'allow'});
test.beforeEach(async({context})=>{await context.route('https://drvqiiddgcgvmbbnwdky.supabase.co/**',route=>route.abort());});
test('Safari install guidance, branding and dialog remain accessible on a narrow screen',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.goto('/');
  await expect(page).toHaveTitle(/MatchUp/);await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','manifest.webmanifest');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content','MatchUp');
  await page.getByRole('button',{name:'Instalar MatchUp',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'MatchUp na sua tela inicial'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Safari');
  await expect(dialog).toContainText('Adicionar à Tela de Início');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.getByRole('button',{name:'Entendi',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Instalar MatchUp',exact:true})).toBeFocused();
});
test('installed iOS display hides install prompt without hiding the app',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));await page.goto('/');
  await expect(page.getByRole('button',{name:'Instalar MatchUp',exact:true})).toBeHidden();await expect(page.locator('#main')).toBeVisible();
});
test('native Android skips browser installation and service worker registration',async({page})=>{
  await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};});await page.goto('/');
  await expect(page.locator('.pwa-tools')).toHaveCount(0);expect(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
test('real service worker survives a disconnected host under a subpath without caching private requests',async({page,context})=>{
  const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
  const {root,assets,serviceWorker}=require('../tools/web-assets.cjs');let disconnected=false;
  const server=http.createServer((req,res)=>{
    if(disconnected){req.socket.destroy();return;}
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/matchup/index.html'){res.writeHead(308,{Location:'/matchup/'}).end();return;}
    const file=pathname==='/matchup/'?'index.html':pathname.startsWith('/matchup/')?pathname.slice(9):'';
    if(!assets.includes(file)&&file!=='sw.js'){res.writeHead(404).end();return;}
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html');
    res.end(file==='sw.js'?serviceWorker():fs.readFileSync(path.join(root,...file.split('/'))));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/matchup/`;
  try{
    await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.goto(base+'?code=disposable-test-code');
    const urls=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.filter(k=>k.startsWith('matchup-static-')).map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat();});
    expect(urls.length).toBeGreaterThan(10);expect(urls.every(url=>url.startsWith(base)&&!new URL(url).search)).toBeTruthy();
    disconnected=true;await page.goto(base);await expect(page).toHaveTitle(/MatchUp/);await expect(page.getByRole('button',{name:'Instalar MatchUp',exact:true})).toBeVisible();
    await context.setOffline(true);await expect(page.locator('.offline')).toContainText(/sem conexão/i);await context.setOffline(false);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('updates require explicit confirmation and do not silently discard drafts',async({page})=>{
  await page.addInitScript(()=>{
    window.updateMessages=[];const service=new EventTarget();
    service.register=async()=>({waiting:{postMessage:message=>window.updateMessages.push(message)},addEventListener:()=>{}});
    Object.defineProperty(navigator,'serviceWorker',{value:service});
  });
  await page.goto('/');const update=page.getByRole('button',{name:'Atualização disponível',exact:true});await expect(update).toBeVisible();
  page.once('dialog',dialog=>dialog.dismiss());await update.click();expect(await page.evaluate(()=>window.updateMessages)).toEqual([]);
  page.once('dialog',dialog=>dialog.accept());await update.click();expect(await page.evaluate(()=>window.updateMessages)).toEqual([{type:'MATCHUP_ACTIVATE_UPDATE'}]);
});
test('public server serves icons and manifest but never repository secrets or legacy scripts',async({request})=>{
  const manifest=await request.get('/manifest.webmanifest');expect(manifest.ok()).toBeTruthy();expect(manifest.headers()['content-type']).toContain('manifest+json');
  for(const icon of (await manifest.json()).icons){const result=await request.get('/'+icon.src);expect(result.ok()).toBeTruthy();expect(result.headers()['content-type']).toBe('image/png');}
  for(const name of ['setup-supabase.js','.env','supabase/mentorship.sql','app.js','campus.js','package.json']) expect((await request.get('/'+name)).status()).toBe(404);
  const sw=await request.get('/sw.js');expect(sw.headers()['cache-control']).toBe('no-cache');expect(await sw.text()).not.toContain('__MATCHUP_');
});
