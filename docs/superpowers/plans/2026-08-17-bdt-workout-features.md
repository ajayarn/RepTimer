# BDT Workout Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workout type selection (6-Count / Navy Seals), localStorage workout logging, a Chart.js progress graph, auto-load of previous reps on type selection, and a UI polish pass to the RepTimer GitHub Pages app.

**Architecture:** All persistence uses `localStorage` — no backend, no build step. A storage module (functions added to `app.js`) reads/writes a `bdt_log` JSON array. Chart.js is loaded from CDN. The history graph lives in a toggle panel below the main timer. All changes are confined to the three existing files: `index.html`, `app.js`, `style.css`.

**Tech Stack:** Vanilla JS (ES2020, `"use strict"`), HTML5, CSS3, Chart.js 4.x from jsDelivr CDN, localStorage API.

**Spec:** Design agreed in conversation on 2026-08-17.

## Global Constraints

- No build step, no npm, no ES modules — plain `<script>` tags only
- GitHub Pages compatible: all assets must be relative paths or CDN URLs with HTTPS
- Mobile-first: minimum touch target 44×44px, readable at 375px viewport width
- Dark theme preserved: `--bg: #121212`, `--surface: #1e1e1e`, `--text: #f0f0f0`
- `"use strict"` must remain the first line of `app.js`
- Chart.js CDN: `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js`
- localStorage key: `bdt_log` (single JSON array of workout entries)
- Workout type literals: exactly `'6count'` and `'navyseals'` throughout all code

---

### Task 1: Storage module

Add pure read/write helpers for `localStorage` and extend `state` with two new properties. No UI changes in this task.

**Files:**
- Modify: `app.js` — insert storage functions after motivation arrays (~line 48); add two properties to the `state` object (~line 71)

**Interfaces:**
- Produces:
  - `loadLog(): WorkoutEntry[]`
  - `saveEntry(entry: WorkoutEntry): void`
  - `getLastEntryForType(type: string): WorkoutEntry | null`
  - `state.workoutType: null | '6count' | 'navyseals'`
  - `state.chartInstance: null | Chart`
- WorkoutEntry shape: `{ id: string, type: '6count'|'navyseals', date: string, minutes: number, reps: number, completedAt: string }`

- [ ] **Step 1: Add the storage constants and functions to app.js**

Insert this block immediately after the `motivationFinal` array closing bracket (after the `];` on ~line 48), before the `const el = {` line:

```javascript
const STORAGE_KEY = 'bdt_log';

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveEntry(entry) {
  const log = loadLog();
  log.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch (_) {
    // Storage quota exceeded — silently ignore
  }
}

function getLastEntryForType(type) {
  const log = loadLog();
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === type) return log[i];
  }
  return null;
}
```

- [ ] **Step 2: Add `workoutType` and `chartInstance` to the state object**

In the `state` object literal (~line 71), add these two properties alongside the existing ones:

```javascript
workoutType: null,    // '6count' | 'navyseals' | null
chartInstance: null,  // Chart.js instance reference for destroy/recreate
```

- [ ] **Step 3: Manual verification**

Open the app in the browser. Open DevTools console and run:

```javascript
saveEntry({ id: 'test1', type: '6count', date: '2026-08-17', minutes: 20, reps: 40, completedAt: new Date().toISOString() });
saveEntry({ id: 'test2', type: 'navyseals', date: '2026-08-17', minutes: 15, reps: 30, completedAt: new Date().toISOString() });
console.log(loadLog());                       // → array with 2 entries
console.log(getLastEntryForType('6count'));   // → { id: 'test1', ... }
console.log(getLastEntryForType('navyseals'));// → { id: 'test2', ... }
console.log(getLastEntryForType('other'));    // → null
localStorage.removeItem('bdt_log');           // clean up test data
```

All four assertions must produce the expected results before proceeding.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add localStorage storage module for workout log"
```

---

### Task 2: Workout type selector

Add two large toggle buttons above the inputs. Clicking one sets `state.workoutType`, highlights the active button, and auto-fills the reps field from the most recent log entry for that type. `startTimer()` is updated to require a type selection.

**Files:**
- Modify: `index.html` — add selector markup before `#input-box`
- Modify: `app.js` — add `el` refs, add `selectWorkoutType()`, update `validateInputs()`
- Modify: `style.css` — add `.workout-type-selector` and `.wt-btn` rules

**Interfaces:**
- Consumes: `getLastEntryForType(type)` (Task 1), `state.workoutType` (Task 1)
- Produces: `selectWorkoutType(type: string): void` (exposed on `window`)

- [ ] **Step 1: Add the workout type selector HTML to index.html**

Add this block immediately BEFORE `<section class="input-box" id="input-box"`:

```html
<div class="workout-type-selector" role="group" aria-label="Workout type">
    <button
        class="wt-btn"
        id="wt-6count"
        type="button"
        onclick="selectWorkoutType('6count')"
        aria-pressed="false"
    >
        6-Count
    </button>
    <button
        class="wt-btn"
        id="wt-navyseals"
        type="button"
        onclick="selectWorkoutType('navyseals')"
        aria-pressed="false"
    >
        Navy Seals
    </button>
</div>
```

- [ ] **Step 2: Add DOM refs for the new buttons to the `el` object in app.js**

In the `el` object literal, add alongside the existing refs:

```javascript
wt6Count:     document.getElementById('wt-6count'),
wtNavySeals:  document.getElementById('wt-navyseals'),
```

- [ ] **Step 3: Add `selectWorkoutType()` to app.js**

Add this function after `wireAccessibility()` and before `startTimer()`:

```javascript
function selectWorkoutType(type) {
  state.workoutType = type;

  if (el.wt6Count) {
    el.wt6Count.classList.toggle('active', type === '6count');
    el.wt6Count.setAttribute('aria-pressed', String(type === '6count'));
  }
  if (el.wtNavySeals) {
    el.wtNavySeals.classList.toggle('active', type === 'navyseals');
    el.wtNavySeals.setAttribute('aria-pressed', String(type === 'navyseals'));
  }

  const last = getLastEntryForType(type);
  if (last) {
    el.reps.value = last.reps;
  }
}

window.selectWorkoutType = selectWorkoutType;
```

- [ ] **Step 4: Update `validateInputs()` to require a workout type**

At the very TOP of the existing `validateInputs()` function body, before the time/reps checks, add:

```javascript
if (!state.workoutType) {
  return { ok: false, message: 'Select a workout type (6-Count or Navy Seals) before starting.' };
}
```

- [ ] **Step 5: Add workout type selector styles to style.css**

Append to `style.css`:

```css
/* ── Workout type selector ─────────────────────── */
.workout-type-selector {
    width: 90%;
    max-width: 400px;
    display: flex;
    gap: 12px;
    margin: 16px 0 8px;
}

.wt-btn {
    flex: 1;
    padding: 14px 10px;
    border: 2px solid var(--muted-border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-family: 'Bebas Neue', sans-serif;
    font-size: clamp(18px, 5vw, 24px);
    letter-spacing: 1px;
    min-height: 54px;
    transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.wt-btn.active {
    border-color: var(--start);
    background: var(--start);
    color: #fff;
}

.wt-btn:hover:not(.active) {
    border-color: var(--text);
}
```

- [ ] **Step 6: Manual verification**

1. Reload the app — two buttons ("6-Count", "Navy Seals") appear above the inputs
2. Click "6-Count" — button turns green, "Navy Seals" remains unlit
3. Click "Navy Seals" — it turns green, "6-Count" goes unlit
4. In the console, add a test entry: `saveEntry({ id:'t1', type:'6count', date:'2026-08-17', minutes:20, reps:55, completedAt: new Date().toISOString() })`
5. Click "6-Count" — reps field should auto-fill with `55`
6. Click Start without selecting a type (reload first to clear state) — alert shows the correct error message

Clean up: `localStorage.removeItem('bdt_log')`

- [ ] **Step 7: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: add workout type selector with auto-load of previous reps"
```

---

### Task 3: Log completed workouts

Modify `finishWorkout()` to append a log entry to localStorage when a workout completes. Incomplete/reset workouts are not logged.

**Files:**
- Modify: `app.js` — update `finishWorkout()`

**Interfaces:**
- Consumes: `saveEntry()` (Task 1), `state.workoutType` (Task 1), `state.reps`, `state.intervalSeconds`
- Produces: persisted `WorkoutEntry` in `bdt_log` on every completed workout

- [ ] **Step 1: Add logging to `finishWorkout()` in app.js**

In the existing `finishWorkout(runId)` function, add this block immediately AFTER `state.currentRep = state.reps;` and BEFORE `updateProgress()`:

```javascript
if (state.workoutType) {
  const now = new Date();
  saveEntry({
    id: String(now.getTime()),
    type: state.workoutType,
    date: now.toISOString().slice(0, 10),
    minutes: parseFloat(((state.reps * state.intervalSeconds) / 60).toFixed(1)),
    reps: state.reps,
    completedAt: now.toISOString(),
  });
}
```

- [ ] **Step 2: Manual verification**

1. Select "6-Count", set 1 minute / 3 reps (20-second intervals — fast to test)
2. Start and wait for all 3 reps to complete (or use a very short time like 0.1 min / 3 reps)
3. In the console: `JSON.parse(localStorage.getItem('bdt_log'))` — should show one entry with `type: '6count'`, `reps: 3`, `date: today`
4. Reset and select "6-Count" again — reps field should auto-fill with `3`

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: log completed workouts to localStorage"
```

---

### Task 4: History toggle panel with Chart.js

Add a "▸ History" toggle button below the progress bar that reveals a panel with a Chart.js line chart (last 30 sessions, one series per workout type) and a log list of the last 10 sessions.

**Files:**
- Modify: `index.html` — add Chart.js CDN script, toggle button, history panel markup
- Modify: `app.js` — add `el` refs, `renderHistoryChart()`, `renderHistoryLog()`, `renderHistory()`, `toggleHistory()`
- Modify: `style.css` — add history panel, log entry, and chart styles

**Interfaces:**
- Consumes: `loadLog()` (Task 1), `state.chartInstance` (Task 1), `Chart` global from CDN
- Produces: `toggleHistory(): void` (exposed on `window`)

- [ ] **Step 1: Add Chart.js CDN script to index.html**

Add this line IMMEDIATELY BEFORE `<script src="app.js">`:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```

- [ ] **Step 2: Add the toggle button and history panel to index.html**

Add this block immediately AFTER the closing `</div>` of `.progress-container` and BEFORE the `<audio>` tag:

```html
<button
    class="history-toggle-btn"
    id="history-toggle-btn"
    type="button"
    onclick="toggleHistory()"
    aria-expanded="false"
    aria-controls="history-panel"
>
    &#9658; History
</button>

<section
    id="history-panel"
    class="history-panel"
    aria-label="Workout history"
    hidden
>
    <canvas id="history-chart" aria-label="Workout progress chart"></canvas>
    <div id="history-log" class="history-log" aria-label="Recent workouts"></div>
</section>
```

- [ ] **Step 3: Add DOM refs for history elements to the `el` object in app.js**

```javascript
historyToggleBtn:  document.getElementById('history-toggle-btn'),
historyPanel:      document.getElementById('history-panel'),
historyChartCanvas: document.getElementById('history-chart'),
historyLog:        document.getElementById('history-log'),
```

- [ ] **Step 4: Add history rendering functions to app.js**

Add these functions after `selectWorkoutType()`:

```javascript
function renderHistoryLog(entries) {
  if (!el.historyLog) return;
  if (entries.length === 0) {
    el.historyLog.innerHTML = '<p class="no-history">No workouts logged yet. Complete a workout to see history.</p>';
    return;
  }
  const recent = entries.slice(-10).reverse();
  el.historyLog.innerHTML = recent.map((e) => {
    const label = e.type === '6count' ? '6-Count' : 'Navy Seals';
    return `<div class="log-entry">
      <span class="log-date">${e.date}</span>
      <span class="log-type log-type--${e.type}">${label}</span>
      <span class="log-reps">${e.reps} reps</span>
      <span class="log-mins">${e.minutes}min</span>
    </div>`;
  }).join('');
}

function renderHistoryChart(entries) {
  if (!el.historyChartCanvas || typeof Chart === 'undefined') return;

  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  const sorted = entries
    .slice()
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1))
    .slice(-30);

  const sixData = sorted
    .filter((e) => e.type === '6count')
    .map((e) => ({ x: e.date, y: e.reps }));
  const navyData = sorted
    .filter((e) => e.type === 'navyseals')
    .map((e) => ({ x: e.date, y: e.reps }));

  state.chartInstance = new Chart(el.historyChartCanvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label: '6-Count',
          data: sixData,
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39,174,96,0.15)',
          tension: 0.3,
          pointRadius: 5,
          fill: true,
        },
        {
          label: 'Navy Seals',
          data: navyData,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.15)',
          tension: 0.3,
          pointRadius: 5,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          type: 'category',
          ticks: { color: '#f0f0f0', maxRotation: 45, font: { family: 'Oswald' } },
          grid: { color: '#333' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#f0f0f0', font: { family: 'Oswald' } },
          grid: { color: '#333' },
          title: { display: true, text: 'Reps', color: '#f0f0f0' },
        },
      },
      plugins: {
        legend: { labels: { color: '#f0f0f0', font: { family: 'Oswald' } } },
      },
    },
  });
}

function renderHistory() {
  const log = loadLog();
  renderHistoryChart(log);
  renderHistoryLog(log);
}

function toggleHistory() {
  if (!el.historyPanel || !el.historyToggleBtn) return;
  const isHidden = el.historyPanel.hasAttribute('hidden');
  if (isHidden) {
    el.historyPanel.removeAttribute('hidden');
    el.historyToggleBtn.textContent = '▾ History';
    el.historyToggleBtn.setAttribute('aria-expanded', 'true');
    renderHistory();
  } else {
    el.historyPanel.setAttribute('hidden', '');
    el.historyToggleBtn.textContent = '▸ History';
    el.historyToggleBtn.setAttribute('aria-expanded', 'false');
  }
}

window.toggleHistory = toggleHistory;
```

- [ ] **Step 5: Add history panel styles to style.css**

Append to `style.css`:

```css
/* ── History toggle button ─────────────────────── */
.history-toggle-btn {
    margin-top: 20px;
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--muted-border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-family: 'Oswald', sans-serif;
    font-size: clamp(14px, 4vw, 18px);
    letter-spacing: 1px;
    min-height: 44px;
    transition: border-color 0.2s;
}

.history-toggle-btn:hover {
    border-color: var(--text);
}

/* ── History panel ─────────────────────────────── */
.history-panel {
    width: 90%;
    max-width: 500px;
    margin: 12px 0 24px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
}

.history-panel canvas {
    width: 100% !important;
    max-height: 220px;
}

.history-log {
    margin-top: 16px;
}

.log-entry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: clamp(12px, 3.5vw, 15px);
    gap: 8px;
    flex-wrap: wrap;
}

.log-entry:last-child {
    border-bottom: none;
}

.log-date {
    color: #aaa;
    flex: 0 0 auto;
}

.log-type--6count {
    color: #27ae60;
    font-weight: 700;
    flex: 0 0 auto;
}

.log-type--navyseals {
    color: #3498db;
    font-weight: 700;
    flex: 0 0 auto;
}

.log-reps {
    flex: 1;
    text-align: right;
}

.log-mins {
    color: #aaa;
    flex: 0 0 auto;
}

.no-history {
    text-align: center;
    color: #aaa;
    font-size: 14px;
    margin: 0;
    padding: 12px 0;
}
```

- [ ] **Step 6: Manual verification**

Add test data in the console (several entries across different dates and both types), then:

```javascript
['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14'].forEach((date, i) => {
  saveEntry({ id: String(i)+'a', type:'6count', date, minutes:20, reps:30+i*2, completedAt: date+'T08:00:00Z' });
  saveEntry({ id: String(i)+'b', type:'navyseals', date, minutes:15, reps:20+i, completedAt: date+'T08:30:00Z' });
});
```

1. Click "▸ History" — panel opens, chart shows two colored lines (green = 6-Count, blue = Navy Seals), log lists the 10 most recent entries newest-first
2. Click "▾ History" — panel closes, button reverts to "▸ History"
3. Reopen — chart and log re-render correctly

Clean up: `localStorage.removeItem('bdt_log')`

- [ ] **Step 7: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: add history toggle panel with Chart.js progress graph"
```

---

### Task 5: UI polish

Add a workout type badge that appears during active sessions. Improve spacing, input styling, button sizing, and overall visual tidiness.

**Files:**
- Modify: `index.html` — add badge element inside `#status-msg`
- Modify: `app.js` — add `el` ref, `setWorkoutTypeBadge()` helper, call it in `startTimer()` and `resetTimer()`
- Modify: `style.css` — badge styles + general layout refinements

**Interfaces:**
- Consumes: `state.workoutType` (Task 1)
- Produces: `setWorkoutTypeBadge(type: string | null): void` (internal)

- [ ] **Step 1: Add the badge element to index.html**

Inside `<section class="input-box" id="status-msg">`, add this line BEFORE `<div id="status"`:

```html
<div id="workout-type-badge" class="workout-type-badge" hidden></div>
```

- [ ] **Step 2: Add DOM ref to the `el` object in app.js**

```javascript
workoutTypeBadge: document.getElementById('workout-type-badge'),
```

- [ ] **Step 3: Add `setWorkoutTypeBadge()` to app.js**

Add this function near `setButtonState()`:

```javascript
function setWorkoutTypeBadge(type) {
  if (!el.workoutTypeBadge) return;
  if (!type) {
    el.workoutTypeBadge.setAttribute('hidden', '');
    return;
  }
  el.workoutTypeBadge.removeAttribute('hidden');
  el.workoutTypeBadge.textContent = type === '6count' ? '6-COUNT' : 'NAVY SEALS';
  el.workoutTypeBadge.className = `workout-type-badge workout-type-badge--${type}`;
}
```

- [ ] **Step 4: Call `setWorkoutTypeBadge()` in `startTimer()` and `resetTimer()`**

In `startTimer()`, add immediately after `el.inputBox.style.display = 'none'`:

```javascript
setWorkoutTypeBadge(state.workoutType);
```

In `resetTimer()`, add immediately after `el.inputBox.style.display = 'block'`:

```javascript
setWorkoutTypeBadge(null);
```

- [ ] **Step 5: Add badge and layout polish styles to style.css**

Append to `style.css`:

```css
/* ── Workout type badge (active session) ───────── */
.workout-type-badge {
    text-align: center;
    font-family: 'Bebas Neue', sans-serif;
    font-size: clamp(13px, 3.5vw, 17px);
    letter-spacing: 3px;
    padding: 4px 14px;
    border-radius: 20px;
    margin: 0 auto 6px;
    width: fit-content;
}

.workout-type-badge--6count {
    background: rgba(39, 174, 96, 0.2);
    color: #27ae60;
    border: 1px solid #27ae60;
}

.workout-type-badge--navyseals {
    background: rgba(52, 152, 219, 0.2);
    color: #3498db;
    border: 1px solid #3498db;
}

/* ── General layout refinements ────────────────── */
body {
    padding: 16px 16px 48px;
}

.input-box {
    margin: 8px 0;
    padding: 12px 16px;
}

.buttons {
    margin: 12px 0;
    gap: 12px;
}

.buttons button {
    padding: clamp(12px, 3vw, 18px) clamp(20px, 5vw, 32px);
    border-radius: 8px;
    font-size: clamp(16px, 5vw, 22px);
    font-weight: 700;
    letter-spacing: 1px;
    min-width: 100px;
    min-height: 48px;
}

.progress-container {
    height: 10px;
    margin-top: 16px;
}

.input-group input {
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #2a2a2a;
    font-weight: 600;
}

.input-group input:focus {
    outline: 2px solid var(--start);
    outline-offset: 2px;
    border-color: var(--start);
}
```

- [ ] **Step 6: Manual verification**

1. Open the app on mobile (or DevTools 375px emulation)
2. Workout type buttons are easy to tap (≥54px height)
3. Select "Navy Seals", start a workout — a blue "NAVY SEALS" badge appears in the status section
4. Reset — badge disappears; workout type buttons remain highlighted (UX: user likely doing same type again)
5. Input focus shows green outline
6. Start / Pause / Reset buttons have comfortable padding with no text clipping

- [ ] **Step 7: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: add workout type badge and UI polish"
```
