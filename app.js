"use strict";

/**
 * RepTimer app logic
 * - safer validation
 * - cached DOM refs
 * - robust timeout/interval cleanup
 * - basic accessibility live-region wiring
 */

const PREP_SECONDS = 10;
const COUNTDOWN_TICK_MS = 200;

const STORAGE_KEY = 'bdt_log';

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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

const el = {
  time: document.getElementById("time"),
  reps: document.getElementById("reps"),

  wt6Count:     document.getElementById('wt-6count'),
  wtNavySeals:  document.getElementById('wt-navyseals'),

  startBtn: document.getElementById("start-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resetBtn: document.getElementById("reset-btn"),

  status: document.getElementById("status"),
  message: document.getElementById("message"),
  repCount: document.getElementById("rep-count"),
  bigTimer: document.getElementById("big-timer"),

  confettiContainer: document.getElementById("confetti-container"),

  historyPanel:       document.getElementById('history-panel'),
  historyChartCanvas: document.getElementById('history-chart'),
  historyLog:         document.getElementById('history-log'),

  workoutTypeBadge: document.getElementById('workout-type-badge'),

  setupScreen:   document.getElementById('setup-screen'),
  activeScreen:  document.getElementById('active-screen'),
  workoutTimer:  document.getElementById('workout-timer'),
  dotGrid:       document.getElementById('dot-grid'),
  dotGridCount:  document.getElementById('dot-grid-count'),
  repPaceHint:   document.getElementById('rep-pace-hint'),
  topPanelLabel:    document.getElementById('top-panel-label'),
  validationError:  document.getElementById('validation-error'),
};

const state = {
  activeTimeout: null,
  countdownInterval: null,
  confettiCleanupTimeout: null,

  intervalSeconds: 0,
  reps: 0,
  currentRep: 0,

  paused: false,
  currentPhase: "idle", // idle | prep | rep | finished
  phaseRemainingMs: 0,
  phaseEndsAt: 0,

  audioContext: null,
  runId: 0, // invalidates stale async callbacks

  workoutType: null,    // '6count' | 'navyseals' | null
  chartInstance: null,  // Chart.js instance reference for destroy/recreate
  totalWorkoutMs: 0,
};

function wireAccessibility() {
  if (el.status) {
    el.status.setAttribute("role", "status");
    el.status.setAttribute("aria-live", "polite");
    el.status.setAttribute("aria-atomic", "true");
  }

  if (el.message) {
    el.message.setAttribute("aria-live", "polite");
    el.message.setAttribute("aria-atomic", "true");
  }

  if (el.repCount) {
    el.repCount.setAttribute("aria-live", "polite");
    el.repCount.setAttribute("aria-atomic", "true");
  }

  if (el.time) el.time.setAttribute("inputmode", "decimal");
  if (el.reps) el.reps.setAttribute("inputmode", "numeric");
}

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

  if (el.validationError) el.validationError.textContent = '';

  const last = getLastEntryForType(type);
  if (last) {
    el.reps.value = last.reps;
  }
  updateRepPaceHint();
}

window.selectWorkoutType = selectWorkoutType;

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

  const labels = [...new Set(sorted.map((e) => e.date))].sort();

  state.chartInstance = new Chart(el.historyChartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '6-Count',
          data: labels.map((d) => {
            const e = sorted.filter((x) => x.type === '6count' && x.date === d).pop();
            return e ? e.reps : null;
          }),
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39,174,96,0.15)',
          tension: 0.3,
          pointRadius: 5,
          fill: true,
          spanGaps: true,
        },
        {
          label: 'Navy Seals',
          data: labels.map((d) => {
            const e = sorted.filter((x) => x.type === 'navyseals' && x.date === d).pop();
            return e ? e.reps : null;
          }),
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.15)',
          tension: 0.3,
          pointRadius: 5,
          fill: true,
          spanGaps: true,
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


function getAudioContext() {
  if (state.audioContext) {
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch((err) => {
        console.warn("Audio resume failed:", err);
      });
    }
    return state.audioContext;
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  state.audioContext = new Ctx();
  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch((err) => {
      console.warn("Audio resume failed:", err);
    });
  }
  return state.audioContext;
}

function beep() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1000, ctx.currentTime);
  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.2);
}

function playFinishTune() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Ascending C-major arpeggio: C5 E5 G5 C6
  const notes = [
    { freq: 523.25, start: 0.0,  dur: 0.14 },
    { freq: 659.25, start: 0.12, dur: 0.14 },
    { freq: 784.0,  start: 0.24, dur: 0.14 },
    { freq: 1046.5, start: 0.36, dur: 0.7  },
  ];

  notes.forEach(({ freq, start, dur }) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

    gain.gain.setValueAtTime(0, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.025);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  });
}

function formatClock(totalMs) {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateProgress() {
  updateDotGrid(state.currentRep);
}

function buildDotGrid(reps) {
  if (!el.dotGrid) return;
  el.dotGrid.innerHTML = '';
  for (let i = 0; i < reps; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    el.dotGrid.appendChild(dot);
  }
  el.dotGrid.setAttribute('aria-valuemax', String(reps));
  el.dotGrid.setAttribute('aria-valuenow', '0');
}

function updateDotGrid(completedReps, currentRep = -1) {
  if (!el.dotGrid) return;
  const dots = el.dotGrid.querySelectorAll('.dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('dot--done', i < completedReps);
    dot.classList.toggle('dot--current', i === currentRep);
  });
  el.dotGrid.setAttribute('aria-valuenow', String(completedReps));
}

function updateRepPaceHint() {
  if (!el.repPaceHint) return;
  const time = Number(el.time.value);
  const reps = Number(el.reps.value);
  if (time > 0 && reps > 0 && Number.isFinite(time) && Number.isInteger(reps)) {
    const secsPerRep = Math.round((time * 60) / reps);
    el.repPaceHint.textContent = `~${secsPerRep} sec per rep`;
  } else {
    el.repPaceHint.textContent = '';
  }
}

function setMessage(text) {
  el.message.textContent = text;
}

function clearActiveTimers() {
  if (state.activeTimeout) {
    clearTimeout(state.activeTimeout);
    state.activeTimeout = null;
  }

  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function clearAllDelayedUi() {
  if (state.confettiCleanupTimeout) {
    clearTimeout(state.confettiCleanupTimeout);
    state.confettiCleanupTimeout = null;
  }
}

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

function setButtonState(mode) {
  if (mode === "idle") {
    el.startBtn.style.display = "block";
    el.pauseBtn.style.display = "none";
    el.resetBtn.style.display = "none";
    el.resetBtn.textContent = 'RESET';
    el.pauseBtn.textContent = "Pause";
    return;
  }

  if (mode === "running") {
    el.startBtn.style.display = "none";
    el.pauseBtn.style.display = "block";
    el.resetBtn.style.display = "block";
    el.pauseBtn.textContent = state.paused ? "Continue" : "Pause";
    return;
  }

  if (mode === "finished") {
    el.startBtn.style.display = "none";
    el.pauseBtn.style.display = "none";
    el.resetBtn.style.display = "block";
    el.resetBtn.textContent = 'NEW WORKOUT';
    el.pauseBtn.textContent = "Pause";
    return;
  }
}

function renderActivePhase() {
  if (state.currentPhase === 'idle' || state.currentPhase === 'finished') return;

  const remainingMs = state.paused
    ? state.phaseRemainingMs
    : Math.max(0, state.phaseEndsAt - Date.now());

  if (state.currentPhase === 'prep') {
    el.status.textContent = state.paused ? '⏸ PAUSED' : 'GET READY IN';
    el.bigTimer.textContent = formatClock(remainingMs);
    el.bigTimer.className = 'prep';
    if (el.workoutTimer) {
      el.workoutTimer.textContent = formatClock(state.totalWorkoutMs);
      el.workoutTimer.className = 'dimmed';
    }
    el.repCount.textContent = `0 of ${state.reps}`;
    if (el.dotGridCount) el.dotGridCount.textContent = `0 / ${state.reps}`;
    return;
  }

  if (state.currentPhase === 'rep') {
    // Total remaining = remaining reps after this one × interval + current rep remaining
    const repsAfterThis = state.reps - state.currentRep - 1;
    const workoutRemainingMs = Math.max(0, repsAfterThis * state.intervalSeconds * 1000 + remainingMs);

    const isLastRep = (state.currentRep === state.reps - 1);
    el.status.textContent = state.paused ? '⏸ PAUSED' : (isLastRep ? 'LAST REP' : 'NEXT REP IN');
    el.bigTimer.textContent = formatClock(remainingMs);
    el.bigTimer.className = '';
    if (el.workoutTimer) {
      el.workoutTimer.textContent = formatClock(workoutRemainingMs);
      el.workoutTimer.className = '';
    }
    el.repCount.textContent = `Rep ${state.currentRep + 1} of ${state.reps}`;
    if (el.dotGridCount) el.dotGridCount.textContent = `${state.currentRep + 1} / ${state.reps}`;
    updateDotGrid(state.currentRep, state.currentRep);
  }
}

function runPhaseCompletion(runId) {
  // Ignore stale callbacks from prior sessions.
  if (runId !== state.runId) return;

  clearActiveTimers();

  if (state.currentPhase === "prep") {
    beep();
    state.currentPhase = "rep";
    state.phaseRemainingMs = state.intervalSeconds * 1000;
    setMessage("Go!");
    startCurrentPhase(runId);
    return;
  }

  if (state.currentPhase === "rep") {
    state.currentRep += 1;

    if (state.currentRep >= state.reps) {
      finishWorkout(runId);
      return;
    }

    beep();
    updateProgress();

    state.phaseRemainingMs = state.intervalSeconds * 1000;
    startCurrentPhase(runId);
  }
}

function startCurrentPhase(runId) {
  const durationMs = Math.max(0, state.phaseRemainingMs);
  state.phaseEndsAt = Date.now() + durationMs;
  state.paused = false;

  setButtonState("running");
  renderActivePhase();

  state.activeTimeout = setTimeout(() => {
    runPhaseCompletion(runId);
  }, durationMs);

  state.countdownInterval = setInterval(() => {
    // Countdown interval is short-lived and only valid for current run.
    if (runId !== state.runId) return;
    renderActivePhase();
  }, COUNTDOWN_TICK_MS);
}

function finishWorkout(runId) {
  if (runId !== state.runId) return;

  clearActiveTimers();
  state.currentPhase = "finished";
  state.phaseRemainingMs = 0;
  state.paused = false;
  state.currentRep = state.reps;

  if (state.workoutType) {
    const now = new Date();
    saveEntry({
      id: String(now.getTime()),
      type: state.workoutType,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      minutes: parseFloat(((state.reps * state.intervalSeconds) / 60).toFixed(1)),
      reps: state.reps,
      completedAt: now.toISOString(),
    });
  }

  el.status.textContent = 'WELL DONE';
  if (el.workoutTimer) {
    el.workoutTimer.textContent = 'DONE';
    el.workoutTimer.className = '';
  }
  if (el.topPanelLabel) el.topPanelLabel.textContent = 'WORKOUT';
  el.bigTimer.textContent = `${state.reps}`;
  el.bigTimer.className = 'done';
  const totalMinutes = parseFloat(((state.reps * state.intervalSeconds) / 60).toFixed(1));
  el.repCount.textContent = `reps · ${totalMinutes} min`;
  if (el.dotGridCount) el.dotGridCount.textContent = `${state.reps} / ${state.reps}`;
  setMessage('Proud of you!');
  updateDotGrid(state.reps); // fill all dots

  playFinishTune();
  setButtonState("finished");

  setTimeout(() => {
    if (runId !== state.runId) return;
    launchConfetti(runId);
  }, 1000);

  renderHistory();
}

function validateInputs() {
  if (!state.workoutType) {
    return { ok: false, message: 'Select a workout type (6-Count or Navy Seals) before starting.' };
  }

  const time = Number(el.time.value);
  const nextReps = Number(el.reps.value);

  const isValidTime = Number.isFinite(time) && time > 0;
  const isValidReps = Number.isInteger(nextReps) && nextReps > 0;

  if (!isValidTime || !isValidReps) {
    return {
      ok: false,
      message: "Enter a positive time and a whole-number rep count.",
    };
  }

  // Guard against impossible/meaningless per-rep timing.
  const intervalSeconds = (time * 60) / nextReps;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return { ok: false, message: "Time per rep must be greater than zero." };
  }

  return { ok: true, time, reps: nextReps, intervalSeconds };
}

function primeClapAudio() {
  getAudioContext(); // warm up audio context on user interaction
}

function startTimer() {
  if (state.currentPhase !== "idle") return;

  const validation = validateInputs();
  if (!validation.ok) {
    if (el.validationError) el.validationError.textContent = validation.message;
    return;
  }
  if (el.validationError) el.validationError.textContent = '';

  state.runId += 1;
  const runId = state.runId;

  state.reps = validation.reps;
  state.intervalSeconds = validation.intervalSeconds;
  state.currentRep = 0;
  state.currentPhase = "prep";
  state.phaseRemainingMs = PREP_SECONDS * 1000;
  state.paused = false;
  state.totalWorkoutMs = state.reps * state.intervalSeconds * 1000;

  // Switch screens
  if (el.setupScreen) el.setupScreen.hidden = true;
  if (el.activeScreen) el.activeScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Build dot grid
  buildDotGrid(state.reps);

  setWorkoutTypeBadge(state.workoutType);

  primeClapAudio();
  updateProgress();
  startCurrentPhase(runId);
}

function pauseTimer() {
  if (state.currentPhase !== "prep" && state.currentPhase !== "rep") return;

  if (!state.paused) {
    state.phaseRemainingMs = Math.max(0, state.phaseEndsAt - Date.now());
    state.paused = true;
    clearActiveTimers();
    renderActivePhase();
    el.pauseBtn.textContent = "Continue";
    return;
  }

  state.paused = false;
  el.pauseBtn.textContent = "Pause";
  startCurrentPhase(state.runId);
}

function resetTimer() {
  state.runId += 1; // invalidates old async callbacks immediately

  clearActiveTimers();
  clearAllDelayedUi();

  state.currentPhase = "idle";
  state.phaseRemainingMs = 0;
  state.phaseEndsAt = 0;
  state.paused = false;
  state.currentRep = 0;
  state.reps = 0;
  state.intervalSeconds = 0;

  // Cancel/clear any celebration artifacts.
  if (el.confettiContainer) {
    el.confettiContainer.innerHTML = "";
  }


  updateProgress();

  // Switch back to setup screen
  if (el.activeScreen) el.activeScreen.hidden = true;
  if (el.setupScreen) el.setupScreen.hidden = false;
  if (el.topPanelLabel) el.topPanelLabel.textContent = 'TOTAL REMAINING';

  // Clear dot grid
  if (el.dotGrid) el.dotGrid.innerHTML = '';

  // Restore workout-timer display
  if (el.workoutTimer) {
    el.workoutTimer.textContent = '—';
    el.workoutTimer.className = 'dimmed';
  }

  el.status.textContent = "Ready";
  setMessage("REP TIMER");
  el.repCount.textContent = "";
  if (el.dotGridCount) el.dotGridCount.textContent = "";
  el.bigTimer.textContent = "Ready";

  setWorkoutTypeBadge(null);

  setButtonState("idle");
}

function launchConfetti(runId) {
  if (runId !== state.runId) return;

  const container = el.confettiContainer;
  container.innerHTML = "";

  const colors = ["#f39c12", "#e74c3c", "#9b59b6", "#1abc9c", "#3498db"];
  for (let i = 0; i < 100; i += 1) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}vw`;
    confetti.style.animationDuration = `${2 + Math.random() * 3}s`;
    confetti.style.animationDelay = `${Math.random()}s`;
    container.appendChild(confetti);
  }

  if (state.confettiCleanupTimeout) {
    clearTimeout(state.confettiCleanupTimeout);
  }

  state.confettiCleanupTimeout = setTimeout(() => {
    if (runId !== state.runId) return;
    container.innerHTML = "";
    state.confettiCleanupTimeout = null;
  }, 5000);
}

// Keep compatibility with existing inline onclick handlers in index.html.
window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resetTimer = resetTimer;

wireAccessibility();
resetTimer();

if (el.time)  el.time.addEventListener('input', updateRepPaceHint);
if (el.reps)  el.reps.addEventListener('input', updateRepPaceHint);
updateRepPaceHint();

renderHistory();
