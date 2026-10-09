'use strict';
const PROJECT = 'drvqiiddgcgvmbbnwdky';
const SITE = 'https://matchup-87k.pages.dev/';
function desired(config) {
  const entries = String(config.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean);
  return { site_url: SITE, uri_allow_list: [...new Set([...entries, SITE])].join(',') };
}
function audit(config) {
  return {
    siteUrlReady: config.site_url === SITE,
    redirectReady: String(config.uri_allow_list || '').split(',').map(s => s.trim()).includes(SITE),
    emailConfirmationEnabled: config.mailer_autoconfirm === false,
    customSmtpConfigured: Boolean(config.smtp_host && config.smtp_user && config.smtp_admin_email),
    emailDeliveryPhysicallyVerified: false
  };
}
async function run({apply=false,token=process.env.SUPABASE_ACCESS_TOKEN,fetcher=fetch}={}) {
  if (!token) {
    if (apply) throw new Error('SUPABASE_ACCESS_TOKEN ausente; nenhuma configuração foi alterada.');
    return { managementAccess: false, status: 'Pendente: credencial administrativa do Supabase indisponível. Nenhum e-mail enviado.' };
  }
  const endpoint = `https://api.supabase.com/v1/projects/${PROJECT}/config/auth`;
  const request = async (method, body) => {
    const response = await fetcher(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Supabase Management recusou a operação (HTTP ${response.status}). Nenhuma credencial foi registrada.`);
    return response.json();
  };
  let config = await request('GET');
  if (apply) { await request('PATCH', desired(config)); config = await request('GET'); }
  const result = audit(config);
  if (apply && (!result.siteUrlReady || !result.redirectReady)) throw new Error('A configuração não passou na verificação após atualização.');
  return { managementAccess:true, applied:apply, ...result, note:'Entrega real de e-mail e SMTP exigem validação independente. Não enviamos mensagens nem alteramos confirmações ou limites.' };
}
if (require.main === module) {
  const args=process.argv.slice(2);
  if (args.some(a=>a!=='--apply')) { console.error('Uso: node tools\\auth-readiness.cjs [--apply]'); process.exitCode=1; }
  else run({apply:args.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Não foi possível verificar/configurar o Auth. Confira a credencial administrativa e conectividade; detalhes sensíveis foram omitidos.');process.exitCode=1;});
}
module.exports={desired,audit,run,SITE};
