const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const endpoint = process.env.SPARK_ANDROID_CDP || 'http://127.0.0.1:9227';
  const targets = await fetch(`${endpoint}/json/list`).then(response => response.json());
  const target = targets.find(item => item.url.startsWith('https://localhost'));
  if (!target) throw new Error('Forward the Spark WebView debugging socket before running this test.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function until(expression, label) {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`${label} did not complete`);
  }
  try {
    await call('Runtime.enable');
    await until('typeof sparkClient !== "undefined" && !!sparkClient', 'SDK startup');
    await evaluate('sparkClient.auth.signOut({scope:"local"})');
    await call('Page.reload');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await until('document.querySelector("#screen-auth")?.classList.contains("active") && typeof sparkClient !== "undefined" && !!sparkClient', 'Auth startup');
    await evaluate('document.querySelector("[data-tab=register]").click()');
    await until('!document.querySelector("#registerForm").classList.contains("hidden") && document.querySelector("#loginForm").classList.contains("hidden")', 'Register tab');
    await evaluate('document.querySelector("[data-tab=login]").click()');
    await until('!document.querySelector("#loginForm").classList.contains("hidden")', 'Login tab');
    console.log('PASS Android APK: registration/login tabs with locally bundled SDK');
    if (process.env.SPARK_ANDROID_UI === '1') {
      await until('document.querySelector(".auth-title").textContent.includes("Campus")', 'Campus identity');
      await evaluate(`state.mode='dating';state.user.nome='Teste local';state.user.fotos=[SUPABASE_URL+'/storage/v1/object/public/photos/ui-fixture.png'];navigate('profile');document.querySelector('#profileEmoji img').src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="purple"/></svg>')`);
      await until(`document.querySelector('#profileEmoji img').naturalWidth === 300 && document.querySelector('#profileEmoji img').getBoundingClientRect().width === 120 && document.querySelector('#profileEmoji img').getBoundingClientRect().height === 120`, 'Circular profile photo');
      await evaluate('document.querySelector("#profileEmoji").click()');
      await until('document.querySelector("#profilePhotoModal").classList.contains("show") && getComputedStyle(document.querySelector("#profilePhotoPreview")).objectFit === "contain"', 'Full photo preview');
      await evaluate('document.querySelector("#closeProfilePhoto").click();navigate("settings");document.querySelector("#resetActivityBtn").click()');
      await until('document.querySelector("#resetActivityModal").classList.contains("show") && document.querySelector("#resetActivityDescription").textContent.includes("dois participantes")', 'Reset confirmation');
      await evaluate('document.querySelector("#cancelActivityReset").click()');
      await until('getComputedStyle(document.querySelector("#resetActivityModal")).visibility === "hidden"', 'Reset cancellation');
      console.log('PASS Android APK: Campus identity, profile photo sizing/preview, reset dialog/cancellation (local UI fixture, no server writes)');
      await evaluate(`
        clearInterval(syncTimer);
        state.userId='11111111-1111-4111-8111-111111111111';
        window.androidOther={id:'22222222-2222-4222-8222-222222222222',name:'Colega <b>Campus</b>',age:25,photos:[],avatar:'🦄',bio:'Bio do match',city:'Sorocaba',interests:['Música','Café','Tecnologia']};
        window.androidNotification={id:'44444444-4444-4444-8444-444444444444',type:'match',read:false,related_user_id:androidOther.id,title:'Novo match',body:'Conheça o perfil',created_at:new Date().toISOString()};
        sparkClient.from=table=>{
          const result={data:table==='matches'?[{id:'33333333-3333-4333-8333-333333333333',user1_id:state.userId,user2:androidOther}]:table==='notifications'?[androidNotification]:[],error:null};
          const query={select(){return query},update(){return query},eq(){return query},neq(){return query},or(){return query},order(){return query},limit(){return query},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
          return query;
        };
        state.swiped=[{id:androidOther.id,direction:'nope'}];
        navigate('profile');
      `);
      await until(`document.querySelectorAll('.profile-stats .stat-card').length===2 && !document.querySelector('.profile-stats').textContent.includes('98%') && document.querySelector('.profile-stats').textContent.includes('Avaliações enviadas')`, 'Truthful profile statistics');
      await evaluate(`navigate('notifications')`);
      await until(`document.querySelector('#notifList button.notif-item.unread')`, 'Clickable unread notification');
      await evaluate(`document.querySelector('#notifList button').click()`);
      await until(`document.querySelector('#matchedProfileModal').classList.contains('show') && !document.querySelector('#matchedProfileContent').classList.contains('hidden') && document.querySelector('#matchedProfileName').textContent==='Colega <b>Campus</b>, 25' && document.querySelector('#matchedProfileBio').textContent==='Bio do match'`, 'Notification to complete matched profile');
      await evaluate(`document.querySelector('#matchedProfileChat').click();document.querySelector('#chatInput').value='Rascunho';document.querySelector('#roomProfile').click()`);
      await until(`!document.querySelector('#matchedProfileContent').classList.contains('hidden')`, 'Profile from chat header');
      await evaluate(`document.querySelector('#closeMatchedProfile').click()`);
      await until(`document.querySelector('#chatRoom').classList.contains('open') && document.querySelector('#chatInput').value==='Rascunho'`, 'Return to preserved conversation');
      await evaluate(`updateConnectionStatus(false)`);
      await until(`!document.querySelector('#connectionStatus').classList.contains('hidden')`, 'Connection failure banner');
      await evaluate(`updateConnectionStatus(true)`);
      await until(`document.querySelector('#connectionStatus').classList.contains('hidden')`, 'Connection recovery banner');
      console.log('PASS Android APK: real statistics, clickable notification, full matched profile, chat navigation/draft preservation, connectivity banner (mocked transport, no server writes)');
      await evaluate(`
        state.user.onboardingComplete=false;
        const common={owner_id:state.userId,owner_name:'Teste local',description:'Encontro no campus',meeting_point:'Portaria',starts_at:new Date(Date.now()+86400000).toISOString(),capacity:4,member_count:1,is_owner:true,is_member:true,status:'open',members:[],messages:[]};
        window.androidPosts=[{...common,id:'55555555-5555-4555-8555-555555555555',mode:'study',title:'Grupo Android',subject:'Cálculo',origin:'',destination:''},{...common,id:'66666666-6666-4666-8666-666666666666',mode:'ride',title:'Carona Android',subject:'',origin:'Centro',destination:'FACENS'}];
        sparkClient.rpc=async(name,args)=>({data:name==='campus_list'?androidPosts.filter(p=>p.mode===args.p_mode):name==='campus_detail'?androidPosts.find(p=>p.id===args.p_post_id):null,error:null});
        showModeHub();
      `);
      await until(`document.querySelector('#screen-modes').classList.contains('active') && document.querySelectorAll('[data-campus-mode]').length===3`, 'Three-mode chooser');
      await evaluate(`selectCampusMode('study')`);
      await until(`document.querySelector('#screen-campus').classList.contains('active') && document.querySelector('#campusRoot').textContent.includes('Grupo Android') && !document.querySelector('#screen-onboarding').classList.contains('active')`, 'Studies without dating onboarding');
      await evaluate(`document.querySelector('#switchMode').click();selectCampusMode('ride')`);
      await until(`document.querySelector('#activeModeLabel').textContent.includes('Caronas') && document.querySelector('#campusRoot').textContent.includes('Centro') && !document.querySelector('#campusRoot').textContent.includes('Grupo Android')`, 'Independent carpool interface');
      await evaluate(`document.querySelector('#switchMode').click();selectCampusMode('dating')`);
      await until(`document.querySelector('#screen-onboarding').classList.contains('active')`, 'Dating-only onboarding');
      await evaluate(`showModeHub()`);
      console.log('PASS Android APK 2.0: one account, mode chooser, distinct study/ride listings, isolation and optional dating onboarding (mocked transport)');
      await call('Page.reload');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await until('document.querySelector("#screen-auth")?.classList.contains("active")', 'Fixture cleanup');
    }
    if (process.env.SPARK_LIVE === '1') {
      const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend-fixture.local.json'), 'utf8'));
      const user = fixture.users[0];
      await evaluate(`localStorage.setItem('spark_mode_'+${JSON.stringify(user.id)},'dating');document.querySelector('#loginEmail').value=${JSON.stringify(user.email)};document.querySelector('#loginPass').value=${JSON.stringify(user.password)};document.querySelector('#loginForm').requestSubmit()`);
      const signedIn = `typeof state !== 'undefined' && state.userId === ${JSON.stringify(user.id)} && document.querySelector('#screen-discover')?.classList.contains('active')`;
      await until(signedIn, 'Real cloud login');
      await call('Page.reload');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await until(signedIn, 'Persisted session restoration');
      console.log('PASS Android APK: real Supabase login and restored session after reload');
      await evaluate('sparkClient.auth.signOut({scope:"local"})');
    }
    if (errors.length) throw new Error(`JavaScript exceptions: ${errors.join('; ')}`);
    console.log('PASS Android APK: no JavaScript startup/runtime exceptions');
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    socket.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
