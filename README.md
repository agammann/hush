# Hush survival kit (alpha)

Hush runs maintainer-authored browser journeys to check whether specific app content survives offline editing, reload, browser restart and export/import. It writes a local JSON and HTML report, browser log, screenshots and an exported backup. It is a prototype, not proof that an app is safe or that all data survives.

## Try the synthetic example

Requires Node 20+, npm and a Playwright-compatible Chromium. From a fresh checkout:

```sh
npm install
npx playwright install chromium
npm test
npm run demo
```

Open `report.html` inside the newly created `example-evidence-...` directory. The demo starts and closes a loopback server. It uses synthetic text only. Exit 0 means the authored assertions passed, 1 means a journey step failed, and 2 indicates invalid input or setup failure. The browser's network access can be blocked by an execution environment; investigate that separately from application failures.

## Author a journey

Run `node cli.js recipe.json output-directory`. The output directory must not exist, and its parent must already exist. Hush reserves it exclusively; use a new directory for every run. A recipe has a `name` and ordered `steps`. Supported actions: `goto` (`url`), `fill` (`selector`, `value`), `click` (`selector`), `expectText` (`selector`, `value`, substring match), `offline` (boolean `value`), `reload`, `restart`, `serviceWorkerReady`, `export` (`selector`, triggers a download), `import` (`selector`, file input in a fresh context), and `screenshot`. `switchBuild` sends a POST to a same-origin endpoint managed by the test server; it must atomically make the next build available. `import` optionally accepts a `fixture` file path, relative to the current working directory. See `examples/demo.js` for the complete workflow. Use URLs for builds under the same origin when testing a migration; the maintainer is responsible for serving and switching those builds. `restart` reopens the browser with its existing profile; import starts a fresh browser profile, loads the backup, and keeps that profile for later restarts.

A failing step stops the journey. Known browser launch permission denial and browser network access denial are marked `environment-blocked`; other setup and journey errors are failures. Evidence write failures are failures or produce a nonzero error if the report itself cannot be written. Network access denial is marked `environment-blocked`; other navigation errors require investigation. Unsupported actions are rejected during validation, before a report is created. A screenshot is attempted on failure. Reports, downloads, screenshots, logs and temporary browser profiles may contain app data: use synthetic data and review evidence before sharing. Do not point this tool at an untrusted recipe: actions execute against the supplied application.

## Scope and limitations

Chromium only. Offline emulation is not proof of real-device behavior, storage eviction, all network paths or OS upgrades. Assertions only cover content the recipe checks. There is no automated release/browser matrix, managed multi-build server, storage-pressure simulation, real device support, or portfolio-app dogfooding yet. The sample switches two synthetic builds and restores a versioned fixture; production migrations need application-specific fixtures and a switch endpoint. Export assumes a browser download; import assumes a file input. The sample app's service worker is illustrative, not production code. The tool does not assess installability or detect bad or incomplete oracles.

## Related work

[pwa-check](https://github.com/pwa-today/pwa-check) offers automated PWA health checks; [pwa-offline-check](https://github.com/INNERLUXES/pwa-offline-check) inspects built sites for offline, installation and update issues. [PWA Today](https://pwa.today/) already provides hosted browser runtime and release audits, including offline navigation and updates. Hush explores a narrower local, app-authored content-survival and backup-restore workflow. These sources do not establish uniqueness or market fit.

MIT licensed; Playwright is a separate dependency with its own license.
