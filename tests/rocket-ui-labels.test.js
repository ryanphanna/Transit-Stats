const fs = require('node:fs');
const path = require('node:path');

describe('Rocket instrument labels', () => {
  const rocketHtmlPath = path.resolve(__dirname, '../Tools/Rocket/index.html');
  const rocketHtml = fs.readFileSync(rocketHtmlPath, 'utf8');

  test('uses plain-language control labels', () => {
    expect(rocketHtml).toContain('Doors Closed');
    expect(rocketHtml).toContain('Red Light');
    expect(rocketHtml).toContain('In Motion');
  });

  test('does not use prior jargon labels', () => {
    expect(rocketHtml).not.toContain('Interlock');
    expect(rocketHtml).not.toContain('Aspect');
    expect(rocketHtml).not.toContain('Traction State');
  });
});
