// e2e/wdio.conf.ts — configuration contract (TDD §5.1, implements FSD §5.2)
//
// SPIKE-1 actuals (verified against the INSTALLED packages — TDD OI-5 sanctions adjusting
// the §5.1 sketch with committed evidence, "no redesign expected"):
//
//  1. wdio-vscode-service 8.0.0 capability key is `wdio:vscodeOptions`
//     (dist/constants.js VSCODE_CAPABILITY_KEY), NOT `wdio-vscode-service:options`
//     as sketched in FSD §5.2. Using the FSD-sketched key would be silently ignored
//     by the service (it reads cap['wdio:vscodeOptions'] in dist/launcher.js).
//  2. The custom IDE binary option key is `binary` (dist/types.d.ts ServiceOptions.binary),
//     NOT `binaryPath` as sketched in FSD §5.2. FSD §5.2 needs a key-name correction in
//     its next revision (BA action); the runtime contract follows the service API.
//  3. Serenity/JS wiring uses the documented `serenity` config key (WithSerenityConfig):
//     `serenity.actors` registers the cast, `serenity.crew` registers StageCrewMembers
//     via ClassDescription (string-based). The @serenity-js/webdriverio adapter invokes
//     Serenity.configure() itself (WebdriverIOFrameworkAdapter constructor), so a manual
//     configure() in a before() hook would conflict with the adapter's own wiring.
//  4. ArtifactArchiver is registered by the adapter's default config
//     (ArtifactArchiver.storingArtifactsAt(cwd, 'target/site/serenity')) — not repeated here
//     to avoid duplicate artifact archiving.
//  5. Page-object commands added by the service at runtime: browser.getWorkbench(),
//     browser.executeWorkbench() (dist/service.d.ts VSCodeCommands augmentation).
//  6. Cucumber glue: @cucumber/cucumber 13 has no built-in TS transpilation — TS step
//     definitions require the `tsx` module loader (requireModule: ['tsx/cjs']).
//     There is no `stepDefinitions` key in CucumberConfig (CucumberConfig.d.ts) — the
//     TDD §5.1 sketch's `stepDefinitions` key is adjusted to `require` + `requireModule`.
//  7. `paths` is overridden by the adapter from the WDIO `specs` config
//     (CucumberCLIAdapter.runWithCucumberApi: `configuration.paths = pathsToScenarios`),
//     so it is not duplicated in cucumberOpts.
//
// Env validation runs at module load — BEFORE the IDE launch (BR-01 fail fast, TDD §9 row 1).
import { join } from 'node:path';
import type {} from 'webdriverio';
import type {} from 'wdio-vscode-service';
import type { WebdriverIOConfig } from '@serenity-js/webdriverio';
import { Actors } from './src/cast';
import { resolveE2EEnv } from './src/support/env';

const env = resolveE2EEnv();   // throws EnvConfigError BEFORE IDE launch if invalid (BR-01)

export const config: WebdriverIOConfig = {
    runner: 'local',                                        // FSD 5.2
    specs: [ join(__dirname, 'features', '**', '*.feature') ],
    maxInstances: 1,                                        // serialized IDE sessions (FSD 5.2)
    maxInstancesPerCapability: 1,                           // WDIO v9: 1 VSCode per worker, serial — 4 parallel instances thrash CI runners (1006 flakiness, SPIKE-4)

    capabilities: [{
        browserName: 'vscode',                              // IDE selection (FSD 5.2)
        // SPIKE-1: actual capability key for wdio-vscode-service 8.0.0 (VSCODE_CAPABILITY_KEY)
        'wdio:vscodeOptions': {
            binary: env.ideBinaryPath,                      // SPIKE-1: option key is 'binary' (BR-01)
            version: env.ideVersion,                        // pin so chromedriver matches the installed VSCode (SPIKE-4: 'stable' resolves latest → chromedriver/binary mismatch → 1006)
            extensionPath: join(__dirname, '..', 'extension'),   // extension under development
            workspacePath: env.workspacePath,               // E2E_BASE_URL (BR-01), undefined if absent
            vscodeArgs: env.headless
                ? { 'disable-gpu': true, 'no-sandbox': true }    // CI headless flags (UC-07)
                : {},
            userSettings: { 'update.mode': 'none', 'extensions.autoUpdate': false },   // test isolation (BR-05)
        },
    }],

    services: [
        'vscode',                                           // wdio-vscode-service (FSD 5.2)
    ],

    framework: '@serenity-js/webdriverio',                  // Screenplay + reporting (FSD 5.2)

    // SPIKE-1: Serenity/JS wiring via the documented `serenity` config key
    // (WithSerenityConfig — @serenity-js/webdriverio). The cast (TDD §5.2) is registered
    // through `serenity.actors`; failure screenshots (BR-08) through the Photographer
    // crew member; console output (FSD §5.2) through the console-reporter crew member.
    serenity: {
        runner: 'cucumber',                                 // Gherkin glue (@serenity-js/cucumber)
        actors: new Actors(),                               // e2e/src/cast.ts (TDD §5.2)
        crew: [
            '@serenity-js/console-reporter',                // FSD §5.2 — console output
            ['@serenity-js/serenity-bdd', { specDirectory: './features' }],            // UC-06 — Serenity BDD results
            ['@serenity-js/core:ArtifactArchiver', { outputDirectory: './target/site/serenity' }],   // UC-06 — raw JSONs for the CLI render (Serenity/JS handbook: no WDIO 'serenity-bdd' service plugin exists — HTML render is a post-run CLI step)
            ['@serenity-js/web:Photographer', { strategy: 'TakePhotosOfFailures' }],   // BR-08 — screenshot on EVERY failed step
        ],
    },

    cucumberOpts: {
        require: [ join(__dirname, 'features', 'step_definitions', '**', '*.steps.ts') ],
        requireModule: ['tsx/cjs'],                         // SPIKE-1: TS step definitions (cucumber 13)
        retry: 2,                                           // BR-03
        failFast: env.failFast,                             // env-driven (FSD 5.2)
        strict: true,                                       // fail on undefined steps
        timeout: 60_000,                                    // step timeout — 5s adapter default truncates Wait.upTo eventually-assertions (SPIKE-4, per Serenity/JS handbook)
    },

    outputDir: 'target/site/serenity',                      // FSD 5.2 — report output root (OI-3)

    baseUrl: env.workspacePath,                             // from E2E_BASE_URL (FSD 5.2)

    connectionRetryTimeout: 120000,                         // IDE launch budget; CI dumps logs on timeout (UC-07 EF-2)
    connectionRetryCount: 3,                                // CI resilience: service↔workbench WebSocket drops (1006) recover on re-connect (SPIKE-4); scenario-level retries remain BR-03 (=2)
    logLevel: env.ci ? 'info' : 'warn',                     // FSD 5.2 (info in CI for diagnosis)
};
