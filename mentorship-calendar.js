'use strict';
(function (root) {
  const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  function safeText(value) {
    // Calendar files outlive app authorization. Never copy meeting or signed URLs.
    return String(value ?? '').replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[link disponível no MatchUp]').replace(/\b(?:access_token|refresh_token|token|signature|sig|authorization)\s*[:=]\s*[^\s,;]+/gi, '[credencial omitida]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  }
  function foldLine(line) {
    const encoder = new TextEncoder();
    let result = '', length = 0;
    for (const char of line) {
      const size = encoder.encode(char).length;
      if (length + size > 75) { result += '\r\n '; length = 1; }
      result += char; length += size;
    }
    return result;
  }
  function timestamp(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Data de encontro inválida.');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
  function calendar(sessions, now = new Date()) {
    if (!Array.isArray(sessions) || !sessions.length) throw new Error('Não há encontros autorizados para exportar.');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MatchUp//Agenda acadêmica//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    const seen = new Set();
    for (const session of sessions) {
      if (!session.id || seen.has(session.id)) throw new Error('Identificador de encontro inválido.');
      seen.add(session.id);
      const minutes = Number(session.duration_minutes), start = new Date(session.starts_at);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240 || !Number.isFinite(start.getTime())) throw new Error('Horário de encontro inválido.');
      const modified = session.updated_at || session.created_at || session.starts_at;
      const status = session.status === 'cancelled' ? 'CANCELLED' : session.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE';
      const summary = [safeText(session.subject), safeText(session.title)].filter(Boolean).join(' — ') || 'Monitoria MatchUp';
      const description = [safeText(session.topic), `Formato: ${safeText(session.format || 'a combinar')}`, 'Confira confirmações e alterações no MatchUp. Este arquivo não sincroniza automaticamente.'].filter(Boolean).join('\n');
      // Seconds since 2020 stay within the RFC signed 32-bit SEQUENCE range.
      const sequence = Math.min(2147483647, Math.max(0, Math.floor((new Date(modified).getTime() - Date.UTC(2020, 0, 1)) / 1000)));
      lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(String(session.id))}@agenda.matchup`, `DTSTAMP:${timestamp(now)}`, `LAST-MODIFIED:${timestamp(modified)}`, `SEQUENCE:${sequence}`, `DTSTART:${timestamp(start)}`, `DTEND:${timestamp(start.getTime() + minutes * 60000)}`, `STATUS:${status}`, `SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(description)}`, `LOCATION:${escapeText(safeText(session.location) || 'A combinar no MatchUp')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }
  const exportDirectory = 'matchup-calendar';
  const exportLifetime = 24 * 60 * 60 * 1000;
  function isNative() {
    const capacitor=root.Capacitor;
    return capacitor?.isNativePlatform?.() === true || ['android','ios'].includes(capacitor?.getPlatform?.()) || !!root.androidBridge || !!root.webkit?.messageHandlers?.bridge;
  }
  async function shareNative(text, title, isCurrent) {
    const capacitor=root.Capacitor;
    if(!capacitor || typeof isCurrent!=='function')throw new Error('Native calendar bridge unavailable');
    const plugin=name=>{
      if(capacitor.isPluginAvailable?.(name)===false)throw new Error('Native calendar plugin unavailable');
      const proxy=capacitor.Plugins?.[name] || capacitor.registerPlugin?.(name);
      if(!proxy)throw new Error('Native calendar plugin unavailable');
      return proxy;
    };
    const filesystem=plugin('Filesystem'),share=plugin('Share');
    if(!isCurrent())return 'stale';
    if(!(await share.canShare()).value)throw new Error('Native sharing unavailable');
    if(!isCurrent())return 'stale';
    const now=Date.now(),name=`matchup-${now}-${root.crypto.randomUUID()}.ics`,path=`${exportDirectory}/${name}`;
    let attempted=false,handedOff=false;
    try{
      if(!isCurrent())return 'stale';
      attempted=true;
      const written=await filesystem.writeFile({path,directory:'CACHE',data:text,encoding:'utf8',recursive:true});
      if(!isCurrent())return 'stale';
      const uri=written.uri || (await filesystem.getUri({path,directory:'CACHE'})).uri;
      if(!isCurrent())return 'stale';
      if(typeof uri!=='string'||!/^file:\/\//.test(uri))throw new Error('Invalid native calendar file');
      // A chooser may resolve before its receiving app reads the file. Retain it for 24h;
      // only prune older files from this dedicated folder, never arbitrary cache entries.
      try{
        const listing=await filesystem.readdir({path:exportDirectory,directory:'CACHE'});
        for(const entry of listing.files || []){
          if(!isCurrent())return 'stale';
          const match=/^matchup-(\d{13})-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.ics$/i.exec(entry.name);
          if(entry.type!=='file'||!match||entry.name===name)continue;
          const newest=Math.max(Number(match[1]),Number(entry.mtime)||0,Number(entry.ctime)||0);
          if(newest<now-exportLifetime){try{await filesystem.deleteFile({path:`${exportDirectory}/${entry.name}`,directory:'CACHE'});}catch{/* Retry age-based cleanup on a later export. */}}
        }
      }catch{/* Cache listing must not prevent sharing the current authorized file. */}
      if(!isCurrent())return 'stale';
      await share.share({title,files:[uri],dialogTitle:'Adicionar ao calendário'});
      handedOff=true;
      return isCurrent()?'shared':'stale';
    }finally{
      if(attempted&&!handedOff){
        try{await filesystem.deleteFile({path,directory:'CACHE'});}
        catch(error){if(isCurrent()){const failure=new Error('Native export cleanup failed');failure.code='CALENDAR_CACHE_CLEANUP';throw failure;}}
      }
    }
  }
  const api = { calendar, escapeText, foldLine, safeText, isNative, shareNative };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MentorCalendar = api;
})(typeof window === 'object' ? window : globalThis);
