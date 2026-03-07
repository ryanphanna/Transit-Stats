const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const defaultArtifactsDir = '/Users/ryan/.gemini/antigravity/brain/52f4a8fc-efde-4092-9461-c3e0c348811e';
    if (!fs.existsSync(defaultArtifactsDir)) {
        fs.mkdirSync(defaultArtifactsDir, { recursive: true });
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Set a good viewport size
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to http://localhost:3001');
    try {
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait an extra second for map overlays to finish painting
        await new Promise(r => setTimeout(r, 2000));

        const screenshotPath = path.join(defaultArtifactsDir, 'app_preview.png');
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`Saved screenshot to ${screenshotPath}`);

    } catch (e) {
        console.error('Navigation error:', e);
    }

    await browser.close();
})();
