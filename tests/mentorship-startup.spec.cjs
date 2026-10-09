const {test,expect}=require('@playwright/test');
const {setup}=require('./mentorship-fixture.cjs');
const media='/assets/brand/matchup-intro.mp4';
const intro=page=>page.getByRole('dialog',{name:'Abertura do MatchUp'});
async function mockPlayback(page,mode='playing') {
  await page.addInitScript(mode=>{
    HTMLMediaElement.prototype.play=function(){
      if(mode==='reject') return Promise.reject(new DOMException('Blocked','NotAllowedError'));
      if(mode==='playing') queueMicrotask(()=>this.dispatchEvent(new Event('playing')));
      return new Promise(()=>{});
    };
  },mode);
}
async function open(page,options={}) {
  return setup(page,{loggedIn:false,showIntro:true,...options});
}
test('real video is muted, inline and plays where the engine supports H264; otherwise app remains available',async({page,browserName})=>{
  await open(page);
  if(browserName==='chromium') {
    await expect(intro(page)).toBeVisible();
    await expect.poll(()=>page.locator('#startupVideo').evaluate(video=>video.currentTime)).toBeGreaterThan(.1);
    const state=await page.locator('#startupVideo').evaluate(video=>({muted:video.muted,inline:video.playsInline,width:video.videoWidth,height:video.videoHeight,fit:getComputedStyle(video).objectFit}));
    expect(state).toEqual({muted:true,inline:true,width:1280,height:720,fit:'contain'});
    await page.screenshot({path:test.info().outputPath('startup-video.png')});
    await page.getByRole('button',{name:'Pular abertura'}).click();
  } else {
    await expect(intro(page)).toBeHidden({timeout:14000});
  }
  await expect(page.getByRole('button',{name:'Entrar no MatchUp',exact:true})).toBeVisible();
});
test('skip releases focus and media, and reload does not show opening again in the same session',async({page})=>{
  await mockPlayback(page); await open(page);
  await expect(page.getByRole('button',{name:'Pular abertura'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Entrar no MatchUp',exact:true})).not.toBeFocused();
  await page.getByRole('button',{name:'Pular abertura'}).focus();
  await page.keyboard.press('Enter');
  await expect(intro(page)).toBeHidden(); await expect(page.locator('#main')).toBeFocused();
  await expect(page.locator('#startupVideo')).not.toHaveAttribute('src');
  await page.reload(); await expect(intro(page)).toBeHidden();
  expect(await page.evaluate(()=>sessionStorage.getItem('matchup:intro-shown:v1'))).toBe('1');
});
test('Escape and natural playback end both dismiss the opening',async({page})=>{
  await mockPlayback(page); await open(page); await page.keyboard.press('Escape');
  await expect(intro(page)).toBeHidden();
  await page.evaluate(()=>sessionStorage.removeItem('matchup:intro-shown:v1')); await page.reload();
  await expect(intro(page)).toBeVisible(); await page.locator('#startupVideo').dispatchEvent('ended');
  await expect(intro(page)).toBeHidden(); await expect(page.locator('#main')).toBeFocused();
});
test('native startup is independent of authentication and does not repeat on navigation',async({page})=>{
  await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};});
  await mockPlayback(page); await open(page,{loggedIn:true});
  await expect(intro(page)).toBeVisible();
  await expect(page.locator('#academicHome')).toBeAttached();
  await page.getByRole('button',{name:'Pular abertura'}).click();
  await page.getByRole('button',{name:'Perfil',exact:true}).click();
  await expect(intro(page)).toBeHidden();
});
for(const condition of ['reduced-motion','save-data','slow-2g','offline','auth-code','recovery-hash']) {
  test(`opening is bypassed without requesting media: ${condition}`,async({page})=>{
    const requests=[];page.on('request',r=>{if(r.url().endsWith(media))requests.push(r.url());});
    if(condition==='reduced-motion') await page.emulateMedia({reducedMotion:'reduce'});
    if(condition==='save-data'||condition==='slow-2g') await page.addInitScript(condition=>Object.defineProperty(navigator,'connection',{value:{saveData:condition==='save-data',effectiveType:condition==='slow-2g'?'slow-2g':'4g'}}),condition);
    if(condition==='offline') await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
    await open(page,{location:condition==='auth-code'?'/?code=disposable-code':condition==='recovery-hash'?'/#type=recovery&error_code=expired':'/'});
    await expect(intro(page)).toBeHidden(); await expect(page.locator('#startupVideo')).not.toHaveAttribute('src');
    expect(requests).toEqual([]);
  });
}
test('autoplay rejection cannot block login',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await mockPlayback(page,'reject'); await open(page);
  await expect(intro(page)).toBeHidden();
  await expect(page.getByRole('button',{name:'Entrar no MatchUp',exact:true})).toBeVisible(); expect(errors).toEqual([]);
});
test('HTTP failure of the optional video still permits login',async({page})=>{
  await page.addInitScript(()=>{
    const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
    Object.defineProperty(HTMLMediaElement.prototype,'src',{...descriptor,set(value){
      descriptor.set.call(this,this.id==='startupVideo'?'assets/brand/missing-startup.mp4':value);
    }});
  });
  expect((await page.request.get('/assets/brand/missing-startup.mp4')).status()).toBe(404);
  await open(page);
  await expect(intro(page)).toBeHidden({timeout:4000});
  await expect(page.getByRole('button',{name:'Entrar no MatchUp',exact:true})).toBeVisible();
});
test('backgrounding releases playback and returning does not restart it',async({page})=>{
  await mockPlayback(page); await open(page); await expect(intro(page)).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'));});
  await expect(intro(page)).toBeHidden(); await expect(page.locator('#startupVideo')).not.toHaveAttribute('src');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'));});
  await expect(intro(page)).toBeHidden();
});
test('media error releases opening immediately',async({page})=>{
  await mockPlayback(page); await open(page); await expect(intro(page)).toBeVisible();
  await page.locator('#startupVideo').dispatchEvent('error'); await expect(intro(page)).toBeHidden();
  await expect(page.locator('#startupVideo')).not.toHaveAttribute('src');
});
test('buffering without a first frame falls back after two seconds',async({page})=>{
  await page.clock.install(); await mockPlayback(page,'buffer'); await open(page);
  await expect(intro(page)).toBeVisible(); await page.clock.fastForward(2100);
  await expect(intro(page)).toBeHidden(); await expect(page.locator('#main')).toBeFocused();
});
test('playback or buffering after the first frame cannot exceed twelve seconds',async({page})=>{
  await page.clock.install(); await mockPlayback(page); await open(page);
  await expect(intro(page)).toBeVisible(); await page.clock.fastForward(12100);
  await expect(intro(page)).toBeHidden();
});
test('reduced-motion change during playback stops and releases video',async({page})=>{
  await mockPlayback(page); await open(page); await expect(intro(page)).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'}); await expect(intro(page)).toBeHidden();
  await expect(page.locator('#startupVideo')).not.toHaveAttribute('src');
});
test('blocked session storage does not crash or trap the application',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  await mockPlayback(page); await open(page); await expect(intro(page)).toBeVisible();
  await page.getByRole('button',{name:'Pular abertura'}).click(); await expect(intro(page)).toBeHidden();
});
for(const viewport of [{width:320,height:568},{width:568,height:320},{width:1280,height:900}]) {
  test(`skip and video remain usable at ${viewport.width}x${viewport.height} and 200% text`,async({page})=>{
    await page.setViewportSize(viewport); await mockPlayback(page); await open(page);
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    const skip=page.getByRole('button',{name:'Pular abertura'}); const box=await skip.boundingBox();
    expect(box.width).toBeGreaterThan(44);expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await skip.click(); await expect(intro(page)).toBeHidden();
  });
}
test('public media supports full, HEAD and bounded/suffix ranges without exposing other files',async({request})=>{
  const fs=require('node:fs'),path=require('node:path');const bytes=fs.readFileSync(path.join(__dirname,'..',...media.slice(1).split('/')));
  const full=await request.get(media);expect(full.status()).toBe(200);expect(full.headers()['content-type']).toBe('video/mp4');expect(await full.body()).toEqual(bytes);
  const head=await request.head(media);expect(Number(head.headers()['content-length'])).toBe(bytes.length);expect((await head.body()).length).toBe(0);
  for(const [range,start,end] of [['bytes=0-31',0,31],['bytes=-16',bytes.length-16,bytes.length-1],['bytes=2648200-',2648200,bytes.length-1]]){
    const part=await request.get(media,{headers:{Range:range}});expect(part.status()).toBe(206);expect(part.headers()['content-range']).toBe(`bytes ${start}-${end}/${bytes.length}`);expect(await part.body()).toEqual(bytes.subarray(start,end+1));
  }
  for(const range of ['bytes=99999999-','bytes=100-1','bytes=-0','bytes=0-1,4-9','broken']) expect((await request.get(media,{headers:{Range:range}})).status()).toBe(416);
  expect((await request.get('/.env',{headers:{Range:'bytes=0-99'}})).status()).toBe(404);
});
