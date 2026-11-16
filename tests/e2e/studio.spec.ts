import {test,expect} from '@playwright/test';
import type {Download,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {makePdfFixture} from '../fixtures/pdf';
import {healthyVideo,missingMovieIndex,trailingVideo,truncatedMedia,unknownCodec} from '../fixtures/mp4';

test.use({serviceWorkers:'block'});

async function upload(page:Page,name:string,buffer:Buffer,mimeType='application/pdf') {
  await page.getByLabel('Files to analyze').setInputFiles({name,mimeType,buffer});
}
async function downloaded(download:Download) {
  const path = await download.path();
  if (!path) throw new Error('Expected a local download');
  return readFile(path);
}
async function save(page:Page,name:string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button',{name,exact:true}).click();
  return downloaded(await pending);
}
const attempt = (page:Page) => page.getByRole('button',{name:'Attempt recovery'});

test('home, navigation, theme, accessible skip link and live sample',async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Your Files Deserve a Second Chance.'})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.getByRole('button',{name:'Switch to dark theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  const nav = page.getByRole('navigation',{name:'Main navigation'});
  for (const [name,title] of [['Features','Built to recover what remains'],['How It Works','How recovery works'],['Documentation','Documentation'],['About','About FileRescue Studio']]) {
    await nav.getByRole('link',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,level:1})).toBeVisible();
  }
  await nav.getByRole('link',{name:'Home',exact:true}).click();
  await page.getByRole('link',{name:'Try this sample'}).click();
  await expect(page.getByText('2 of 2 checked pages rendered')).toBeVisible();
  await expect(page.getByText('PDF end marker is missing or followed by extra bytes')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('healthy PDF rebuild, content preview, verified download and report round trip',async ({page}) => {
  await page.goto('/repair');
  await upload(page,'healthy.pdf',await makePdfFixture());
  await expect(page.getByText('2 of 2 checked pages rendered')).toBeVisible();
  await expect(page.getByRole('button',{name:'Download file'})).toHaveCount(0);
  await attempt(page).click();
  await expect(page.getByRole('heading',{name:'Ready to download'})).toBeVisible();
  expect((await PDFDocument.load(await save(page,'Download file'))).getPageCount()).toBe(2);
  await page.getByText('Preview saved pages',{exact:true}).click();
  await expect(page.getByRole('img',{name:'Page 1 preview'}).last()).toBeVisible();
  await page.getByRole('link',{name:'View report'}).click();
  await expect(page.getByRole('heading',{name:'Recovery report'})).toBeVisible();
  const json = JSON.parse((await save(page,'Export JSON')).toString());
  expect(json).toMatchObject({
    diagnosis:{name:'healthy.pdf',pageCount:2,pages:[{number:1,readable:true},{number:2,readable:true}]},
    attempts:[{operation:'copy-pdf',state:'Verified'}],output:{partial:false},
  });
  expect(JSON.stringify(json)).not.toContain('First page survives.');
  await page.getByRole('link',{name:'Back to workspace'}).click();
  await expect(page.getByRole('button',{name:'Download file'})).toBeVisible();
});

test('damaged PDF recovers only the readable page as an image PDF and text', async ({page}) => {
  await page.goto('/repair');
  await upload(page,'broken-page.pdf',await makePdfFixture('unreadable-page'));
  await expect(page.getByText('1 of 2 checked pages rendered')).toBeVisible();
  await expect(page.getByText('Page 2 · Unreadable')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Page 2'})).toHaveCount(0);
  await page.getByRole('radio',{name:/Save page images as PDF/}).check();
  await attempt(page).click();
  await expect(page.getByText('PARTIALLY RECOVERED',{exact:true})).toBeVisible();
  expect((await PDFDocument.load(await save(page,'Download file'))).getPageCount()).toBe(1);
  await page.getByRole('radio',{name:/Extract plain text/}).check();
  await attempt(page).click();
  await expect(page.getByText('Verified UTF-8 text extracted from 1 page(s).')).toBeVisible();
  expect((await save(page,'Download file')).toString()).toContain('First page survives.');
});

test('empty, invalid-signature and unparseable files show honest outcomes',async ({page}) => {
  await page.goto('/repair');
  await upload(page,'empty.pdf',Buffer.alloc(0));
  await expect(page.getByRole('alert')).toContainText('This file is empty');
  await upload(page,'invalid.pdf',Buffer.from('Definitely not a PDF'));
  await expect(page.getByRole('heading',{name:'File type not recognized'})).toBeVisible();
  await page.getByRole('button',{name:'Start over'}).click();
  await upload(page,'unparseable.pdf',await makePdfFixture('unparseable'));
  await expect(page.getByText('The PDF could not be opened',{exact:true})).toBeVisible();
  await expect(attempt(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Download file'})).toHaveCount(0);
});

test('drag-and-drop, queued file selection and cancellation',async ({page}) => {
  await page.route('**/assets/worker-*.js',() => {
    // Hold the worker asset until the user cancels the job.
  });
  await page.goto('/repair');
  const files = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['%PDF-1.7'],'first.pdf'));
    data.items.add(new File(['test'],'next.pdf'));
    return data;
  });
  await page.getByText('Drop files here').dispatchEvent('drop',{dataTransfer:files});
  await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(/Analysis cancelled/);
  await expect(page.getByRole('button',{name:/first.pdf Cancelled/})).toBeVisible();
  await page.unroute('**/assets/worker-*.js');
  await page.getByRole('button',{name:/next.pdf Waiting/}).click();
  await expect(page.getByRole('heading',{name:'File type not recognized'})).toBeVisible();
});

test('healthy MP4, unsupported codecs, missing index and truncated media are distinguished',async ({page}) => {
  await page.goto('/repair');
  const scans = [
    ['healthy.mp4',healthyVideo,'Browser playback sampled'],
    ['codec.mp4',unknownCodec,'Browser playback unverified'],
    ['missing.mp4',missingMovieIndex,'Track metadata is missing or invalid'],
    ['truncated.mp4',truncatedMedia,'No complete media data box'],
  ] as const;
  for (const [name,bytes,title] of scans) {
    await upload(page,name,bytes,'video/mp4');
    await expect(page.getByText(title,{exact:true})).toBeVisible({timeout:11000});
    await expect(attempt(page)).toHaveCount(0);
    await page.getByRole('button',{name:'Start over'}).click();
  }
});

test('video repair preserves original bytes and verifies browser decoding before download',async ({page}) => {
  await page.goto('/repair');
  await upload(page,'trailing.mp4',trailingVideo,'video/mp4');
  await expect(page.getByText('Invalid container boundary',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download file'})).toHaveCount(0);
  await attempt(page).click();
  await expect(page.getByRole('heading',{name:'Ready to download'})).toBeVisible({timeout:12500});
  await expect(page.getByLabel('Verified recovered video')).toBeVisible();
  expect(await save(page,'Download file')).toEqual(healthyVideo);
});

test('the workspace runs with the API unreachable and sends no binary or filename',async ({page}) => {
  const traffic:{url:string;method:string;data:string|null}[] = [];
  page.on('request',request => {
    const url = request.url();
    if (url.startsWith('http')) traffic.push({url,method:request.method(),data:request.postData()});
  });
  await page.route('**/api/**',route => route.abort());
  await page.goto('/repair');
  await upload(page,'private-filename.pdf',await makePdfFixture('marker-missing'));
  await expect(page.getByText('2 of 2 checked pages rendered')).toBeVisible();
  await attempt(page).click();
  await expect(page.getByRole('heading',{name:'Ready to download'})).toBeVisible();
  await save(page,'Download file');
  expect(traffic.length).toBeGreaterThan(1);
  expect(traffic.every(request => request.url.startsWith('http://127.0.0.1:4411/') && request.method === 'GET' && request.data === null)).toBe(true);
  expect(JSON.stringify(traffic)).not.toContain('private-filename');
});

test('small-screen navigation and FAQ are usable without overflow',async ({page}) => {
  await page.setViewportSize({width:360,height:780});
  await page.goto('/');
  await page.getByRole('button',{name:'Do my files leave my device?'}).click();
  await expect(page.getByText(/File analysis, recovery and verification/)).toBeVisible();
  const menu = page.getByRole('button',{name:'Open menu'});
  await menu.click();
  await expect(page.getByRole('button',{name:'Close menu'})).toHaveAttribute('aria-expanded','true');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Repair Files'}).click();
  await expect(page.getByRole('heading',{name:'Recovery workspace'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Browse files'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('protected local admin signs in, triages feedback, edits settings and signs out',async ({page}) => {
  await page.goto('/feedback');
  await page.getByLabel('Message').fill('An example feedback message from the browser test.');
  await page.getByRole('button',{name:'Send feedback'}).click();
  await expect(page.getByText('Feedback submitted.')).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading',{name:'Admin sign-in'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Overview',exact:true})).toHaveCount(0);
  await page.getByLabel('Username').fill('browser-reviewer');
  await page.getByLabel('Password').fill(process.env.STUDIO_TEST_PASSWORD!);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Administration'})).toBeVisible();
  await page.getByRole('button',{name:'Feedback',exact:true}).click();
  await page.getByLabel('Review state').selectOption('resolved');
  await expect(page.getByText('Review state saved.')).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Public announcement').fill('Local browser test announcement');
  await page.getByRole('button',{name:'Save settings'}).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByRole('heading',{name:'Admin sign-in'})).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
});
