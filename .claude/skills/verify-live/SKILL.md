---
name: verify-live
description: Verify a UI/renderer change in this Electron app by launching it with remote debugging and inspecting the live DOM via Chrome DevTools Protocol (CDP), instead of OS-level screenshots. Use this whenever you've changed renderer/*, electron/main.js window behavior, or anything visual/layout-related and need to confirm it actually works before calling the task done.
---

# Verifying live in this app

OS-level screenshot capture (PowerShell + `user32.dll`, `SetWindowPos`/`GetWindowRect`/`PrintWindow`) has repeatedly proven unreliable for this app: stale/wrong-window captures, and a real DPI-virtualization mismatch when a DPI-unaware caller (PowerShell) resizes a per-monitor-DPI-aware Electron window cross-process — `GetWindowRect` echoes back whatever you requested even when the actual content area is a different size. **Don't trust OS screenshots or OS-level resize for this app.** CDP is authoritative.

## 1. Launch with a debugging port

```bash
cd "E:/Project/ADVANCED TO DO board"
./node_modules/.bin/electron.cmd . --remote-debugging-port=9333 &
```

(Use the packaged exe instead — `"dist/win-unpacked/Life OS.exe" --remote-debugging-port=9333` — if you specifically need to verify a packaged build.)

Get the WebSocket URL for the renderer page:

```bash
curl -s http://127.0.0.1:9333/json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);console.log(p.find(x=>x.type==='page').webSocketDebuggerUrl)})"
```

## 2. Run JS in the live renderer

Write a small one-off Node script (Node has a built-in `WebSocket` global) rather than trying to do this inline:

```js
// cdp_check.js — node cdp_check.js "<ws-url>" "<js-expression>"
const ws = new WebSocket(process.argv[2]);
let id = 1;
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: process.argv[3], awaitPromise: true, returnByValue: true } }));
});
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id) { console.log(JSON.stringify(msg.result, null, 2)); ws.close(); process.exit(0); }
});
setTimeout(() => { console.error('Timed out'); process.exit(1); }, 8000);
```

Use this to: click nav items (`document.querySelector('[data-view=reports]').click()`), read `getBoundingClientRect()` on elements to check for overflow (`el.scrollWidth > el.clientWidth`), call `window.api.*` directly to read/write real data, or `location.reload()` after editing renderer files (renderer changes need a reload; `electron/main.js` changes need a full process restart).

## 3. Test different window sizes without touching the OS window

Use CDP's own viewport override instead of resizing the real window — it sidesteps the DPI-virtualization problem entirely and is what this app's `minWidth: 860` constraint should be checked against:

```js
// Apply: Emulation.setDeviceMetricsOverride { width, height, deviceScaleFactor: 0, mobile: false }
// Clear:  Emulation.clearDeviceMetricsOverride {}
```

After applying, re-run your `Runtime.evaluate` DOM checks (`window.innerWidth`, `element.getBoundingClientRect()`, `document.body.scrollWidth > window.innerWidth`) — these now reflect the overridden size.

## 4. Visual screenshots (only if DOM measurements aren't enough)

CDP's own `Page.captureScreenshot` (after `Page.enable`) is more reliable than an OS screenshot, but has occasionally hung in this environment for no clear reason — give it a generous timeout (15–20s) and don't loop-retry more than once or twice. Prefer precise `getBoundingClientRect()`/`scrollWidth` checks over a visual screenshot whenever the question is "does this overflow" rather than "does this look right."

## Rules

- Never touch or delete the user's real tasks/food logs/settings. If you need test data, create it through `window.api.*` and **delete it again** before finishing.
- Clean up: close any extra debug-launched Electron processes you started (`taskkill //PID <pid> //T //F`) when done, and clear any active `Emulation.setDeviceMetricsOverride`.
