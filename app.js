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
  ringProgress:  document.getElementById('ring-progress'),
  ringCenter:    document.getElementById('ring-center'),
  statRepsDone:  document.getElementById('stat-reps-done'),
  themeToggle:   document.getElementById('theme-toggle'),
  repPaceHint:   document.getElementById('rep-pace-hint'),
  topPanelLabel:    document.getElementById('top-panel-label'),
  validationError:  document.getElementById('validation-error'),
};

const ringCircumference = el.ringProgress
  ? 2 * Math.PI * el.ringProgress.r.baseVal.value
  : 0;

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

  const isLight = currentTheme() === 'light';
  const tickColor = isLight ? '#4a5064' : '#f0f0f0';
  const gridColor = isLight ? '#c7cbd6' : '#333';

  const rootStyle = getComputedStyle(document.documentElement);
  const accentColor = rootStyle.getPropertyValue('--accent').trim();
  const blueColor = rootStyle.getPropertyValue('--blue').trim();

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
          borderColor: accentColor,
          backgroundColor: hexToRgba(accentColor, 0.15),
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
          borderColor: blueColor,
          backgroundColor: hexToRgba(blueColor, 0.15),
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
          ticks: { color: tickColor, maxRotation: 45, font: { family: 'Oswald' } },
          grid: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { color: tickColor, font: { family: 'Oswald' } },
          grid: { color: gridColor },
          title: { display: true, text: 'Reps', color: tickColor },
        },
      },
      plugins: {
        legend: { labels: { color: tickColor, font: { family: 'Oswald' } } },
      },
    },
  });
}

function renderHistory() {
  const log = loadLog();
  renderHistoryChart(log);
  renderHistoryLog(log);
}


const beepSound = new Audio('timersounds/timer_beep.mp3');
const missionCompleteSound = new Audio('timersounds/mission_complete.mp3');

function playSound(audio) {
  audio.currentTime = 0;
  audio.play().catch((err) => {
    console.warn('Audio playback failed:', err);
  });
}

function beep() {
  playSound(beepSound);
}

function playMissionComplete() {
  playSound(missionCompleteSound);
}

function formatClock(totalMs) {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initRing() {
  if (!el.ringProgress) return;
  el.ringProgress.style.strokeDasharray = String(ringCircumference);
  el.ringProgress.style.strokeDashoffset = '0';
}

function setRingProgress(fraction) {
  if (!el.ringProgress || !ringCircumference) return;
  const clamped = Math.max(0, Math.min(1, fraction));
  el.ringProgress.style.strokeDashoffset = String(ringCircumference * (1 - clamped));
  if (el.ringCenter) el.ringCenter.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
}

const THEME_KEY = window.REPTIMER_THEME_KEY || 'reptimer_theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function syncThemeToggleButton() {
  if (!el.themeToggle) return;
  const theme = currentTheme();
  el.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  el.themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
}

function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  if (next === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) {
    // Storage unavailable — theme just won't persist across reloads.
  }
  syncThemeToggleButton();
  renderHistory();
}

window.toggleTheme = toggleTheme;

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
    el.bigTimer.className = '';
    if (el.workoutTimer) {
      el.workoutTimer.textContent = formatClock(state.totalWorkoutMs);
      el.workoutTimer.className = 'stat-value dimmed';
    }
    el.repCount.textContent = `0 of ${state.reps}`;
    if (el.statRepsDone) el.statRepsDone.textContent = `0/${state.reps}`;
    setRingProgress(remainingMs / (PREP_SECONDS * 1000));
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
      el.workoutTimer.className = 'stat-value';
    }
    el.repCount.textContent = `Rep ${state.currentRep + 1} of ${state.reps}`;
    if (el.statRepsDone) el.statRepsDone.textContent = `${state.currentRep}/${state.reps}`;
    setRingProgress(remainingMs / (state.intervalSeconds * 1000));
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
    el.workoutTimer.className = 'stat-value';
  }
  if (el.topPanelLabel) el.topPanelLabel.textContent = 'WORKOUT';
  el.bigTimer.textContent = `${state.reps}`;
  el.bigTimer.className = 'done';
  const totalMinutes = parseFloat(((state.reps * state.intervalSeconds) / 60).toFixed(1));
  if (el.statRepsDone) el.statRepsDone.textContent = `${state.reps}/${state.reps}`;
  setMessage(`Proud of you! · ${totalMinutes} min`);
  setRingProgress(1);

  playMissionComplete();
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

function primeAudioPlayback() {
  // Unlock playback on user interaction so later programmatic .play() calls
  // (from setTimeout callbacks, with no direct user gesture) aren't blocked.
  [beepSound, missionCompleteSound].forEach((audio) => {
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {});
  });
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

  setWorkoutTypeBadge(state.workoutType);

  primeAudioPlayback();
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

  setRingProgress(1);

  // Switch back to setup screen
  if (el.activeScreen) el.activeScreen.hidden = true;
  if (el.setupScreen) el.setupScreen.hidden = false;
  if (el.topPanelLabel) el.topPanelLabel.textContent = 'REMAINING';

  // Restore workout-timer display
  if (el.workoutTimer) {
    el.workoutTimer.textContent = '—';
    el.workoutTimer.className = 'stat-value dimmed';
  }

  el.status.textContent = "Ready";
  setMessage("REP TIMER");
  el.repCount.textContent = "";
  if (el.statRepsDone) el.statRepsDone.textContent = "";
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
initRing();
syncThemeToggleButton();
resetTimer();

if (el.time)  el.time.addEventListener('input', updateRepPaceHint);
if (el.reps)  el.reps.addEventListener('input', updateRepPaceHint);
updateRepPaceHint();

renderHistory();
