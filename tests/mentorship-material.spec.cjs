const { test, expect } = require('@playwright/test');
const { setup, profile } = require('./mentorship-fixture.cjs');

const luminance = hex => {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(part => parseInt(part, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a, b) => {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + .05) / (pair[1] + .05);
};

test('Material semantic roles meet text contrast and preserve the supplied MatchUp palette', async ({ page }) => {
  await setup(page, { loggedIn: false });
  await expect(page.locator('.auth-logo')).toBeVisible();
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const names = ['primary', 'on-primary', 'primary-container', 'on-primary-container',
      'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
      'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
      'error', 'on-error', 'error-container', 'on-error-container', 'background', 'on-background',
      'surface', 'on-surface', 'surface-variant', 'on-surface-variant', 'surface-dim', 'surface-bright',
      'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high',
      'surface-container-highest', 'inverse-surface', 'inverse-on-surface', 'outline'];
    return Object.fromEntries(names.map(name => [name, style.getPropertyValue(`--md-sys-color-${name}`).trim()]));
  });
  for (const value of Object.values(tokens)) expect(value).toMatch(/^#[\da-f]{6}$/i);
  expect(tokens.primary).toBe('#087e8b');
  for (const role of ['primary', 'primary-container', 'secondary', 'secondary-container', 'tertiary',
    'tertiary-container', 'error', 'error-container', 'background', 'surface', 'surface-variant']) {
    expect(contrast(tokens[role], tokens[`on-${role}`]), role).toBeGreaterThanOrEqual(4.5);
  }
  for (const surface of ['surface-dim', 'surface-bright', 'surface-container-lowest', 'surface-container-low',
    'surface-container', 'surface-container-high', 'surface-container-highest']) {
    expect(contrast(tokens[surface], tokens['on-surface-variant']), surface).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(tokens['inverse-surface'], tokens['inverse-on-surface'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens.outline, tokens['surface-container-lowest'])).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', 'assets/brand/matchup-symbol.png');
  await page.screenshot({ path: test.info().outputPath('material-auth.png'), fullPage: true });
});

test('Material focus, filled states and motion preferences stay accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { loggedIn: false });
  const email = page.getByLabel('E-mail', { exact: true });
  await email.focus();
  const focus = await email.evaluate(node => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), font: parseFloat(style.fontSize) };
  });
  expect(focus.outline).toBe('solid'); expect(focus.width).toBeGreaterThanOrEqual(3); expect(focus.font).toBeGreaterThanOrEqual(16);
  const submit = page.getByRole('button', { name: 'Entrar no MatchUp' });
  const styles = await submit.evaluate(node => {
    const style = getComputedStyle(node);
    return { transition: style.transitionDuration, height: node.getBoundingClientRect().height,
      radius: parseFloat(style.borderRadius), color: style.color, background: style.backgroundColor };
  });
  expect(styles.transition).toBe('0s'); expect(styles.height).toBeGreaterThanOrEqual(48);
  expect(styles.radius).toBeGreaterThanOrEqual(24); expect(styles.color).toBe('rgb(255, 255, 255)');
  expect(styles.background).toBe('rgb(8, 126, 139)');
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`Material product fieldsets and catalog wrap at ${viewport.width}px and 200% text`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page, { own: profile({ name: 'Luiza Lima' }) });
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Perfil', exact: true }).click();
    await expect(page.locator('.catalog-field').first()).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
      // A component fixture validates semantic hooks independently of backend feature availability.
      document.querySelector('main').insertAdjacentHTML('beforeend', `<section id="materialFixture" class="product-section">
        <h2>Disponibilidade e segurança</h2>
        <form class="search"><div class="input-wrap"><input aria-label="Buscar componente" placeholder="Disciplina"></div><button class="btn soft" type="button" aria-label="Buscar componente">→</button><button class="icon-btn" type="button" aria-label="Atualizar componente">↻</button>
          <details class="product-section" open><summary>Refinar descoberta</summary><div class="product-filters"><label>Curso de interesse<select><option>Engenharia de Computação</option></select></label>
          <label>Instituição<input value="InstituiçãoAcadêmicaSemEspaços"></label></div></details></form>
        <section class="product-reasons"><h3>Por que este perfil?</h3><ul><li>Vocês compartilham interesses em Cálculo e Programação.</li></ul><small>Informações declaradas, não uma avaliação de qualidade.</small></section>
        <fieldset class="product-slots"><legend>Horários de estudo</legend><label><input type="checkbox" checked><span>Segunda-feira à noite</span></label><label><input type="checkbox"><span>DisponibilidadeAcadêmicaSemEspaços</span></label></fieldset>
        <details class="product-details" open><summary>Sobre a monitoria</summary><p>AprendizadoColaborativoSemEspaços</p></details>
        <aside class="product-safety"><h3>Estude com segurança</h3><p>Não compartilhe senhas nem informações sensíveis.</p></aside>
        <div class="product-actions"><button class="btn secondary" aria-pressed="true">Monitor favorito</button><button class="btn primary">Confirmar disponibilidade</button></div>
      </section>`);
    });
    const issues = await page.locator('#materialFixture, #materialFixture *, .catalog-field, .catalog-field *').evaluateAll(nodes => nodes
      .filter(node => node.getClientRects().length && (node.getBoundingClientRect().right > innerWidth + 1 || node.getBoundingClientRect().left < -1 || (!['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName) && node.scrollWidth > node.clientWidth + 1)))
      .map(node => ({ tag: node.tagName, class: node.className })));
    expect(issues).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const slot = page.locator('#materialFixture input[type=checkbox]').first();
    await expect(slot).toBeChecked(); await slot.uncheck(); await expect(slot).not.toBeChecked();
    const action = page.getByRole('button', { name: 'Confirmar disponibilidade' });
    await action.scrollIntoViewIfNeeded();
    const hit = await action.evaluate(node => { const rect = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); });
    expect(hit).toBe(true);
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
    expect(await page.getByRole('navigation').evaluate(node => getComputedStyle(node).backdropFilter)).toBe('none');
    await page.screenshot({ path: test.info().outputPath(`material-components-${viewport.width}.png`), fullPage: true });
  });
}
