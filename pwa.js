(() => {
  'use strict';
  if (window.Capacitor?.isNativePlatform?.()) return;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installPrompt = null;
  let refreshing = false;
  let registration;
  const panel = document.createElement('section');
  panel.className = 'pwa-tools';
  panel.setAttribute('aria-label', 'Instalação e atualizações');
  const install = document.createElement('button');
  install.type = 'button'; install.textContent = 'Instalar MatchUp'; install.hidden = standalone();
  panel.append(install);
  document.querySelector('.topbar')?.after(panel);
  const dialog = document.createElement('dialog');
  dialog.className = 'pwa-dialog'; dialog.setAttribute('aria-labelledby', 'pwa-install-title');
  dialog.innerHTML = '<h2 id="pwa-install-title">MatchUp na sua tela inicial</h2><p>No iPhone ou iPad, abra esta página no <strong>Safari</strong>, toque em <strong>Compartilhar → Adicionar à Tela de Início → Adicionar</strong>. Se disponível, mantenha “Abrir como App” ativado.</p><p>No Android ou computador, use a opção <strong>Instalar aplicativo</strong> do navegador. A publicação precisa de <strong>HTTPS</strong>.</p><p>O visual do app pode abrir sem conexão após a primeira visita. Login, perfis, mensagens, agenda e arquivos precisam de internet. Não há envio offline nem notificações push.</p><p>Sessões do Safari e do app instalado podem ser separadas: entre novamente se solicitado. Não use navegação privada se quiser manter o acesso.</p><button type="button">Entendi</button>';
  document.body.append(dialog);
  dialog.querySelector('button').onclick = () => { dialog.close(); install.focus(); };
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  install.onclick = async () => {
    if (installPrompt) {
      const prompt = installPrompt; installPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch { dialog.showModal(); }
    } else dialog.showModal();
  };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; install.hidden = standalone(); });
  window.addEventListener('appinstalled', () => { install.hidden = true; installPrompt = null; });
  function updateAvailable() {
    if (!registration?.waiting || panel.querySelector('.pwa-update')) return;
    const button = document.createElement('button');
    button.className = 'pwa-update'; button.type = 'button'; button.textContent = 'Atualização disponível';
    button.onclick = () => {
      if (!window.confirm('Atualizar o MatchUp agora? Envie ou copie seus rascunhos antes: a página será recarregada.')) return;
      if (!registration.waiting) return;
      refreshing = true; button.disabled = true;
      registration.waiting.postMessage({type:'MATCHUP_ACTIVATE_UPDATE'});
    };
    panel.append(button);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) window.location.reload(); });
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {scope:new URL('./', document.baseURI).pathname, updateViaCache:'none'}).then(result => {
      registration = result; updateAvailable();
      result.addEventListener('updatefound', () => {
        const worker = result.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) updateAvailable(); });
      });
    }).catch(() => {
      const warning = document.createElement('small');
      warning.textContent = 'Preparação offline indisponível. O uso online continua disponível; reabra a página para tentar novamente.';
      panel.append(warning);
    });
  }
})();
