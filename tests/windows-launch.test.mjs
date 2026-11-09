import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';

// Exercise Playwright's argument builder without starting a browser or touching a real profile.
test(
  'Windows Chromium launches preserve one combined feature switch',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const launches = [];
    t.mock.method(childProcess, 'spawn', (executable, args) => {
      launches.push({ executable, args });
      throw new Error('process creation intercepted');
    });
    const { chromium } = await import('@playwright/test');
    const options = { executablePath: process.execPath, args: ['--load-extension=fixture'] };
    for (const launch of [
      () => chromium.launch(options),
      () => chromium.launchPersistentContext('', options),
    ]) {
      await assert.rejects(launch, /process creation intercepted/);
      const { executable, args } = launches.shift();
      assert.equal(executable, process.execPath);
      const switches = args.filter((arg) => arg.startsWith('--disable-features='));
      assert.equal(switches.length, 1);
      const features = switches[0].slice('--disable-features='.length).split(',');
      assert.ok(features.includes('AutofillAiWalletPrivatePasses'));
      assert.ok(features.includes('msForceBrowserSignIn'));
      assert.ok(args.includes('--load-extension=fixture'));
      assert.equal(launches.length, 0);
    }
  },
);
