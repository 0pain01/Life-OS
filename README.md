# Daybook

A neumorphic ("soft UI") Windows desktop app that combines **task
management** (with recurring reminders and projects) and **nutrition
tracking** (food search, logging, goals, charts, and a day-by-day report
calendar) in one place — built with Electron and a local SQLite database.
No account, no cloud sync, no subscription: everything lives on your own
machine.

Every structural element — panels, buttons, inputs, nav, checkboxes, modals —
is styled with paired light/dark shadows, reading as either raised
(pending/actionable) or pressed (active/settled, e.g. a completed task looks
visibly "sunk in"). Two neumorphic zones — a dark navy sidebar and a light
lavender content area — are tied together by a vivid indigo/orange/green
palette (indigo as the primary accent and for calories/protein, orange for
fat, green for carbs), consistent across progress bars, donut/trend charts,
and goal cards.

## Features

- **Tasks** — due dates with daily/monthly/yearly recurrence (completing a
  recurring task rolls it forward to the next occurrence instead of deleting
  it), projects/categories you can create on the fly right from the task
  form, priority, notes, and desktop reminders (checked every minute;
  overdue tasks re-notify once per day, upcoming tasks notify once when they
  enter your configured lead time).
- **Nutrition** — search foods across two sources tuned for India: a
  built-in catalog of ~90 common home-style Indian dishes and staples (dal,
  roti, biryani, idli, sambar, paneer dishes, etc. — see
  `electron/indianFoodsSeed.js`) and
  [Open Food Facts](https://world.openfoodfacts.org/) for packaged/branded
  products (Amul, Britannia, Haldiram's, MTR, Parle, and others — no API key
  needed, works with no signup). Custom foods can be entered by hand for
  anything not found, with optional saturated fat / sugar / fiber / sodium
  fields alongside the core macros. Logged entries can be edited after the
  fact (meal, servings, serving size) without re-looking up the food.
- **Optional AI-assisted lookup (Gemini)** — paste a free Gemini API key
  (from [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
  into Settings and search tries Gemini first, with Google Search grounding
  so it's citing live results rather than the model's memory — useful for
  dishes and regional/branded items Open Food Facts doesn't carry. It
  cascades across several model tiers (`electron/geminiNutritionApi.js`) so
  one tier's free daily quota running out doesn't stop lookups, and only
  falls back to Open Food Facts once every tier has failed. Results from
  Gemini are tagged **AI ESTIMATE** in the UI — review them, since even a
  grounded model can get a number wrong. Leave the key blank and nothing
  changes — Open Food Facts stays the default, and no network calls beyond
  it are ever made.
- **Photo-based product search & label scanning** — attach or take one
  deliberate photo of a package and local OCR
  ([Tesseract.js](https://github.com/naptha/tesseract.js), fully vendored
  under `renderer/js/vendor/tesseract/`, runs completely offline with no
  cloud vision API) reads it. If the photo contains an EAN/UPC-length digit
  run, that's looked up as a barcode first; otherwise the best-guessed
  product name seeds a text search automatically. The same capture, pointed
  at a nutrition facts panel instead, auto-fills the custom-food form's
  numeric fields — always shown as a pre-fill to review, not saved blindly.
- **Goals + visual tracking** — set daily calorie/protein/fat/carb goals
  from the Nutrition page. Today's macro breakdown shows as a donut chart
  with a progress-bar readout underneath, and a trends panel charts any of
  the four metrics over Day/Week/Month/Year (week/month/year points are
  averaged-per-day so they stay comparable to the daily goal line).
- **Reports** — the same Day/Week/Month/Year trend chart and averaged
  progress bars as Nutrition, plus a **calendar**: browse any month, days
  with logged food are marked, and clicking a day shows everything you ate
  that day with its totals — a quick way to look back at a specific date
  without changing the date picker on the Nutrition page.
- **Today view** — a hero banner with at-a-glance stats (calories left,
  tasks due, overdue), tasks due today, overdue tasks, and today's nutrition
  donut, all in one screen.

### About the nutrition data

The home-style Indian dish values are reasonable generic estimates for a
typical preparation — actual recipes vary by household and region, so treat
them as a starting point and add a custom food (or edit portion sizes) when
you want something more precise. Open Food Facts is crowd-sourced, so
packaged-product coverage varies by brand; if a scan or search comes up
empty, add it as a custom food and it's saved locally for next time.

## Installing and running it

**Prerequisites:** [Node.js](https://nodejs.org/) (LTS) and npm. Daybook is
built and tested on Windows.

```bash
git clone https://github.com/0pain01/Life-OS.git
cd Life-OS
npm install
npm start
```

`npm install` also rebuilds `better-sqlite3` for Electron's Node ABI via
`electron-rebuild` (wired up as a `postinstall` script) — no extra step
needed. Data is stored locally in a SQLite database under your Windows user
profile (`%APPDATA%/Daybook/data/daybook.sqlite3`); nothing leaves your
machine unless you opt into a Gemini API key in Settings.

### Building a Windows executable

```bash
npm run dist
```

This runs `electron-builder` and produces an NSIS installer in `dist/`,
using the icon under `build/icon.ico`. On some Windows setups without
Developer Mode enabled, `electron-builder` can fail while preparing macOS
code-signing tooling it prepares by default even for a Windows-only build
(`Cannot create symbolic link: A required privilege is not held by the
client`) — this doesn't affect the app itself. If it happens, the fully
packaged, runnable app is still available directly at
`dist/win-unpacked/Daybook.exe`; either enable Developer Mode (Settings →
Privacy & security → For developers) and rerun `npm run dist` for a proper
installer, or just use the unpacked exe as a portable build.

## Project layout

```
electron/          main process: db.js (SQLite schema/queries), main.js,
                    preload.js (contextBridge IPC), nutritionApi.js,
                    geminiNutritionApi.js, reminders.js, recurrence.js,
                    indianFoodsSeed.js
renderer/           renderer process: plain HTML/CSS/JS, one view module per
                    screen (dashboard, tasks, nutrition, reports, settings),
                    js/charts.js (donut/line canvas drawing),
                    js/nutritionShared.js (macro colors, trend bucketing,
                    shared donut/progress/trend rendering), js/ocr.js
                    (Tesseract worker mgmt, barcode-digit and nutrition-label
                    text parsing), js/vendor/tesseract/ for the vendored
                    offline OCR engine + language data
scripts/            build-time utility that renders build/icon.ico from
                    scripts/icon-design.html
build/              packaged app icon (icon.ico / icon.png)
```

No build step or frontend framework — the renderer is loaded directly by
Electron, and `window.api.*` (exposed via `preload.js`) is the only bridge to
the main process and the database.

## License

MIT — see [LICENSE](LICENSE).
