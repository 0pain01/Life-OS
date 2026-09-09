// Pure helper functions for computing recurring task due dates.
// Dates are handled as 'YYYY-MM-DD' strings (local calendar days, no time component)
// to avoid timezone drift when a task recurs daily/monthly/yearly.

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return formatDate(new Date());
}

/**
 * Given a due date and a recurrence rule, return the next due date string.
 * recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
 * interval: positive integer, e.g. every 2 days/weeks/months/years (default 1)
 */
function nextDueDate(dueDateStr, recurrence, interval = 1) {
  if (!dueDateStr || recurrence === 'none' || !recurrence) return null;
  const n = Math.max(1, parseInt(interval, 10) || 1);
  const base = parseDate(dueDateStr);

  if (recurrence === 'daily') {
    base.setDate(base.getDate() + n);
    return formatDate(base);
  }
  if (recurrence === 'weekly') {
    base.setDate(base.getDate() + n * 7);
    return formatDate(base);
  }
  if (recurrence === 'monthly') {
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + n);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, daysInMonth));
    return formatDate(base);
  }
  if (recurrence === 'yearly') {
    const day = base.getDate();
    const month = base.getMonth();
    base.setFullYear(base.getFullYear() + n);
    // Handle Feb 29 -> Feb 28 on non-leap years
    if (month === 1 && day === 29) {
      const daysInFeb = new Date(base.getFullYear(), 2, 0).getDate();
      base.setMonth(1, Math.min(day, daysInFeb));
    } else {
      base.setMonth(month, day);
    }
    return formatDate(base);
  }
  return null;
}

/**
 * Advance a due date repeatedly until it is today or in the future.
 * Used so a recurring task that was missed (app closed for a while)
 * catches up to the next relevant occurrence instead of nagging forever
 * in the past.
 */
function catchUpDueDate(dueDateStr, recurrence, interval = 1) {
  if (!dueDateStr || recurrence === 'none' || !recurrence) return dueDateStr;
  let current = dueDateStr;
  const today = todayStr();
  let guard = 0;
  while (current < today && guard < 10000) {
    const next = nextDueDate(current, recurrence, interval);
    if (!next) break;
    current = next;
    guard++;
  }
  return current;
}

module.exports = { parseDate, formatDate, todayStr, nextDueDate, catchUpDueDate };
