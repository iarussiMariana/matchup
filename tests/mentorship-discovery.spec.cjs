const {test, expect} = require('@playwright/test');
const {setup, mentor} = require('./mentorship-fixture.cjs');

const discover = async page => {
  await page.getByRole('navigation').getByRole('button', {name:'Descobrir', exact:true}).click();
  await expect(page.locator('.mentor-card')).toBeVisible();
};

test('discovery uses one compact photo card with actions above navigation', async ({page}) => {
  await setup(page);
  await discover(page);
  const card = await page.locator('.mentor-card').boundingBox();
  const actions = await page.locator('.card-actions').boundingBox();
  const nav = await page.getByRole('navigation').boundingBox();
  await page.screenshot({path:test.info().outputPath('compact-discovery.png'), fullPage:true});
  expect(card.height).toBeLessThanOrEqual(460);
  expect(actions.y + actions.height).toBeLessThanOrEqual(nav.y);
  await expect(page.locator('.mentor-card .card-content')).toHaveCount(0);
  await page.locator('.pwa-tools').evaluate(node => { node.hidden = true; });
  await expect.poll(async () => (await page.locator('.mentor-card').boundingBox()).height).toBeGreaterThan(card.height);
  const expandedActions = await page.locator('.card-actions').boundingBox();
  expect(expandedActions.y + expandedActions.height).toBeLessThanOrEqual(nav.y);
  await page.screenshot({path:test.info().outputPath('compact-discovery-without-banner.png'),fullPage:true});
  for (const button of await page.locator('.card-actions button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  }
  await page.locator('.card-compatibility summary').click();
  await expect(page.getByRole('region', {name:'Por que este perfil?'})).toContainText('Pode ajudar em Cálculo');
  await page.getByRole('button', {name:'Salvar nos favoritos: Ana Oliveira'}).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', {name:'Remover dos favoritos: Ana Oliveira'})).toHaveAttribute('aria-pressed','true');
});

const photo = 'https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png';
for (const failed of [false,true]) {
  test(`discovery photo ${failed ? 'failure restores initials' : 'fills the card behind a readable caption'}`, async ({page}) => {
    await setup(page, {mentors:[mentor({photo_url:photo})]});
    await page.route(photo, route => failed ? route.abort() : route.fulfill({contentType:'image/png', body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64')}));
    await discover(page);
    const image = page.locator('.portrait img');
    if (failed) {
      await expect(image).toBeHidden();
      await expect(page.locator('.portrait-initials')).toBeVisible();
    } else {
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('.portrait-initials')).toBeHidden();
      const photoBox = await image.boundingBox(), portrait = await page.locator('.portrait').boundingBox();
      expect(photoBox.height).toBeCloseTo(portrait.height, 0);
      expect(photoBox.width).toBeCloseTo(portrait.width, 0);
      const caption = await page.locator('.card-info').evaluate(node => ({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundImage}));
      expect(caption.color).toBe('rgb(255, 255, 255)');
      expect(caption.background).toContain('rgba(7, 31, 38, 0.8)');
    }
    await page.screenshot({path:test.info().outputPath(`compact-photo-${failed ? 'fallback' : 'loaded'}.png`),fullPage:true});
  });
}

for (const viewport of [{width:320,height:568}, {width:568,height:320}]) {
  test(`discovery keeps complete long content accessible at ${viewport.width}px and 200% text`, async ({page}) => {
    await page.setViewportSize(viewport);
    const subject = 'Disciplina acadêmica com um título extenso para validar quebra de texto e acesso integral ao conteúdo do estudante';
    const name = 'Estudante com nome composto e sobrenomes para verificar o cartão';
    const bio = 'Apresentação completa com metodologia e interesses. '.repeat(8);
    await setup(page, {mentors:[mentor({name, course:'Engenharia de Controle e Automação', subjects:[subject,'Álgebra','Física','Programação'], bio})]});
    await discover(page);
    await page.evaluate(() => { document.documentElement.style.fontSize='32px'; });
    await expect(page.locator('.mentor-card h2')).toHaveText(name);
    await expect(page.locator('.mentor-card')).toContainText(subject);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const clipped = await page.locator('.card-info').evaluate(node => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
    expect(clipped).toBe(false);
    await page.screenshot({path:test.info().outputPath('compact-discovery-long-text.png'), fullPage:true});
    await page.getByRole('button', {name:'Ver perfil', exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText(bio.trim());
    await expect(page.getByRole('dialog')).toContainText('Programação');
    await page.getByRole('button', {name:'Fechar janela'}).click();
    await page.getByRole('button', {name:'Solicitar monitoria', exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('Vamos aprender juntos?');
    await page.screenshot({path:test.info().outputPath('compact-discovery-zoom.png'), fullPage:true});
  });
}
