import { defineConfig } from 'wxt';
export default defineConfig({
  manifest: {
    name: 'More GenUI',
    description: 'Interactive applications inside DeepSeek replies.',
    permissions: ['storage'],
    host_permissions: ['https://chat.deepseek.com/*'],
    sandbox: { pages: ['sandbox.html'] },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'",
      sandbox:
        "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
    },
    web_accessible_resources: [
      { resources: ['sandbox.html'], matches: ['https://chat.deepseek.com/*'] },
    ],
  },
});
