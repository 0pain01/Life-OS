// Minimal dependency-free canvas charts, styled to match the app's theme.

// clientWidth includes the element's own padding (it's the padding-box, not
// the content-box), so a canvas that's a direct child of a padded .panel
// and sized to parentElement.clientWidth ends up exactly one right-padding
// too wide — it renders fine but its right edge (and the chart lines drawn
// near it) sit past the panel's actual content edge, spilling through the
// rounded corner. Subtracting the parent's own left/right padding gives the
// true content width the canvas should fill.
function contentWidth(el) {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
}

// Multi-series line chart with optional dashed target reference line.
// series: [{ values: number[], color: string }]. All series share `labels`.
function drawLineChart(canvas, { labels, series, target, gridColor, textColor }) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // Must measure the *parent's* width, never canvas.clientWidth — we set
  // canvas.style.width below on every draw, so on the second call onward
  // canvas.clientWidth just reflects that previous fixed value rather than
  // how much room is actually available now. Reading it back here made the
  // canvas self-referential: it could never grow into a wider container on
  // resize (only the parent's size, measured fresh, can tell us that).
  const cssWidth = contentWidth(canvas.parentElement);
  // Intended height must come from a value we never overwrite — reading it
  // back from canvas.height (as this used to) breaks on any HiDPI display:
  // canvas.height gets set to cssHeight * dpr below, so the *next* render
  // reads that already-scaled value as the new "intended" height and
  // multiplies by dpr again, compounding the canvas taller on every
  // re-render until it overflows its container.
  const cssHeight = Number(canvas.dataset.height) || 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 16, right: 16, bottom: 26, left: 46 };
  const chartW = cssWidth - padding.left - padding.right;
  const chartH = cssHeight - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(target || 0, ...allValues, 1) * 1.15;
  const n = labels.length || 1;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const xAt = (i) => padding.left + (n > 1 ? stepX * i : chartW / 2);
  const yAt = (v) => padding.top + chartH - (v / maxVal) * chartH;

  // Y-axis gridlines
  ctx.strokeStyle = gridColor || '#ece9f7';
  ctx.fillStyle = textColor || '#8b889f';
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxVal / ySteps) * i;
    const y = yAt(val);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(Math.round(val).toString(), padding.left - 8, y);
  }

  // Target line
  if (target) {
    const y = yAt(target);
    ctx.strokeStyle = '#f5883d';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Series lines + points
  series.forEach((s) => {
    if (s.values.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = s.color;
    s.values.forEach((v, i) => {
      if (n > 14) return; // dots get noisy on dense series — line alone reads fine
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // X labels — measure actual text width so labels never overlap regardless
  // of point count, canvas width, or font metrics (a fixed every-Nth-point
  // stride can still collide when points are packed close together).
  ctx.fillStyle = textColor || '#8b889f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const minGap = 6;
  let rightEdgeOfLast = -Infinity;
  const y = padding.top + chartH + 8;
  labels.forEach((label, i) => {
    if (i === n - 1) return; // last point is drawn separately below, after the greedy pass
    const x = xAt(i);
    const halfWidth = ctx.measureText(label).width / 2;
    if (x - halfWidth < rightEdgeOfLast + minGap) return;
    ctx.fillText(label, x, y);
    rightEdgeOfLast = x + halfWidth;
  });
  // Always try to label the most recent point — only skip it if it would
  // genuinely collide with whatever ended up drawn right before it.
  if (n > 0) {
    const lastLabel = labels[n - 1];
    const x = xAt(n - 1);
    const halfWidth = ctx.measureText(lastLabel).width / 2;
    if (x - halfWidth >= rightEdgeOfLast + minGap) ctx.fillText(lastLabel, x, y);
  }
}

// Donut chart for a single day's macro-calorie breakdown, with an optional
// label drawn in the center hole.
function drawDonutChart(canvas, { segments, centerLabel, centerSubLabel, textColor }) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // See the comment in drawLineChart — canvas.height is write-only here
  // (it holds the scaled drawing-buffer size after the first render), so
  // the intended size has to come from a value this function never sets.
  const size = Number(canvas.dataset.height) || Math.min(contentWidth(canvas.parentElement) || 220, 220);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.62;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ece9f7';
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();
  } else {
    let start = -Math.PI / 2;
    segments.forEach((seg) => {
      if (seg.value <= 0) return;
      const angle = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, start, start + angle);
      ctx.lineWidth = outerR - innerR;
      ctx.strokeStyle = seg.color;
      ctx.lineCap = segments.length > 1 ? 'butt' : 'round';
      ctx.stroke();
      start += angle;
    });
  }

  if (centerLabel) {
    ctx.fillStyle = textColor || '#1e1b3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 20px Segoe UI, sans-serif';
    ctx.fillText(centerLabel, cx, cy + (centerSubLabel ? -8 : 0));
    if (centerSubLabel) {
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.fillStyle = '#8b889f';
      ctx.fillText(centerSubLabel, cx, cy + 12);
    }
  }
}
