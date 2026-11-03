const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  try {
    const response = await page.goto(
      'https://www.tealhq.com/sitemap-index.xml',
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );

    console.log('HTTP Status:', response?.status());
    console.log('Page URL:', page.url());
    console.log('Page Title:', await page.title());
    console.log('Content:');
    console.log((await page.locator('body').innerText()).slice(0, 1500));
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
