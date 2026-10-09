'use strict';
(() => {
  const api = () => window.MentorApp;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when = value => value ? new Date(value).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : 'A combinar';
  const uid = () => api()?.user?.id;
  const drafts = new Map();
  let account = null;
  let revision = 0;
  let agendaSnapshot = null;
  const reads = new Set();
  const readRpcs = new Set(['mentor_sessions','mentor_notifications','mentor_reviews','mentor_requests','mentor_groups','mentor_group_detail','mentor_files','mentor_group_suggestions']);
  function cleanup() { revision++; agendaSnapshot=null; for(const controller of reads)controller.abort(); reads.clear(); }
  function reset() { cleanup(); drafts.clear(); account = null; }
  function syncAccount() { if (account !== uid()) { cleanup(); drafts.clear(); account = uid(); } }
  async function rpc(name, args = {}) {
    const user=uid(),version=revision,epoch=api()?.epoch;
    if(!user)throw {code:'42501'};
    const reading=readRpcs.has(name)||(name==='mentor_group_code'&&args.p_action==='get'),controller=typeof AbortController==='function'?new AbortController():null;
    if(!reading)agendaSnapshot=null;
    if(reading&&controller)reads.add(controller);
    let timer;
    try{
      let request=api().client.rpc(name,args);
      if(reading&&controller&&typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{if(reading)controller?.abort();reject({code:'ACADEMIC_TIMEOUT',mutation:!reading});},20000);});
      const {data,error}=await Promise.race([request,timeout]);
      if(uid()!==user||revision!==version||api()?.epoch!==epoch)throw {code:'42501'};
      if(error)throw error;
      return data;
    }finally{clearTimeout(timer);if(controller)reads.delete(controller);}
  }
  function message(error) {
    if (error?.code === 'ACADEMIC_TIMEOUT') return error.mutation ? 'O servidor demorou a responder. A alteração pode ter sido salva; atualize antes de tentar novamente.' : 'O servidor demorou a responder. Confira sua conexão e tente novamente.';
    if (error?.code === '42501') return 'Este conteúdo não está disponível para sua conta. Atualize a página ou volte ao início.';
    if (['PGRST202','42883','42P01'].includes(error?.code)) return 'Os recursos acadêmicos ainda não foram ativados no servidor. Solicite a atualização ao responsável pelo projeto.';
    return error?.code === '23514' || error?.code === '22023' ? 'Confira os campos e os limites informados antes de tentar novamente.' : 'Não foi possível concluir. Confira sua conexão e tente novamente.';
  }
  function start(root,title) {
    syncAccount(); const token = Symbol(); root._academicToken = token;
    root.innerHTML = `<section class="academic-view" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div class="academic-notice" role="status" aria-live="polite"></div><div class="academic-content"><p class="academic-loading">Carregando…</p></div></section>`;
    const user = uid(), version = revision, epoch=api()?.epoch; return {root, content:root.querySelector('.academic-content'), live:() => root.isConnected && root._academicToken === token && uid() === user && revision === version && api()?.epoch===epoch};
  }
  function notice(root,text,error=false) { const box=root.querySelector('.academic-notice'); if(box){box.className=`academic-notice ${error?'academic-error':'academic-ok'}`;box.textContent=text;} }
  function button(text,action,style='') {return `<button type="button" data-action="${action}" class="${style}">${esc(text)}</button>`;}
  function field(label,name,options={}) { const {type='text',value='',max=120,required=true}=options; return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='text'?`maxlength="${max}"`:''} ${options.min!==undefined?`min="${options.min}"`:''} ${options.limit!==undefined?`max="${options.limit}"`:''}></label>`; }
  function select(label,name,choices,value) {return `<label>${esc(label)}<select name="${name}" aria-label="${esc(label)}">${choices.map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
  function empty(title,body) {return `<div class="academic-empty"><h3>${esc(title)}</h3><p class="academic-muted">${esc(body)}</p></div>`;}
  function catchLoad(ctx,error,retry) { if(!ctx.live()) return; ctx.content.innerHTML=empty('Não foi possível carregar',message(error))+button('Tentar novamente','retry');ctx.content.querySelector('button').onclick=retry; }
  async function action(root,element,fn) {if(element.disabled)return;const user=uid(),version=revision,epoch=api()?.epoch,box=root.querySelector('.academic-notice');element.disabled=true;try{await fn();}catch(e){if(root.isConnected&&uid()===user&&revision===version&&api()?.epoch===epoch&&root.querySelector('.academic-notice')===box)notice(root,message(e),true);}finally{if(element.isConnected)element.disabled=false;}}
  const formats=[['presencial','Presencial'],['online','Online'],['hibrido','Híbrido']];
  const sessionStatus=s=>({pending:'Aguardando confirmação',confirmed:'Confirmada',cancelled:'Cancelada'}[s]||s);
  function localInput(date) { const d=new Date(date||Date.now()+86400000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16); }
  function calendar(sessions,month,selectedDay) {
    const first=new Date(month.getFullYear(),month.getMonth(),1),last=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    const days=new Set(sessions.filter(s=>s.status!=='cancelled'&&new Date(s.starts_at).getMonth()===month.getMonth()&&new Date(s.starts_at).getFullYear()===month.getFullYear()).map(s=>new Date(s.starts_at).getDate()));
    const today=new Date();return `<div class="academic-calendar-panel"><div class="academic-row academic-between"><button type="button" data-action="previous-month" aria-label="Mês anterior">‹</button><strong>${esc(month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</strong><button type="button" data-action="next-month" aria-label="Próximo mês">›</button></div><div class="academic-calendar" aria-label="Calendário mensal">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<span class="academic-weekday">${x}</span>`).join('')}${'<span></span>'.repeat(first.getDay())}${Array.from({length:last},(_,i)=>`<button type="button" data-action="select-day" data-day="${i+1}" class="${days.has(i+1)?'academic-day-event ':''}${today.getDate()===i+1&&today.getMonth()===month.getMonth()&&today.getFullYear()===month.getFullYear()?'academic-today':''}" aria-pressed="${selectedDay===i+1}" aria-label="${i+1}${days.has(i+1)?', com encontro':''}">${i+1}</button>`).join('')}</div><p class="academic-selected-date">${selectedDay} de ${esc(month.toLocaleDateString('pt-BR',{month:'long'}))}</p></div>`;
  }
  function sessionCard(s) {
    const time=new Date(s.starts_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const mayReview=s.can_review===true;
    return `<article class="academic-card academic-session-card" data-session="${esc(s.id)}"><div class="academic-session-time"><strong>${esc(time)}</strong><small>${esc(s.duration_minutes)} min</small></div><div class="academic-session-body"><div class="academic-row academic-between"><h3>${esc(s.subject)}</h3><span class="academic-tag ${s.status==='confirmed'?'academic-tag-green':''}">${esc(sessionStatus(s.status))}</span></div><p>${esc(s.topic||s.title)}</p><p class="academic-muted">${(s.participants||[]).map(p=>esc(p.name)).join(', ')} · ${s.group_id?'Grupo':'Individual'}</p><details><summary>Ver detalhes</summary><p>${esc(s.title)}</p><p class="academic-muted">${esc(when(s.starts_at))} · ${esc(s.format)}<br>${esc(s.location)}</p><p class="academic-muted">${(s.participants||[]).map(p=>`${esc(p.name)} (${esc(({confirmed:'confirmado',pending:'pendente',declined:'recusado'})[p.response]||p.response)})`).join(', ')}</p></details><div class="academic-row">${s.status!=='cancelled'&&new Date(s.starts_at)>new Date()?(s.my_response!=='confirmed'?button('Confirmar','confirm-session','academic-confirm'):'')+button('Não poderei','decline-session')+(s.is_creator?button('Remarcar','edit-session')+button('Cancelar','cancel-session','academic-danger'):''):''}${mayReview?button('Avaliar monitoria','review-session'):''}${button('Adicionar ao calendário','export-session')}</div><div class="academic-review-form"></div></div></article>`;
  }
  function rememberAgenda(root,sessions) { agendaSnapshot={root,sessions,user:uid(),version:revision,epoch:api()?.epoch}; }
  const calendarHelp='O arquivo não sincroniza automaticamente: exporte novamente após alterações. A importação e a atualização de eventos dependem do calendário escolhido. No iPhone/iPad, abra o .ics no Calendário ou compartilhe-o com um app compatível; se necessário, salve em Arquivos e importe pelo computador. Links privados ficam apenas no MatchUp.';
  async function exportAgenda(ctx,id,refresh,month,selectedDay) {
    let fresh;
    try{
      fresh=await rpc('mentor_sessions');if(!ctx.live())return;
      if(!Array.isArray(fresh))throw new Error('Resposta inválida');
      rememberAgenda(ctx.root,fresh);
      if(id&&!fresh.some(s=>s.id===id))throw {code:'42501'};
      if(!fresh.length){await refresh();notice(ctx.root,'Não há encontros autorizados para exportar.');return;}
    }catch(error){agendaSnapshot=null;if(ctx.live())catchLoad(ctx,error,refresh);return;}
    const selected=id?fresh.filter(s=>s.id===id):fresh;
    if(!window.MentorCalendar){notice(ctx.root,'A exportação ainda não está disponível nesta versão. Atualize o aplicativo.',true);return;}
    const calendarText=window.MentorCalendar.calendar(selected);
    if(!ctx.live())return;
    if(window.MentorCalendar.isNative()){
      try{
        const result=await window.MentorCalendar.shareNative(calendarText,id?'Encontro MatchUp':'Agenda MatchUp',ctx.live);
        if(!ctx.live()||result==='stale')return;
        await renderAgenda(ctx.root,month,selectedDay,true);
        notice(ctx.root,'Arquivo preparado para a folha de compartilhamento. Escolha um app compatível e confirme a importação. Nenhum evento é adicionado automaticamente.');
      }catch(error){if(ctx.live())notice(ctx.root,error.code==='CALENDAR_CACHE_CLEANUP'?'Não foi possível limpar o arquivo temporário da exportação. Limpe o cache do app nas configurações do dispositivo.':'O compartilhamento nativo foi cancelado ou não está disponível. Nenhuma importação foi confirmada. Atualize o app ou abra o MatchUp no navegador para exportar.',true);}
      return;
    }
    const file=new File([calendarText],id?'matchup-encontro.ics':'matchup-agenda.ics',{type:'text/calendar;charset=utf-8'});
    let outcome='';
    try{
      if(navigator.canShare?.({files:[file]})&&navigator.share){
        await navigator.share({files:[file],title:id?'Encontro MatchUp':'Agenda MatchUp'});
        outcome='Arquivo compartilhado. Confirme a importação no seu calendário.';
      }
    }catch(error){if(!ctx.live())return;if(error.name==='AbortError'){notice(ctx.root,'Compartilhamento cancelado. Nenhum evento foi adicionado pelo MatchUp.');return;}}
    if(!ctx.live())return;
    if(!outcome){
      if(typeof URL.createObjectURL!=='function'){notice(ctx.root,'Este dispositivo não permite exportar arquivos aqui. Abra o MatchUp em um navegador atualizado.',true);return;}
      const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);
      try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      outcome='Arquivo .ics preparado para download. Abra-o e confirme a importação no seu calendário.';
    }
    await renderAgenda(ctx.root,month,selectedDay,true);
    notice(ctx.root,outcome+' Nenhum evento é adicionado automaticamente.');
  }
  async function renderAgenda(root,month=new Date(),selectedDay=month.getDate(),reuse=false) {
    const ctx=start(root,'Agenda');
    try {
      const cached=reuse&&agendaSnapshot?.root===root&&agendaSnapshot.user===uid()&&agendaSnapshot.version===revision&&agendaSnapshot.epoch===api()?.epoch;
      if(!cached)agendaSnapshot=null;
      const sessions=cached?agendaSnapshot.sessions:await rpc('mentor_sessions');if(!ctx.live())return;
      if(!Array.isArray(sessions))throw new Error('Resposta inválida');
      rememberAgenda(root,sessions);
      const onDay=s=>{const date=new Date(s.starts_at);return date.getFullYear()===month.getFullYear()&&date.getMonth()===month.getMonth()&&date.getDate()===selectedDay;};
      const day=sessions.filter(onDay),rest=sessions.filter(s=>!onDay(s));
      ctx.content.className='academic-content academic-stack';
      ctx.content.innerHTML=`<div class="academic-row">${button('+ Novo encontro','new-session','academic-primary')}${button('Atualizar','refresh-agenda')}${sessions.length?button('Exportar agenda','export-agenda'):''}</div><details><summary>Como usar o calendário</summary><p class="academic-muted">${calendarHelp}</p></details><div class="academic-session-form"></div>`+calendar(sessions,month,selectedDay)+(day.length?day.map(sessionCard).join(''):empty(sessions.length?'Nenhuma sessão neste dia':'Sua agenda começa aqui','Combine uma monitoria com uma conexão ou agende um encontro no seu grupo.'))+(rest.length?'<h3>Outros encontros</h3>'+rest.map(sessionCard).join(''):'');
      const refresh=()=>renderAgenda(root,month,selectedDay);
      ctx.content.onclick=e=>{
        const b=e.target.closest('[data-action]');if(!b||!ctx.live())return;
        const s=sessions.find(s=>s.id===b.closest('[data-session]')?.dataset.session),a=b.dataset.action;
        if(a==='previous-month'||a==='next-month'){const next=new Date(month.getFullYear(),month.getMonth()+(a==='next-month'?1:-1),1);return renderAgenda(root,next,1,true);}
        if(a==='select-day')return renderAgenda(root,month,Number(b.dataset.day),true);
        if(a==='refresh-agenda')return refresh();
        if(a==='export-session'&&!s)return;
        if(a==='export-agenda'||a==='export-session')return action(root,b,()=>exportAgenda(ctx,a==='export-session'?s.id:null,refresh,month,selectedDay));
        if(a==='new-session')return scheduleForm(root.querySelector('.academic-session-form'),{},refresh);
        if(a==='edit-session')return scheduleForm(root.querySelector('.academic-session-form'),{session:s},refresh);
        if(a==='review-session')return reviewForm(b.closest('article').querySelector('.academic-review-form'),s);
        if(!s||!['cancel-session','confirm-session','decline-session'].includes(a))return;
        action(root,b,async()=>{if(a==='cancel-session'){if(!window.confirm('Cancelar este encontro para todos os participantes?'))return;await rpc('mentor_session_cancel',{p_session:s.id});}else await rpc('mentor_session_respond',{p_session:s.id,p_accept:a==='confirm-session'});if(ctx.live())await refresh();});
      };
    }catch(e){if(ctx.live()){agendaSnapshot=null;catchLoad(ctx,e,()=>renderAgenda(root,month,selectedDay));}}
  }
  async function scheduleForm(root,context={},done=()=>{}) {
    const user=uid(),version=revision,epoch=api()?.epoch,token=Symbol();root._scheduleToken=token;const live=()=>root.isConnected&&uid()===user&&version===revision&&epoch===api()?.epoch&&root._scheduleToken===token;root.innerHTML='<div class="academic-view"><p class="academic-loading">Preparando encontro…</p></div>';
    try{if(context.session?.group_id){const group=await rpc('mentor_group_detail',{p_group:context.session.group_id});if(!live())return;context={...context,session:{...context.session,subject:group.subject}};}
      let choices=[],choiceSubjects={};if(!context.requestId&&!context.groupId&&!context.session){const [requests,groups]=await Promise.all([rpc('mentor_requests'),rpc('mentor_groups')]);choices=[...requests.filter(r=>r.status==='accepted').map(r=>[`request:${r.id}`,`${r.peer?.name||'Conexão'} · ${r.subject}`]),...groups.filter(g=>g.is_owner&&g.status==='open').map(g=>[`group:${g.id}`,`Grupo · ${g.name}`])];choiceSubjects=Object.fromEntries([...requests.map(r=>[`request:${r.id}`,r.subject]),...groups.map(g=>[`group:${g.id}`,g.subject])]);}if(!live())return;
      if(!choices.length&&!context.requestId&&!context.groupId&&!context.session){root.innerHTML=`<section class="academic-view">${empty('Conecte-se antes de agendar','Uma conexão aceita ou um grupo que você organiza permite criar encontros.')}</section>`;return;}
      const s=context.session||{};root.innerHTML=`<section class="academic-view"><form class="academic-form"><h3>${s.id?'Remarcar encontro':'Agendar monitoria'}</h3><div class="academic-notice" role="status"></div>${choices.length?select('Com quem?', 'context', choices,choices[0][0]):''}${field('Título','title',{value:s.title||'Encontro de monitoria',max:100})}${select('Matéria','subject',[[s.subject||context.subject||choiceSubjects[choices[0]?.[0]]||'',s.subject||context.subject||choiceSubjects[choices[0]?.[0]]||'']],s.subject||context.subject||choiceSubjects[choices[0]?.[0]]||'')}${field('Assunto','topic',{value:s.topic||'',max:160,required:false})}${field('Data e horário','starts_at',{type:'datetime-local',value:localInput(s.starts_at),min:localInput(Date.now())})}<div class="academic-grid">${field('Duração (minutos)','duration_minutes',{type:'number',value:s.duration_minutes||60,min:15,limit:240})}${select('Formato','format',formats,s.format||context.format||'presencial')}</div>${field('Local público ou link da reunião','location',{value:s.location||context.location||'',max:200})}<p class="academic-muted">Os participantes precisam confirmar. Uma remarcação solicita nova confirmação.</p><div class="academic-row"><button class="academic-primary" type="submit">${s.id?'Salvar novo horário':'Enviar convite'}</button>${button('Fechar','close-form')}</div></form></section>`;
      root.querySelector('[data-action=close-form]').onclick=()=>{root._scheduleToken=Symbol();root.replaceChildren();};
      const contextSelect=root.querySelector('[name=context]');if(contextSelect)contextSelect.onchange=()=>{const subject=choiceSubjects[contextSelect.value]||'';root.querySelector('[name=subject]').replaceChildren(new Option(subject,subject));};
      root.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');action(root,b,async()=>{const data=Object.fromEntries(new FormData(form));const selected=(data.context||'').split(':');delete data.context;const p={...data,starts_at:new Date(data.starts_at).toISOString(),duration_minutes:Number(data.duration_minutes),request_id:s.request_id||context.requestId||(selected[0]==='request'?selected[1]:null),group_id:s.group_id||context.groupId||(selected[0]==='group'?selected[1]:null)};if(s.id)p.id=s.id;if(new Date(p.starts_at)<=new Date()){notice(root,'Escolha um horário futuro.',true);return;}await rpc('mentor_session_save',{p_session:p});if(live()){notice(root,'Encontro salvo. Aguardando confirmação dos participantes.');done();}});};root.querySelector('input')?.focus();
    }catch(e){if(live())root.innerHTML=`<section class="academic-view"><p class="academic-error">${esc(message(e))}</p></section>`;}
  }
  function reviewForm(root,session){root.innerHTML=`<section class="academic-view"><form class="academic-form"><h3>Como foi a monitoria?</h3><div class="academic-notice" role="status"></div>${select('Avaliação','rating',[['5','5 — Excelente'],['4','4 — Muito boa'],['3','3 — Boa'],['2','2 — Pode melhorar'],['1','1 — Ruim']],'5')}<label>Feedback<textarea name="comment" maxlength="1000" placeholder="Compartilhe um feedback respeitoso"></textarea></label><button type="submit" class="academic-primary">Enviar avaliação</button></form></section>`;root.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;action(root,form.querySelector('button'),async()=>{const data=new FormData(form);await rpc('mentor_review',{p_session:session.id,p_rating:Number(data.get('rating')),p_comment:data.get('comment')});notice(root,'Avaliação registrada.');});};}
  async function renderReviews(root,userId){const user=uid();root.innerHTML='<section class="academic-view"><h3>Avaliações de monitorias</h3><p class="academic-loading">Carregando…</p></section>';try{const result=await rpc('mentor_reviews',{p_user:userId});if(!root.isConnected||uid()!==user)return;root.innerHTML=`<section class="academic-view"><h3>Avaliações de monitorias</h3>${result.count?`<p class="academic-review-stars">★ ${Number(result.average).toFixed(1)} · ${Number(result.count)} avaliações</p>${result.items.map(r=>`<article class="academic-card"><div class="academic-row academic-between"><strong>${esc(r.reviewer_name)}</strong><span>★ ${Number(r.rating)}</span></div><p>${esc(r.comment)}</p><small class="academic-muted">${esc(when(r.created_at))}</small></article>`).join('')}`:empty('Sem avaliações ainda','As avaliações ficam disponíveis após encontros confirmados e concluídos.')}</section>`;}catch(e){if(root.isConnected&&uid()===user)root.innerHTML=`<section class="academic-view"><p class="academic-error">${esc(message(e))}</p></section>`;}}
  const normalizeCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
  function groupFields(g={}) {
    return `${field('Nome do grupo','name',{value:g.name||'',max:100})}${field('Assunto','topic',{value:g.topic||'',max:160,required:false})}<label>Descrição e objetivo<textarea name="objective" maxlength="1000">${esc(g.objective||'')}</textarea></label><p class="academic-muted">As configurações abaixo já vêm preenchidas. Abra uma seção se quiser ajustar.</p><details class="academic-group-options" data-group-options="access"><summary><span>Participantes e acesso<small class="academic-group-options-summary"></small></span></summary><div class="academic-stack"><p class="academic-muted">De 2 a 100 participantes, incluindo o organizador.</p><div class="academic-grid">${field('Máximo de participantes (incluindo você)','capacity',{type:'number',value:g.capacity??12,min:2,limit:100})}${select('Visibilidade','visibility',[['private','Privado — somente convidados'],['public','Público — aparece nos grupos']],g.visibility||'private')}${select('Inscrições','enrollment_open',[['true','Abertas'],['false','Fechadas']],String(g.enrollment_open!==false))}</div></div></details><details class="academic-group-options" data-group-options="planning"><summary><span>Formato e apoio ao estudo<small class="academic-group-options-summary"></small></span></summary><div class="academic-stack">${select('Formato do grupo','format',formats,g.format||'presencial')}${field('Local ou link do grupo (somente membros)','location',{value:g.location||'',max:200,required:false})}${field('Horário preferencial','starts_at',{type:'datetime-local',value:g.starts_at?localInput(g.starts_at):'',required:false})}<label><span class="academic-row"><input type="checkbox" name="needs_mentor" ${g.needs_mentor?'checked':''}>Buscamos um monitor</span></label><p class="academic-muted">O horário preferencial não cria um encontro; agende as datas em Encontros. Alterar a configuração não remarca encontros já enviados.</p></div></details>`;
  }
  function groupPayload(form,subject) {
    const data=Object.fromEntries(new FormData(form));delete data['catalog-radio-group-subject'];
    data.subject=subject;data.capacity=Number(data.capacity);data.needs_mentor=!!data.needs_mentor;data.enrollment_open=data.enrollment_open==='true';data.starts_at=data.starts_at?new Date(data.starts_at).toISOString():null;
    return data;
  }
  async function renderGroups(root){
    const ctx=start(root,'Grupos de estudo');
    try{
      const groups=await rpc('mentor_groups');if(!ctx.live())return;
      ctx.content.className='academic-content academic-stack';
      ctx.content.innerHTML=`<p class="academic-muted">Aprenda junto. Encontre uma matéria em comum ou entre com um código de convite.</p><div class="academic-row">${button('Criar grupo','create-group','academic-primary')}${button('Entrar com código','enter-code')}${button('Atualizar','refresh-groups')}</div><div class="academic-group-form"></div>`+(groups.length?groups.map(g=>`<article class="academic-card"><div class="academic-row academic-between"><span class="academic-tag">${esc(g.subject)}</span><span class="academic-muted">${Number(g.member_count)}/${Number(g.capacity)} participantes</span></div><h3>${esc(g.name)}</h3><p>${esc(g.topic)}</p><p class="academic-muted">${esc(g.objective)}</p><div class="academic-row">${g.is_member?'<span class="academic-tag">Você participa</span>':''}${g.visibility==='private'?'<span class="academic-tag">Privado</span>':''}${g.needs_mentor?'<span class="academic-tag">Busca monitor</span>':''}${g.status==='cancelled'?'<span class="academic-tag">Arquivado</span>':g.enrollment_open===false?'<span class="academic-tag">Inscrições fechadas</span>':''}</div><button data-group="${esc(g.id)}" type="button">Ver grupo</button></article>`).join(''):empty('Uma matéria, várias possibilidades','Crie um grupo ou use o código enviado pelo organizador. Grupos privados não aparecem para desconhecidos.'));
      root.querySelector('[data-action=create-group]').onclick=()=>groupForm(root.querySelector('.academic-group-form'),g=>g?.id?renderGroup(root,g.id):renderGroups(root),{},ctx.live);
      root.querySelector('[data-action=enter-code]').onclick=()=>joinCodeForm(root.querySelector('.academic-group-form'),ctx);
      root.querySelector('[data-action=refresh-groups]').onclick=()=>renderGroups(root);
      root.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>renderGroup(root,b.dataset.group));
    }catch(e){catchLoad(ctx,e,()=>renderGroups(root));}
  }
  function joinCodeForm(root,ctx){
    const token=Symbol();root._groupFormToken=token;
    root.innerHTML=`<form class="academic-form"><h3>Entrar com código</h3><div class="academic-notice" role="status"></div><label>Código do convite<input name="code" maxlength="120" autocomplete="off" autocapitalize="characters" spellcheck="false" required value="${esc(drafts.get('join-code')||'')}"></label><p class="academic-muted">Cole o código do organizador. Letras maiúsculas ou minúsculas, espaços e hífens são aceitos. A entrada depende de vagas e inscrições abertas.</p><button type="submit" class="academic-primary">Entrar no grupo</button></form>`;
    const form=root.querySelector('form'),input=form.querySelector('input');input.focus();input.oninput=()=>drafts.set('join-code',input.value);
    form.onsubmit=e=>{e.preventDefault();action(root,form.querySelector('button'),async()=>{
      const code=normalizeCode(input.value);if(!/^[0-9A-F]{32}$/.test(code)){notice(root,'Confira o código completo enviado pelo organizador.',true);return;}
      const g=await rpc('mentor_group_join_code',{p_code:code});if(!ctx.live()||root._groupFormToken!==token||!form.isConnected)return;
      drafts.delete('join-code');await renderGroup(ctx.root,g.id);
    });};
  }
  async function groupForm(root,done,g={},parentLive=()=>true){
    const user=uid(),version=revision,epoch=api()?.epoch,token=Symbol();root._groupFormToken=token;
    const live=()=>root.isConnected&&uid()===user&&version===revision&&epoch===api()?.epoch&&root._groupFormToken===token&&parentLive();
    root.innerHTML='<section class="academic-view"><p class="academic-loading">Carregando disciplinas da FACENS…</p></section>';
    try{
      const catalog=await api().loadCatalog();if(!live())return;
      root.innerHTML=`<section class="academic-view"><form class="academic-form"><h3>${g.id?'Configurações do grupo':'Novo grupo'}</h3><div class="academic-notice" role="status"></div><fieldset class="catalog-field" id="groupSubject"><legend>Matéria</legend><div></div></fieldset>${groupFields(g)}<button type="submit" class="academic-primary">${g.id?'Salvar configurações':'Criar grupo'}</button></form></section>`;
      const form=root.querySelector('form'),draftKey=`group-form:${g.id||'new'}`,draft=drafts.get(draftKey);
      const chosen=window.MentorCatalog.single(root.querySelector('#groupSubject>div'),catalog,draft?draft.subject:g.subject||'');
      if(draft)for(const [name,value] of Object.entries(draft.fields)){const control=form.elements.namedItem(name);if(control){if(control.type==='checkbox')control.checked=value;else control.value=value;}}
      // Existing non-catalog subjects can be retained; the picker still allows choosing a current subject.
      if(g.subject)root.querySelector('#groupSubject').insertAdjacentHTML('beforeend',`<p class="academic-muted">Atual: ${esc(g.subject)}. Sem nova seleção, a matéria atual será mantida.</p>`);
      const summaryText=(section,text)=>{
        const summary=form.querySelector(`[data-group-options=${section}] small`);
        // Replacing an unchanged text node on blur can cancel a pending summary click in WebKit.
        if(summary.textContent!==text)summary.textContent=text;
      };
      const summaries=()=>{
        const fields=form.elements;
        summaryText('access',`${fields.capacity.value||'Defina o limite'} participantes · ${fields.visibility.value==='private'?'Privado':'Público'} · Inscrições ${fields.enrollment_open.value==='true'?'abertas':'fechadas'}`);
        summaryText('planning',[fields.format.selectedOptions[0]?.textContent,fields.location.value?'Local ou link definido':'Local a combinar',fields.starts_at.value?'Horário definido':'Horário a combinar',fields.needs_mentor.checked?'Buscamos um monitor':''].filter(Boolean).join(' · '));
      };
      const remember=()=>{
        if(!live())return;
        const fields=Object.fromEntries(new FormData(form));delete fields['catalog-radio-group-subject'];fields.needs_mentor=form.elements.needs_mentor.checked;
        drafts.set(draftKey,{fields,subject:chosen()});summaries();
      };
      form.addEventListener('input',remember);form.addEventListener('change',remember);
      form.addEventListener('click',e=>{if(e.target.closest('#groupSubject [data-remove]'))remember();});
      // Native validation runs before submit, including controls hidden by any closed ancestor.
      form.addEventListener('invalid',e=>{
        for(let parent=e.target.parentElement;parent;parent=parent.parentElement)if(parent.matches('details'))parent.open=true;
        notice(root,'Confira os campos e os limites informados antes de tentar novamente.',true);
        // WebKit does not reliably focus a control revealed during native validation.
        const firstInvalid=Array.from(form.elements).find(control=>control.willValidate&&!control.validity.valid);
        if(e.target===firstInvalid)e.target.focus();
      },true);
      summaries();
      form.onsubmit=e=>{e.preventDefault();action(root,form.querySelector('[type=submit]'),async()=>{
        remember();
        const subject=chosen()||g.subject;if(!subject){notice(root,'Selecione uma disciplina do catálogo.',true);const picker=form.querySelector('#groupSubject details');picker.open=true;picker.querySelector('summary').focus();return;}
        const data=groupPayload(form,subject);
        if(g.id&&g.starts_at&&data.starts_at===new Date(localInput(g.starts_at)).toISOString())delete data.starts_at;
        let saved;
        try{saved=await rpc(g.id?'mentor_group_update':'mentor_group_create',g.id?{p_group:g.id,p_changes:data}:{p_group:data});}
        catch(error){if(live()&&['22023','23514'].includes(error?.code))form.querySelectorAll('[data-group-options]').forEach(section=>section.open=true);throw error;}
        if(live()){drafts.delete(draftKey);await done(saved);}
      });};form.elements.name?.focus();
    }catch(e){if(live()){root.innerHTML=`<section class="academic-view"><p class="academic-error">${esc(message(e))}</p>${button('Tentar novamente','retry')}</section>`;root.querySelector('button').onclick=()=>groupForm(root,done,g,parentLive);}}
  }
  async function groupCode(root,g,ctx){
    const token=Symbol();root._codeToken=token;const live=()=>ctx.live()&&root.isConnected&&root._codeToken===token;
    root.innerHTML='<p class="academic-loading">Carregando convite…</p>';
    try{
      const result=await rpc('mentor_group_code',{p_group:g.id,p_action:'get'});if(!live())return;
      const code=result.code?.match(/.{1,4}/g)?.join('-')||'';
      root.innerHTML=`<div class="academic-stack"><div class="academic-notice" role="status"></div><p class="academic-muted">Só o organizador vê este código aqui. Compartilhe apenas com quem deseja convidar. Renovar ou desativar invalida o código anterior. Participantes removidos não podem voltar, mesmo com um novo código.</p>${result.enabled?`<label>Código de convite<input class="academic-invite-code" readonly value="${esc(code)}" aria-label="Código de convite"></label><div class="academic-row">${button('Copiar código','copy-code')}${button('Renovar código','rotate-code')}${button('Desativar convite','disable-code','academic-danger')}</div>`:`<p>Convite por código desativado.</p>${g.status==='open'?button('Gerar código','rotate-code','academic-primary'):''}`}</div>`;
      root.onclick=e=>{const b=e.target.closest('[data-action]');if(!b||!live())return;e.stopPropagation();action(root,b,async()=>{
        if(b.dataset.action==='copy-code'){
          if(!navigator.clipboard?.writeText){root.querySelector('input').select();notice(root,'Selecione e copie o código acima.');return;}
          try{await navigator.clipboard.writeText(code);if(live())notice(root,'Código copiado.');}catch{if(live()){root.querySelector('input').select();notice(root,'Não foi possível copiar automaticamente. Selecione e copie o código acima.',true);}}return;
        }
        const disabling=b.dataset.action==='disable-code';
        if(result.enabled&&!window.confirm(disabling?'Desativar o convite? O código atual deixará de funcionar.':'Renovar o convite? O código anterior deixará de funcionar.'))return;
        await rpc('mentor_group_code',{p_group:g.id,p_action:disabling?'disable':'rotate'});if(live())await groupCode(root,g,ctx);
      });};
    }catch(e){if(live()){root.innerHTML=`<div class="academic-notice" role="status"></div>${button('Tentar carregar convite','retry-code')}`;notice(root,message(e),true);root.querySelector('button').onclick=()=>groupCode(root,g,ctx);}}
  }
  async function groupMeetings(root,g,ctx){
    const token=Symbol();root._meetingsToken=token;const live=()=>ctx.live()&&root.isConnected&&root._meetingsToken===token;
    root.innerHTML='<p class="academic-loading">Carregando encontros…</p>';
    try{
      const sessions=(await rpc('mentor_sessions')).filter(s=>s.group_id===g.id);if(!live())return;
      root.innerHTML=`<div class="academic-stack"><div class="academic-notice" role="status"></div><p class="academic-muted">Datas, horários e confirmações também aparecem na Agenda. Cada encontro tem sua própria confirmação.</p>${g.is_owner&&g.status==='open'?button('Agendar estudo','schedule','academic-primary'):''}<div class="academic-group-schedule"></div>${sessions.length?sessions.map(sessionCard).join(''):empty('Nenhum encontro agendado','O organizador pode escolher a próxima data de estudo.')}</div>`;
      root.onclick=e=>{const b=e.target.closest('[data-action]');if(!b||!live())return;e.stopPropagation();const a=b.dataset.action,s=sessions.find(s=>s.id===b.closest('[data-session]')?.dataset.session),refresh=()=>groupMeetings(root,g,ctx);
        if(a==='schedule')return scheduleForm(root.querySelector('.academic-group-schedule'),{groupId:g.id,subject:g.subject,format:g.format,location:g.location},refresh);
        if(a==='edit-session'&&s)return scheduleForm(root.querySelector('.academic-group-schedule'),{session:s},refresh);
        if(a==='export-session')return api().navigate('agenda');
        if(a==='review-session'&&s)return reviewForm(b.closest('article').querySelector('.academic-review-form'),s);
        if(!s||!['cancel-session','confirm-session','decline-session'].includes(a))return;
        action(root,b,async()=>{if(a==='cancel-session'){if(!window.confirm('Cancelar este encontro para todos os participantes?'))return;await rpc('mentor_session_cancel',{p_session:s.id});}else await rpc('mentor_session_respond',{p_session:s.id,p_accept:a==='confirm-session'});if(live())await refresh();});
      };
    }catch(e){if(live()){root.innerHTML=`<div class="academic-notice" role="status"></div>${button('Tentar carregar encontros','retry-meetings')}`;notice(root,message(e),true);root.querySelector('button').onclick=()=>groupMeetings(root,g,ctx);}}
  }
  async function renderGroup(root,id){
    const ctx=start(root,'Grupo de estudo');
    try{
      const g=await rpc('mentor_group_detail',{p_group:id});if(!ctx.live())return;if(!g)throw {code:'42501'};
      ctx.content.className='academic-content academic-stack';
      ctx.content.innerHTML=`<div class="academic-row">${button('Voltar aos grupos','groups')}${button('Atualizar','reload')}</div><article class="academic-card"><span class="academic-tag">${esc(g.subject)} · ${Number(g.member_count)}/${Number(g.capacity)}</span><h3>${esc(g.name)}</h3><p>${esc(g.topic)}</p><p class="academic-muted">${esc(g.objective)}</p><p class="academic-muted">${g.visibility==='private'?'Privado':'Público'} · ${g.enrollment_open===false?'Inscrições fechadas':'Inscrições abertas'} · ${esc(formats.find(([v])=>v===g.format)?.[1]||'A combinar')}</p><p class="academic-muted">Horário preferencial: ${esc(when(g.starts_at))}</p>${g.is_member&&g.location?`<p class="academic-muted">Local ou link (somente membros): ${esc(g.location)}</p>`:''}<div class="academic-row">${g.status==='open'&&!g.is_member?(g.enrollment_open===false?'<span class="academic-tag">Inscrições fechadas</span>':Number(g.member_count)>=Number(g.capacity)?'<span class="academic-tag">Grupo completo</span>':button('Participar','join','academic-primary')):''}${g.status!=='open'?'<span class="academic-tag">Grupo arquivado</span>':''}</div></article>${g.is_owner&&g.status==='open'?'<details class="academic-card" data-section="settings"><summary>Configurações do grupo</summary><div class="academic-group-settings"></div></details>':''}${g.is_owner?'<details class="academic-card" data-section="invites"><summary>Convites e código de acesso</summary><div class="academic-group-code"></div></details>':''}${g.is_member?`<details class="academic-card"><summary>Participantes (${Number(g.member_count)})</summary><div class="academic-stack">${(g.members||[]).map(m=>`<div class="academic-group-member"><div><strong>${esc(m.name)}</strong><p class="academic-muted">${esc(m.course)}${m.id===g.owner_id?' · Organizador':''}</p></div>${g.is_owner&&m.id!==uid()?`<button type="button" class="academic-danger" data-action="remove-member" data-member="${esc(m.id)}">Remover ${esc(m.name)}</button>`:''}</div>`).join('')}</div></details><details class="academic-card" data-section="meetings"><summary>Encontros e agenda</summary><div class="academic-group-meetings"></div></details>${g.is_owner&&g.status==='open'?`<details class="academic-card"><summary>Convidar estudantes compatíveis</summary><div class="academic-suggestions">${button('Sugerir estudantes compatíveis','suggest')}</div></details>`:''}<h3>Conversa do grupo</h3><div class="academic-chat" aria-label="Mensagens do grupo">${(g.messages||[]).map(m=>`<div class="academic-message ${m.sender_id===uid()?'own':''}"><small>${esc(m.sender_name)} · ${esc(when(m.created_at))}</small><span>${esc(m.body)}</span></div>`).join('')||empty(g.status==='open'?'Comece a conversa':'Grupo arquivado',g.status==='open'?'Apresente-se e combine o que vocês vão estudar.':'Novas mensagens e materiais estão desativados.')}</div>${g.status==='open'?`<form class="academic-composer"><label>Mensagem<textarea name="body" required maxlength="2000" placeholder="Escreva sua mensagem…">${esc(drafts.get(id)?.text||'')}</textarea></label><button type="submit" class="academic-primary">Enviar</button></form><div class="academic-group-files"></div>`:''}<details class="academic-card"><summary>${g.is_owner?'Arquivar grupo':'Sair do grupo'}</summary><p class="academic-muted">${g.is_owner?'Arquivar encerra inscrições e convites e cancela encontros futuros para todos. Esta ação não pode ser desfeita.':'Você perderá acesso à conversa e aos materiais; sua presença em encontros futuros será retirada.'}</p>${g.is_owner?(g.status==='open'?button('Arquivar grupo','cancel','academic-danger'):''):button('Sair do grupo','leave','academic-danger')}</details>`:empty('Entre para conversar','Participantes, conversa, links e materiais ficam disponíveis apenas para membros.')}`;
      for(const [section,load] of [['settings',()=>groupForm(root.querySelector('.academic-group-settings'),()=>renderGroup(root,id),g,ctx.live)],['invites',()=>groupCode(root.querySelector('.academic-group-code'),g,ctx)],['meetings',()=>groupMeetings(root.querySelector('.academic-group-meetings'),g,ctx)]]){
        const details=root.querySelector(`[data-section=${section}]`);if(details)details.ontoggle=()=>{if(details.open&&!details.dataset.loaded&&ctx.live()){details.dataset.loaded='true';load();}};
      }
      ctx.content.onclick=e=>{
        const b=e.target.closest('[data-action]');if(!b||!ctx.live())return;const a=b.dataset.action;
        if(a==='groups')return renderGroups(root);if(a==='reload')return renderGroup(root,id);if(a==='suggest')return suggestions(root.querySelector('.academic-suggestions'),id);
        if(!['join','leave','cancel','remove-member'].includes(a))return;
        action(root,b,async()=>{
          if(a!=='join'&&!window.confirm(a==='cancel'?'Arquivar o grupo para todos? Convites serão revogados e encontros futuros cancelados. Não é possível desfazer.':a==='remove-member'?'Remover este participante? Ele perderá acesso e não poderá voltar a este grupo, mesmo usando um novo código.':'Sair deste grupo e retirar sua presença dos encontros futuros?'))return;
          await rpc(a==='remove-member'?'mentor_group_remove':`mentor_group_${a}`,{p_group:id,...(a==='remove-member'?{p_user:b.dataset.member}:{})});
          if(ctx.live()){if(a==='leave')await renderGroups(root);else await renderGroup(root,id);}
        });
      };
      const form=root.querySelector('.academic-composer');if(form){const input=form.querySelector('textarea');input.oninput=()=>{const prev=drafts.get(id);drafts.set(id,{text:input.value,clientId:prev?.text===input.value?prev.clientId:null});};form.onsubmit=e=>{e.preventDefault();const text=input.value.trim();if(!text)return;action(root,form.querySelector('button'),async()=>{const prev=drafts.get(id),clientId=prev?.text===input.value&&prev.clientId||crypto.randomUUID();const original=input.value;drafts.set(id,{text:original,clientId});await rpc('mentor_group_send',{p_group:id,p_body:text,p_client_id:clientId});if(drafts.get(id)?.text===original)drafts.delete(id);if(ctx.live())await renderGroup(root,id);});};}
      if(g.is_member&&g.status==='open')await renderFiles(root.querySelector('.academic-group-files'),{groupId:id,disabled:false});
    }catch(e){catchLoad(ctx,e,()=>renderGroup(root,id));}
  }
  async function suggestions(root,id){const user=uid();try{const people=await rpc('mentor_group_suggestions',{p_group:id});if(!root.isConnected||uid()!==user)return;root.innerHTML=`<section class="academic-view"><div class="academic-notice" role="status"></div><h3>Interesses em comum</h3>${people.length?people.map(p=>`<article class="academic-card"><strong>${esc(p.name)}</strong><p class="academic-muted">${esc(p.course)}</p><button type="button" data-invite="${esc(p.id)}">Convidar para o grupo</button></article>`).join(''):empty('Nenhuma sugestão agora','Novos perfis acadêmicos podem aparecer conforme a comunidade cresce.')}</section>`;root.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>action(root,b,async()=>{await rpc('mentor_group_invite',{p_group:id,p_user:b.dataset.invite});notice(root,'Convite enviado. A vaga será confirmada quando a pessoa entrar.');b.textContent='Convidado';}));}catch(e){if(root.isConnected&&uid()===user)root.innerHTML=`<section class="academic-view"><p class="academic-error">${esc(message(e))}</p></section>`;}}
  const fileTypes={'pdf':'application/pdf','doc':'application/msword','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','ppt':'application/vnd.ms-powerpoint','pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp'};
  async function validateFile(file){if(!file||file.size<1||file.size>10*1024*1024)throw new Error('Escolha um arquivo de até 10 MB.');const ext=file.name.split('.').pop().toLowerCase(),mime=fileTypes[ext];if(!mime||file.type&&file.type!==mime)throw new Error('Use PDF, DOC/DOCX, PPT/PPTX, JPG, PNG ou WEBP.');const b=new Uint8Array(await file.slice(0,12).arrayBuffer());const is=(...v)=>v.every((n,i)=>b[i]===n);const valid=ext==='pdf'?is(37,80,68,70,45):['docx','pptx'].includes(ext)?is(80,75,3,4):['doc','ppt'].includes(ext)?is(208,207,17,224,161,177,26,225):['jpg','jpeg'].includes(ext)?is(255,216,255):ext==='png'?is(137,80,78,71,13,10,26,10):is(82,73,70,70)&&String.fromCharCode(...b.slice(8,12))==='WEBP';if(!valid)throw new Error('O conteúdo do arquivo não corresponde ao formato escolhido.');return mime;}
  async function renderFiles(root,context){const user=uid();const args={p_request:context.requestId||null,p_group:context.groupId||null};root.innerHTML='<section class="academic-view"><h3>Materiais compartilhados</h3><div class="academic-notice" role="status"></div><div class="academic-files">Carregando…</div></section>';try{const files=await rpc('mentor_files',args);if(!root.isConnected||uid()!==user)return;root.querySelector('.academic-files').innerHTML=files.length?files.map(f=>`<article class="academic-card academic-file"><div><strong>${esc(f.name)}</strong><p class="academic-muted">${esc(f.name.split('.').pop().toUpperCase())} · ${(Number(f.size)/1024).toFixed(0)} KB · ${esc(when(f.created_at))}</p></div><button type="button" data-file="${esc(f.id)}">Baixar</button></article>`).join(''):empty('Compartilhe conhecimento','PDFs, documentos, apresentações e imagens de até 10 MB.');
      if(!context.disabled)root.querySelector('section').insertAdjacentHTML('beforeend','<form class="academic-form"><label>Adicionar material<input type="file" name="material" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" required></label><p class="academic-muted">Compartilhe somente materiais que você tem permissão para distribuir. Downloads usam links temporários; não abra arquivos desconhecidos.</p><button type="submit" class="academic-primary">Enviar arquivo</button></form>');
      root.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>action(root,b,async()=>{const f=files.find(f=>f.id===b.dataset.file);const {data,error}=await api().client.storage.from(f.bucket).createSignedUrl(f.path,60,{download:f.name});if(error)throw error;if(!root.isConnected||uid()!==user)return;const url=new URL(data.signedUrl);if(url.protocol!=='https:'||url.origin!=='https://drvqiiddgcgvmbbnwdky.supabase.co')throw new Error('Invalid download URL');const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.download=f.name;a.textContent='Abrir download (válido por 60 segundos)';a.className='academic-link';b.replaceWith(a);a.click();}));
      const form=root.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();action(root,form.querySelector('button'),async()=>{const file=form.querySelector('input').files[0];let mime;try{mime=await validateFile(file);}catch(err){notice(root,err.message,true);return;}let prepared;let committed=false;try{prepared=await rpc('mentor_file_prepare',{...args,p_name:file.name,p_mime:mime,p_size:file.size});const {error}=await api().client.storage.from(prepared.bucket).upload(prepared.path,file,{contentType:mime,upsert:false});if(error)throw error;await rpc('mentor_file_commit',{p_file:prepared.id});committed=true;if(root.isConnected&&uid()===user){await renderFiles(root,context);notice(root,'Arquivo compartilhado com os participantes.');}}finally{if(prepared&&!committed){try{await api().client.storage.from(prepared.bucket).remove([prepared.path]);await rpc('mentor_file_abort',{p_file:prepared.id});}catch{ /* Keep server metadata if upload cleanup cannot be confirmed. */ }}}});};
    }catch(e){if(root.isConnected&&uid()===user){root.querySelector('.academic-files').innerHTML=button('Tentar carregar materiais','retry-files');root.querySelector('[data-action=retry-files]').onclick=()=>renderFiles(root,context);notice(root,message(e),true);}}
  }
  function mountChatTools(root,context){root.innerHTML=`<section class="academic-view"><div class="academic-row">${button('Agendar monitoria','schedule','academic-primary')}</div><div class="academic-schedule"></div><div class="academic-materials"></div></section>`;root.querySelector('[data-action=schedule]').onclick=()=>scheduleForm(root.querySelector('.academic-schedule'),{...context,subject:context.subject||''});return renderFiles(root.querySelector('.academic-materials'),context);}
  const notificationCategories={request:'Pedidos',accepted:'Conexões',message:'Mensagens',invitation:'Convites de grupo',group_message:'Mensagens de grupo',file:'Materiais',session:'Encontros',upcoming:'Lembretes'};
  function notificationItem(n){return `<button type="button" class="${n.is_read?'':'unread'}" data-notification="${esc(n.id)}"><span class="academic-notification-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><span class="academic-notification-body"><strong>${esc(n.title)}</strong><span>${esc(n.body)}</span><small class="academic-muted">${esc(Object.hasOwn(notificationCategories,n.type)?notificationCategories[n.type]:'Outros')} · ${n.is_read?'Lida':'Não lida'} · ${esc(when(n.created_at))}</small>${['request','invitation'].includes(n.type)?'<small class="academic-tag">Resposta pendente</small>':''}</span>${n.is_read?'':'<span class="academic-notification-dot" aria-label="Não lida"></span>'}</button>`;}
  async function renderNotifications(root,filters={read:'all',category:'all'}){
    const ctx=start(root,'Notificações');
    try{
      const items=await rpc('mentor_notifications');if(!ctx.live())return;
      const categories=[...new Set(items.map(n=>Object.hasOwn(notificationCategories,n.type)?n.type:'other'))];
      if(filters.category!=='all'&&!categories.includes(filters.category))categories.push(filters.category);
      let busy=false;
      const draw=()=>{
        if(!ctx.live())return;
        const visible=items.filter(n=>(filters.read!=='unread'||!n.is_read)&&(filters.category==='all'||(Object.hasOwn(notificationCategories,n.type)?n.type:'other')===filters.category));
        const unread=visible.filter(n=>!n.is_read),read=visible.filter(n=>n.is_read);
        ctx.content.className='academic-content academic-stack';
        ctx.content.innerHTML=`<div class="academic-form"><div class="academic-grid">${select('Leitura','notification-read',[['all','Todos'],['unread','Não lidas']],filters.read)}${select('Categoria','notification-category',[['all','Todas as categorias'],...categories.map(type=>[type,notificationCategories[type]||'Outros'])],filters.category)}</div></div><div class="academic-row academic-between">${button('Atualizar','refresh')}${unread.length?button('Marcar visíveis como lidas','read-all'):''}</div><p class="academic-muted">${visible.length} de ${items.length} notificações. Marcar como lida não aceita convites nem confirma encontros.</p>`+(unread.length?'<h3 class="academic-notification-heading">Novas</h3><div class="academic-notification-list">'+unread.map(notificationItem).join('')+'</div>':'')+(read.length?'<h3 class="academic-notification-heading">Anteriores</h3><div class="academic-notification-list">'+read.map(notificationItem).join('')+'</div>':'')+(visible.length?'':empty(items.length?'Nenhuma notificação neste filtro':'Tudo em dia',items.length?'Experimente Todos ou outra categoria.':'Pedidos, mensagens, materiais e encontros aparecerão aqui.'))+'<p class="academic-muted">Atividade dentro do app. Não enviamos notificações push com o aplicativo fechado.</p>';
        root.querySelector('[name=notification-read]').onchange=e=>{filters={...filters,read:e.target.value};draw();};
        root.querySelector('[name=notification-category]').onchange=e=>{filters={...filters,category:e.target.value};draw();};
        root.querySelector('[data-action=refresh]').onclick=()=>renderNotifications(root,filters);
        const readAll=root.querySelector('[data-action=read-all]');
        if(readAll)readAll.onclick=()=>action(root,readAll,async()=>{
          if(busy)return;busy=true;
          try{for(const n of unread){if(!ctx.live())return;await rpc('mentor_notification_read',{p_id:n.id});n.is_read=true;}if(ctx.live())notice(root,'Notificações visíveis marcadas como lidas. Convites e encontros não foram confirmados.');}
          finally{busy=false;draw();}
        });
        root.querySelectorAll('[data-notification]').forEach(b=>b.onclick=()=>action(root,b,async()=>{
          if(busy)return;busy=true;
          try{
            const n=visible.find(n=>n.id===b.dataset.notification);
            if(!n.is_read){await rpc('mentor_notification_read',{p_id:n.id});n.is_read=true;}
            if(!ctx.live())return;
            if(n.session_id)return api().navigate('agenda');
            if(n.group_id)return api().openGroup?api().openGroup(n.group_id):renderGroup(root,n.group_id);
            if(n.type==='request')return api().navigate('requests');
            if(n.request_id&&(api().openRequestChat||api().openChat))return (api().openRequestChat||api().openChat)(n.request_id);
            draw();notice(root,'Não há um destino disponível para esta notificação. Atualize a lista.');
          }finally{busy=false;}
        }));
      };
      draw();
    }catch(e){catchLoad(ctx,e,()=>renderNotifications(root,filters));}
  }
  async function nextSession(){
    const user=uid(),version=revision,epoch=api()?.epoch;
    const metrics=typeof api()?.updateHomeMetrics==='function';
    const [sessions,reviews,notifications]=await Promise.all([rpc('mentor_sessions'),metrics?rpc('mentor_reviews',{p_user:user}):null,metrics?rpc('mentor_notifications'):null]);
    if(uid()!==user||revision!==version)throw {code:'42501'};
    if(metrics)api().updateHomeMetrics({completedSessions:sessions.filter(s=>s.status==='confirmed'&&new Date(s.starts_at).getTime()+s.duration_minutes*60000<=Date.now()).length,reviewCount:reviews.count,averageRating:reviews.average===null?null:Number(reviews.average),unreadNotifications:notifications.filter(n=>!n.is_read).length},epoch);
    const next=sessions.filter(s=>s.status!=='cancelled'&&s.my_response!=='declined'&&new Date(s.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
    if(!next)return null;
    return {...next,peer:(next.participants||[]).find(p=>p.id!==user)||null};
  }
  window.MentorAcademic={renderAgenda,renderGroups,renderGroup,renderNotifications,mountChatTools,renderReviews,nextSession,scheduleForm,renderFiles,validateFile,cleanup,reset};
})();
