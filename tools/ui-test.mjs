import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:4173/';
const OUT = path.resolve('tools/screens');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const log = (label, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (extra ? ' :: ' + extra : ''));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.event-card', { timeout: 10000 });
const cards = await page.locator('.event-card').count();
log('home renders event cards', cards > 0, 'count=' + cards);
log('shared calendar mode detected', /live/i.test(await page.locator('.mode-pill').innerText()));
log('hero heading', (await page.locator('h1').first().innerText()).length > 10, (await page.locator('h1').first().innerText()).replace(/\n/g, ' '));
await page.screenshot({ path: path.join(OUT, 'desktop-home.png') });

// Chat: guest date question
await page.locator('.nav-right [data-action="chat-open"]').click();
await page.fill('#chat-input', "What's on this Friday?");
await page.click('#chat-send');
await page.waitForFunction(() => !document.querySelector('.typing'), null, { timeout: 10000 });
const chatText = await page.locator('#chat-messages').innerText();
log('chat answers a date question', chatText.includes('Live Music Friday'), chatText.slice(-160).replace(/\n/g, ' '));
await page.screenshot({ path: path.join(OUT, 'desktop-chat.png') });

// Admin sign-in
await page.click('#chat-close');
await page.locator('.nav-right [data-action="open-auth"]').click();
await page.fill('#auth-form [name="username"]', 'OLP');
await page.fill('#auth-form [name="password"]', 'Olp1488');
await page.click('#auth-form button[type="submit"]');
await page.waitForSelector('.admin-panel', { timeout: 10000 });
log('admin sign-in works', (await page.locator('.page-head h1').innerText()).includes('Manage'));
const rowsBefore = await page.locator('.admin-table .admin-tr').count() - 1;
await page.screenshot({ path: path.join(OUT, 'desktop-admin.png') });

// Admin AI command -> confirm -> event created
await page.locator('.admin-head [data-action="chat-open"]').click();
await page.fill('#chat-input', 'Add a quiz on Friday at 8pm');
await page.click('#chat-send');
await page.waitForSelector('.chat-action [data-action="chat-confirm"]', { timeout: 10000 });
log('admin command produces confirm card', true, await page.locator('.chat-action-label').innerText());
await page.screenshot({ path: path.join(OUT, 'desktop-chat-admin.png') });
await page.click('.chat-action [data-action="chat-confirm"]');
await page.waitForSelector('.chat-action.done', { timeout: 10000 });
const rowsAfter = await page.locator('.admin-table .admin-tr').count() - 1;
log('confirmed command writes to calendar', rowsAfter === rowsBefore + 1, rowsBefore + ' -> ' + rowsAfter);

// Mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.waitForSelector('.event-card');
await mobile.screenshot({ path: path.join(OUT, 'mobile-home.png') });
log('mobile renders', (await mobile.locator('.event-card').count()) > 0);
await mobile.locator('#chat-fab').click();
await mobile.screenshot({ path: path.join(OUT, 'mobile-chat.png') });

console.log('\nJS errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
await browser.close();
if (errors.length) process.exitCode = 1;
