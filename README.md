# Hush

Hush runs maintainer-authored Chromium journeys to check whether specific app content survives offline edits, reload, browser restart, an upgrade and backup restore. It writes local JSON and HTML reports, a browser log, and any screenshots and backups requested by the recipe. Results cover the content and conditions asserted by that recipe.

## Try the synthetic example

Requires Node 20+, npm and a Playwright-compatible Chromium. From a fresh checkout (the committed lockfile pins the package resolution):

```sh
npm ci
npx playwright install chromium
npm test
npm run demo
```

Open `report.html` inside the newly created `example-evidence-...` directory. The demo starts and closes a loopback server and uses synthetic notes. It checks offline edits, a build switch, and that both a newly exported backup and an older fixture survive a restart after import. Unit tests use mock browser objects for validation and error reporting. The demo runs in Chromium.

Exit 0 means the authored assertions and evidence collection passed. Exit 1 indicates a recorded setup, journey, cleanup or evidence failure. Exit 2 covers invalid input, recognized environment restrictions, or an error that prevents writing the report.

On Windows, if the local demo loads but `serviceWorkerReady` times out with a deeply nested temporary directory, try a shorter writable location for `TEMP` and `TMP` in the current shell. Chromium stores service-worker state under the temporary test profile.

## Author a journey

Run `node cli.js recipe.json output-directory`. If you omit the output directory, Hush uses `hush-evidence` in the current directory. Hush reserves the directory exclusively. Use a new name under an existing parent for every run.

A recipe has a `name` and ordered `steps`. Supported actions include `goto` (`url`), `fill` (`selector`, `value`), `click` (`selector`), `expectText` (`selector`, `value`, substring match), `offline` (boolean `value`), `reload`, `restart`, `serviceWorkerReady`, `export` (`selector`, triggers a download), `import` (`selector`, file input in a fresh context), and `screenshot`. `switchBuild` sends a POST to a same-origin endpoint on the maintainer’s test server. The endpoint must atomically make the next build available. Use the same origin for both builds.

`restart` closes Chromium and reopens its current profile. `import` starts a new profile, loads the backup and keeps that profile for later restarts. It can read an optional `fixture` path relative to the working directory. See `examples/demo.js` for a complete recipe with assertions after each restore.

A failed journey step stops execution and attempts a screenshot. The report records recognized browser launch or navigation restrictions as `environment-blocked`. Failed cleanup appears in the report as a failure. Unsupported actions are rejected before a report is created. Browser actions execute against the supplied app, so use trusted recipes on controlled test targets. Reports, downloads, screenshots, logs and temporary profiles may contain app data. Use synthetic data and review evidence before sharing.

## Scope and limitations

Hush supports Chromium and recipe-authored checks. Its offline mode uses browser emulation, and its restart is a graceful browser close and open. Forced crashes, real devices, storage eviction or pressure, additional network paths, OS upgrades, and installability are outside this workflow. The maintainer provides migration fixtures and a build switch endpoint. Export assumes a browser download and import assumes a file input. The sample service worker is for the synthetic test app. Verify that your assertions cover the data you intend to check.

## Related work

Related tools include [pwa-check](https://github.com/pwa-today/pwa-check), [pwa-offline-check](https://github.com/INNERLUXES/pwa-offline-check) and [PWA Today](https://pwa.today/).

MIT licensed; Playwright is a separate dependency with its own license.
