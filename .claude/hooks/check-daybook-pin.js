#!/usr/bin/env node
// PreToolUse guard: blocks any Edit/Write to electron/main.js that would
// remove app.setName('Daybook'). That call pins the userData/SQLite path so
// it stays put across the Daybook -> Life OS rebrand; losing it silently
// orphans every user's existing local database on their next launch.
const fs = require('fs');

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const toolName = payload.tool_name;
  const toolInput = payload.tool_input || {};
  const filePath = String(toolInput.file_path || '').replace(/\\/g, '/');
  if (!filePath.endsWith('electron/main.js')) process.exit(0);

  const PIN = "app.setName('Daybook')";
  let resultingContent = null;

  if (toolName === 'Write') {
    resultingContent = toolInput.content || '';
  } else if (toolName === 'Edit') {
    let current;
    try {
      current = fs.readFileSync(toolInput.file_path, 'utf8');
    } catch {
      process.exit(0);
    }
    const oldStr = toolInput.old_string;
    const newStr = toolInput.new_string;
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') process.exit(0);
    if (toolInput.replace_all) {
      resultingContent = current.split(oldStr).join(newStr);
    } else {
      const idx = current.indexOf(oldStr);
      if (idx === -1) process.exit(0); // Edit itself will error on this; not our concern
      resultingContent = current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
    }
  } else {
    process.exit(0);
  }

  if (resultingContent.includes(PIN)) process.exit(0);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          "This edit removes app.setName('Daybook') from electron/main.js. That call pins the userData/SQLite path so it doesn't change when the product is rebranded — removing or changing it silently orphans every user's existing local database on their next launch. If the storage location really needs to change, do it deliberately with a data-migration step, not as a side effect of this edit.",
      },
    })
  );
  process.exit(0);
});
