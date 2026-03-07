const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    page.on('response', response => {
        if (!response.ok()) {
            console.log('HTTP Error:', response.status(), response.url());
        }
    });
    page.on('requestfailed', request => {
        console.log('Request failed:', request.failure().errorText, request.url());
    });

    console.log('Navigating to http://localhost:3000');
    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    } catch (e) {
        console.error('Navigation error:', e);
    }

    await browser.close();
})();
