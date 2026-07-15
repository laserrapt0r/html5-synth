// using node to evaluate if there is any error
import('puppeteer').then(async (puppeteer) => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    await page.goto('http://localhost:8000');
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
}).catch(err => {
    console.error("Puppeteer not installed.");
});
