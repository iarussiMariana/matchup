const {catalog} = require('./catalog-fixture.cjs');
const USER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const SECOND = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const profile = (overrides = {}) => ({ id: USER, name: 'Estudante', course: 'Computação', semester: 3, bio: 'Aprender com clareza.', subjects: [], learning_subjects: ['Cálculo'], availability: 'À noite', format: 'hibrido', photo_url: '', active: false, institution: '', city: '', current_subjects: [], topics: [], study_preference: 'ambos', ...overrides });
const mentor = (overrides = {}) => profile({ id: PEER, name: 'Ana Oliveira', course: 'Engenharia', semester: 6, subjects: ['Cálculo', 'Álgebra'], active: true, ...overrides });
const request = (overrides = {}) => ({ id: REQUEST, learner_id: USER, mentor_id: PEER, subject: 'Cálculo', status: 'pending', created_at: '2026-10-01T14:30:00Z', peer: mentor(), direction: 'outgoing', ...overrides });
async function setup(page, options = {}) {
  const user = { id: USER, email: 'aluno@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { name: 'Estudante legado', birth_date: '2000-01-01', interests: ['historical'], photos: ['https://untrusted.test/legacy.jpg'] } };
  const session = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const db = {
    own: options.own === undefined ? profile() : options.own,
    mentors: options.mentors || [mentor(), mentor({ id: SECOND, name: 'Bruno Santos', subjects: ['Física'] })],
    requests: options.requests || [], messages: options.messages || [], calls: [], errors: { ...options.errors }, delays: { ...options.delays },
    sendFailures: options.sendFailures || 0, blockFalse: false, signups: [], uploads: [], session, user, ...options.db
  };
  const external = [];
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.protocol === 'blob:' && ['127.0.0.1', 'localhost'].includes(new URL(url.pathname).hostname)) return route.continue();
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (options.stubAcademic && url.pathname === '/mentorship-academic.js') return route.fulfill({ contentType: 'application/javascript', body: 'window.MentorAcademic = {};' });
      return route.continue();
    }
    if (url.hostname !== 'drvqiiddgcgvmbbnwdky.supabase.co') { external.push(req.url()); return route.abort(); }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' });
    const name = url.pathname.split('/').pop();
    let body; try { body = req.postDataJSON(); } catch { body = null; }
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname.includes('/auth/v1/')) {
      db.calls.push({ name: `auth:${name}`, body });
      if (db.errors[`auth:${name}`]) return reply(db.errors[`auth:${name}`], 400);
      if (name === 'token') return reply(session);
      if (name === 'signup') { db.signups.push(body); return reply({ user, session: null }); }
      if (name === 'logout' || name === 'recover') return reply({});
      if (name === 'user') return reply(user);
      return reply({});
    }
    if (url.pathname.includes('/storage/')) {
      db.uploads.push({ path: url.pathname, method: req.method() });
      if (db.errors.upload) return reply(db.errors.upload, 400);
      return reply({ Key: url.pathname.split('/object/')[1] });
    }
    if (!url.pathname.includes('/rest/v1/rpc/')) return reply({ message: 'Unexpected endpoint in isolated fixture' }, 400);
    db.calls.push({ name, body });
    if (db.delays[name]) await new Promise(resolve => setTimeout(resolve, db.delays[name]));
    if (db.errors[name]) return reply(db.errors[name], 400);
    let data = null;
    switch (name) {
      case 'mentor_me': data = db.own; break;
      case 'mentor_save': db.own = { ...body.p_profile }; data = db.own; break;
      case 'mentor_catalog': data = db.catalog || catalog; break;
      case 'mentor_save_product':
      case 'mentor_save_catalog': db.own = { ...body.p_profile, catalog_course_id: body.p_course_id }; data = db.own; break;
      case 'mentor_discover_product': data = db.mentors.filter(p => (!body.p_subject || p.subjects.some(s => s.toLowerCase().includes(body.p_subject.toLowerCase()))) && (!body.p_course_id || p.catalog_course_id === body.p_course_id) && (!body.p_semester || p.semester === body.p_semester) && (!body.p_format || p.format === body.p_format || p.format === 'hibrido') && (!body.p_slot || p.availability_slots?.includes(body.p_slot)) && (!body.p_favorites_only || p.is_favorite)); break;
      case 'mentor_favorite': { const peer = db.mentors.find(p => p.id === body.p_user); if (peer) peer.is_favorite = body.p_saved; data = body.p_saved; break; }
      case 'mentor_favorites': data = db.mentors.filter(p => p.is_favorite && p.active); break;
      case 'mentor_moderation_access': data = db.moderator === true; break;
      case 'mentor_my_reports': data = db.reports || []; break;
      case 'mentor_report': { const report = { id: crypto.randomUUID(), reason: body.p_reason, details: body.p_details, status: 'pending', created_at: new Date().toISOString() }; (db.reports ||= []).push(report); data = report.id; break; }
      case 'mentor_discover': data = db.mentors.filter(p => p.subjects.some(s => s.toLowerCase().includes(body.p_subject.toLowerCase())) || !body.p_subject); break;
      case 'mentor_profile': data = db.mentors.find(p => p.id === body.p_user) || db.requests.find(r => r.peer.id === body.p_user)?.peer || null; break;
      case 'mentor_request_product':
      case 'mentor_request': {
        let row = db.requests.find(r => r.mentor_id === body.p_mentor && r.subject === body.p_subject);
        if (!row) { row = request({ id: crypto.randomUUID(), mentor_id: body.p_mentor, subject: body.p_subject, peer: db.mentors.find(p => p.id === body.p_mentor), question: body.p_question || '', objective: body.p_objective || '', proposed_at: body.p_proposed_at || null }); db.requests.push(row); }
        data = row; break;
      }
      case 'mentor_reset_connections': {
        if (body.p_confirmation !== 'RESETAR') return reply({ code: '22023' }, 400);
        if (Object.hasOwn(db, 'resetResponse')) { data = db.resetResponse; break; }
        const count = db.requests.length;
        db.requests = []; db.messages = [];
        data = { reset: true, requests: count, messages: 0, sessions: 0, materials: 0, reviews: 0 }; break;
      }
      case 'mentor_requests': data = db.requests; break;
      case 'mentor_respond': { const row = db.requests.find(r => r.id === body.p_request); row.status = body.p_accept ? 'accepted' : 'declined'; data = row; break; }
      case 'mentor_messages': data = db.messages; break;
      case 'mentor_send': {
        if (db.sendFailures > 0) { db.sendFailures--; return reply({ message: 'Network unavailable' }, 503); }
        let message = db.messages.find(m => m.client_id === body.p_client_id);
        if (!message) { message = { id: crypto.randomUUID(), sender_id: USER, body: body.p_body, client_id: body.p_client_id, created_at: new Date().toISOString() }; db.messages.push(message); }
        data = message; break;
      }
      case 'mentor_block':
        data = !db.blockFalse;
        if (data) { db.requests = db.requests.filter(r => r.peer.id !== body.p_user); db.mentors = db.mentors.filter(p => p.id !== body.p_user); }
        break;
      default: if (name.startsWith('mentor_')) { data = db.addonResponses?.[name] ?? []; break; } return reply({ code: 'PGRST202', message: 'Function not available' }, 404);
    }
    return reply(data);
  });
  await page.addInitScript(({ session, loggedIn, showIntro }) => {
    if (loggedIn) localStorage.setItem('sb-drvqiiddgcgvmbbnwdky-auth-token', JSON.stringify(session));
    if (!showIntro) sessionStorage.setItem('matchup:intro-shown:v1', '1');
  }, { session, loggedIn: options.loggedIn !== false, showIntro: options.showIntro === true });
  await page.goto(options.location || '/');
  return { db, external };
}
module.exports = { setup, profile, mentor, request, USER, PEER, SECOND, REQUEST };
