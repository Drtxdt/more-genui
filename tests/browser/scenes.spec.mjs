import { test, expect } from '@playwright/test';
import { scenes, sceneHTML } from '../../scripts/scenes.mjs';
for (const scene of scenes)
  test('scene: ' + scene.id, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((source) => window.show('scene', source), sceneHTML(scene));
    const frame = page.frameLocator('#app iframe');
    if (!scene.checks.length) {
      await expect(frame.getByRole('img')).toBeVisible();
      expect((await page.locator('#app iframe').boundingBox()).height).toBeLessThan(400);
    }
    for (const [value, expected] of scene.checks) {
      await frame.locator('#value').fill(value);
      await frame.locator('#value').dispatchEvent('input');
      for (let i = 0; i < (scene.steps ?? 0); i++)
        if (await frame.getByRole('button', { name: '下一步' }).isEnabled())
          await frame.getByRole('button', { name: '下一步' }).click();
      await expect(frame.locator('#result')).toHaveText(expected);
    }
  });
