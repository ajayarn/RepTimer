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
const MESSAGE_FADE_MS = 400;

const motivationEarly = [
  "Every great session starts with one rep.",
  "You're already ahead of everyone on the couch.",
  "Start strong!",
  "You showed up. That's step one.",
  "Keep moving.",
  "Let's set the tone right now.",
  "Consistency. That's powerful.",
  "You've started - now let's roll!",
];

const motivationMid = [
  "You're in the zone now. Stay there.",
  "Push. Breathe. Repeat.",
  "Each rep is a step toward stronger you.",
  "No one else can do this for you.",
  "You're not tired, you're transforming.",
  "This is your turning point.",
  "You're halfway to proud.",
  "Dig deep. Show up for yourself.",
  "Power comes from persistence.",
];

const motivationFinal = [
  "You're almost there - don't slow down now!",
  "Last stretch - leave it all out here!",
  "Champions are built in the final reps.",
  "Crush the finish - you deserve the pride.",
  "You've come this far. Now dominate!",
  "Finish strong. Future you is watching.",
  "Every second counts - let's go!",
  "This is where growth lives.",
  "You're a machine. Bring it home!",
];

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
  inputBox: document.getElementById("input-box"),

  wt6Count:     document.getElementById('wt-6count'),
  wtNavySeals:  document.getElementById('wt-navyseals'),

  startBtn: document.getElementById("start-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resetBtn: document.getElementById("reset-btn"),

  status: document.getElementById("status"),
  message: document.getElementById("message"),
  repCount: document.getElementById("rep-count"),
  repTimer: document.getElementById("rep-timer"),
  bigTimer: document.getElementById("big-timer"),

  progressBar: document.getElementById("progressBar"),
  confettiContainer: document.getElementById("confetti-container"),

  clapSound: document.getElementById("clapSound"),

  historyToggleBtn:   document.getElementById('history-toggle-btn'),
  historyPanel:       document.getElementById('history-panel'),
  historyChartCanvas: document.getElementById('history-chart'),
  historyLog:         document.getElementById('history-log'),

  workoutTypeBadge: document.getElementById('workout-type-badge'),
};

const state = {
  activeTimeout: null,
  countdownInterval: null,
  messageTimeout: null,
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

  const last = getLastEntryForType(type);
  if (last) {
    el.reps.value = last.reps;
  }
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

function formatClock(totalMs) {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateProgress() {
  const rawPercent = state.reps > 0 ? (state.currentRep / state.reps) * 100 : 0;
  const percent = Math.max(0, Math.min(100, rawPercent));

  el.progressBar.style.width = `${percent}%`;
  el.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));

  if (percent < 33) {
    el.progressBar.style.backgroundColor = "green";
  } else if (percent < 66) {
    el.progressBar.style.backgroundColor = "orange";
  } else {
    el.progressBar.style.backgroundColor = "red";
  }
}

function setMessage(text, { fade = false, runId = state.runId } = {}) {
  if (!fade) {
    el.message.textContent = text;
    return;
  }

  if (state.messageTimeout) {
    clearTimeout(state.messageTimeout);
    state.messageTimeout = null;
  }

  el.message.style.opacity = "0";
  state.messageTimeout = setTimeout(() => {
    // Ignore stale async updates from old runs.
    if (runId !== state.runId) return;
    el.message.textContent = text;
    el.message.style.opacity = "1";
    state.messageTimeout = null;
  }, MESSAGE_FADE_MS);
}

function showMotivation(runId) {
  const progress = state.reps > 0 ? state.currentRep / state.reps : 0;
  let msgPool = motivationFinal;

  if (progress < 0.33) msgPool = motivationEarly;
  else if (progress < 0.66) msgPool = motivationMid;

  const msg = msgPool[Math.floor(Math.random() * msgPool.length)];
  setMessage(msg, { fade: true, runId });
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
  if (state.messageTimeout) {
    clearTimeout(state.messageTimeout);
    state.messageTimeout = null;
  }

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
    el.pauseBtn.textContent = "Pause";
  }
}

function renderActivePhase() {
  if (state.currentPhase === "idle" || state.currentPhase === "finished")
    return;

  const remainingMs = state.paused
    ? state.phaseRemainingMs
    : Math.max(0, state.phaseEndsAt - Date.now());

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (state.currentPhase === "prep") {
    el.status.textContent = state.paused ? "⏸" : `⏳ ${remainingSeconds}`;
    el.bigTimer.textContent = formatClock(remainingMs);
    el.repCount.textContent = `0 of ${state.reps}`;
    el.repTimer.textContent = "Get ready";
    return;
  }

  if (state.currentPhase === "rep") {
    el.status.textContent = state.paused ? "⏸" : `${state.currentRep + 1}`;
    el.bigTimer.textContent = formatClock(remainingMs);
    el.repCount.textContent = `${state.currentRep + 1} of ${state.reps}`;
    el.repTimer.textContent = `Next rep in ${formatClock(remainingMs)}`;
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
    showMotivation(runId);
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

  updateProgress();

  el.status.textContent = "Well Done!";
  setMessage("Proud of you!");
  el.repCount.textContent = `You did ${state.reps} reps`;
  el.repTimer.textContent = "";
  el.bigTimer.textContent = "DONE";

  el.clapSound.play().catch((err) => {
    console.warn("Clap sound blocked or failed:", err);
  });

  beep();
  setButtonState("finished");

  setTimeout(() => {
    if (runId !== state.runId) return;
    launchConfetti(runId);
  }, 1000);

  if (el.historyPanel && !el.historyPanel.hasAttribute('hidden')) renderHistory();
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
  getAudioContext();

  // Prime only once per fresh media element state.
  if (el.clapSound.paused && el.clapSound.currentTime === 0) {
    el.clapSound.volume = 0;
    el.clapSound
      .play()
      .then(() => {
        el.clapSound.pause();
        el.clapSound.currentTime = 0;
        el.clapSound.volume = 1;
      })
      .catch((err) => {
        // Not fatal; playback may still work later on user action.
        console.warn("Clap sound priming failed:", err);
      });
  }
}

function startTimer() {
  if (state.currentPhase !== "idle") return;

  const validation = validateInputs();
  if (!validation.ok) {
    alert(validation.message);
    return;
  }

  state.runId += 1;
  const runId = state.runId;

  state.reps = validation.reps;
  state.intervalSeconds = validation.intervalSeconds;
  state.currentRep = 0;
  state.currentPhase = "prep";
  state.phaseRemainingMs = PREP_SECONDS * 1000;
  state.paused = false;

  el.inputBox.style.display = "none";
  setWorkoutTypeBadge(state.workoutType);
  el.bigTimer.style.display = "block";

  setMessage("REP TIMER");
  el.repCount.textContent = `0 of ${state.reps}`;
  el.repTimer.textContent = "Get ready";

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

  // Reset clap sound state if available.
  if (el.clapSound) {
    try {
      el.clapSound.pause();
      el.clapSound.currentTime = 0;
      el.clapSound.volume = 1;
    } catch (_) {
      // no-op
    }
  }

  updateProgress();

  el.status.textContent = "Ready";
  setMessage("REP TIMER");
  el.repCount.textContent = "";
  el.repTimer.textContent = "";
  el.bigTimer.textContent = "Ready";

  el.inputBox.style.display = "block";
  setWorkoutTypeBadge(null);
  el.bigTimer.style.display = "none";

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
