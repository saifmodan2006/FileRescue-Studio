import {test,expect} from '@playwright/test';
import {makePdfFixture} from '../fixtures/pdf';
import {trailingVideo} from '../fixtures/mp4';

test('the built application can reopen and recover PDF and MP4 after caching',async ({page,context}) => {
  await page.goto('/repair');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),{},{timeout:20000});
  await context.setOffline(true);
  await page.goto('/repair');
  await page.getByLabel('Files to analyze').setInputFiles({name:'offline.pdf',mimeType:'application/pdf',buffer:await makePdfFixture()});
  await expect(page.getByText('2 of 2 checked pages rendered')).toBeVisible({timeout:12000});
  await page.getByRole('button',{name:'Attempt recovery'}).click();
  await expect(page.getByRole('button',{name:'Download file'})).toBeVisible({timeout:12000});
  await page.getByRole('button',{name:'Start over'}).click();
  await page.getByLabel('Files to analyze').setInputFiles({name:'offline.mp4',mimeType:'video/mp4',buffer:trailingVideo});
  await page.getByRole('button',{name:'Attempt recovery'}).click({timeout:12000});
  await expect(page.getByLabel('Verified recovered video')).toBeVisible({timeout:12000});
});
