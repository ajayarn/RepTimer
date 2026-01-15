let timer = null;
let interval = 0;
let reps = 0;
let currentRep = 0;
let paused = false;
let prepCountdown = 5;
let prepTimer = null;
let countdownInterval = null;

const motivationEarly = [ /* <33% */ 
  "Every great session starts with one rep.",
  "You're already ahead of everyone on the couch.",
  "Start strong!",
  "You showed up. That’s step one.",
  "Keep moving.",
  "Let’s set the tone right now.",
  "Consistency. That’s powerful.",
  "You've started — now let’s roll!",
];

const motivationMid = [ /* 33–66% */
  "You’re in the zone now. Stay there.",
  "Push. Breathe. Repeat.",
  "Each rep is a step toward stronger you.",
  "No one else can do this for you.",
  "You’re not tired, you’re transforming.",
  "This is your turning point.",
  "You’re halfway to proud.",
  "Dig deep. Show up for yourself.",
  "Power comes from persistence."
];

const motivationFinal = [ /* >66% */
  "You’re almost there — don’t slow down now!",
  "Last stretch — leave it all out here!",
  "Champions are built in the final reps.",
  "Crush the finish — you deserve the pride.",
  "You’ve come this far. Now dominate!",
  "Finish strong. Future you is watching.",
  "Every second counts — let’s go!",
  "This is where growth lives.",
  "You’re a machine. Bring it home!"
];




function beep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1000, ctx.currentTime);
    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
}


function showMotivation() {
  const progress = currentRep / reps;
  let msgPool;

  if (progress < 0.33) {
    msgPool = motivationEarly;
  } else if (progress < 0.66) {
    msgPool = motivationMid;
  } else {
    msgPool = motivationFinal;
  }

  const msg = msgPool[Math.floor(Math.random() * msgPool.length)];
  document.getElementById("status").textContent = `${currentRep+1}`;

  const msgEl = document.getElementById("message");
  msgEl.style.opacity = 0;
  setTimeout(() => {
    msgEl.textContent = msg;
    msgEl.style.opacity = 1;
  }, 400); // Small delay to apply fade-out before content change
}

function updateProgress() {
    const percent = (currentRep / reps) * 100;
    const bar = document.getElementById("progressBar");
    bar.style.width = `${percent}%`;

    if (percent < 33) bar.style.backgroundColor = "green";
    else if (percent < 66) bar.style.backgroundColor = "orange";
    else bar.style.backgroundColor = "red";
}

function startTimer() {
    document.getElementById("start-btn").style.display = "none";
    document.getElementById("pause-btn").style.display = "block";
    document.getElementById("reset-btn").style.display = "block";

    if (timer || prepTimer) return;

    // Hide input box
    document.getElementById("input-box").style.display = "none";

    // Show the timer container
    document.getElementById("big-timer").style.display = "block";
    
    // Prime clapping sound on first interaction
    const clapSound = document.getElementById("clapSound");
    if (clapSound.paused && clapSound.currentTime === 0) {
        clapSound.volume = 0;
        clapSound.play().then(() => {
            clapSound.pause();
            clapSound.currentTime = 0;
            clapSound.volume = 1;
        }).catch(err => {
            console.warn("Clap sound priming failed:", err);
        });
    }

    const time = parseFloat(document.getElementById("time").value);
    reps = parseInt(document.getElementById("reps").value);
    if (time <= 0 || reps <= 0) {
    alert("Enter positive values.");
    return;
    }

    interval = (time * 60) / reps;
    currentRep = 0;
    paused = false;
    prepCountdown = 10;
    updateProgress();

    prepTimer = setInterval(() => {
    if (paused) return;
    if (prepCountdown <= 1) {
        clearInterval(prepTimer);
        prepTimer = null;
        beep(); // signal start
        document.getElementById("status").textContent = `${currentRep+1} `;
        document.getElementById("rep-count").textContent = `of ${reps}`;
        document.getElementById("big-timer").textContent = "GO!";
        startReps();
    } else {
        prepCountdown--;
        document.getElementById("status").textContent = `⏳ ${prepCountdown}`;
    }
    }, 1000);
}

function startReps() {
    // Initial Countdown for first rep
    startCountdown(interval);

    timer = setInterval(() => {
      if (paused) return;
      currentRep++;
      if (currentRep >= reps) {
          clearInterval(timer);
          clearInterval(countdownInterval);
          timer = null;
          document.getElementById("status").textContent = "Well Done!";
          document.getElementById("message").textContent = `Proud of you!`;
          document.getElementById("rep-count").textContent = `You did ${reps} reps`;
          document.getElementById("clapSound").play().catch(err => {
              console.warn("Clap sound blocked or failed:", err);
          });
          document.getElementById("big-timer").textContent = "DONE";
          beep();
          updateProgress();
          setTimeout(() => {
          launchConfetti();
          }, 1000);
          return
      } 
      
      beep();
      showMotivation();
      updateProgress();

      // Start countdown for next rep
      startCountdown(interval);

    }, interval * 1000);
}

function startCountdown(duration) {
    let secondsLeft = Math.ceil(duration);
    document.getElementById("big-timer").textContent = secondsLeft;
    
    // Clear existing to prevent overlap
    if(countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        if(paused) return;
        secondsLeft--;
        if (secondsLeft >= 0) {
           document.getElementById("big-timer").textContent = secondsLeft;
        } else {
           // Interval finished, main timer will trigger
           clearInterval(countdownInterval);
        }
    }, 1000);
}

function pauseTimer() {
    paused = !paused;
    document.getElementById("status").textContent = paused
    ? "⏸️"
    : prepTimer
    ? `⏳ ${prepCountdown}`
    : `${currentRep+1}`;

    document.getElementById("pause-btn").textContent = paused ? "Continue" : "Pause"
    document.getElementById("rep-count").textContent = paused ? `${currentRep + 1} of ${reps}` : `of ${reps}`
}

function resetTimer() {
    clearInterval(timer);
    clearInterval(prepTimer);
    clearInterval(countdownInterval);
    timer = null;
    prepTimer = null;
    countdownInterval = null;
    paused = false;
    currentRep = 0;
    prepCountdown = 5;
    updateProgress();
    document.getElementById("status").textContent = "Ready";
    document.getElementById("message").textContent = "REP TIMER";
    document.getElementById("rep-count").textContent = ``;
    document.getElementById("big-timer").textContent = "Ready";
    document.getElementById("input-box").style.display = "block";
    document.getElementById("big-timer").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
    document.getElementById("pause-btn").style.display = "none";
    document.getElementById("reset-btn").style.display = "none";

}

resetTimer();
function launchConfetti() {
    const container = document.getElementById("confetti-container");
    container.innerHTML = ""; // clear if rerunning

    const colors = ["#f39c12", "#e74c3c", "#9b59b6", "#1abc9c", "#3498db"];
    for (let i = 0; i < 100; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + "vw";
    confetti.style.animationDuration = (2 + Math.random() * 3) + "s";
    confetti.style.animationDelay = Math.random() + "s";
    container.appendChild(confetti);
    }

    // Remove after 5 seconds
    setTimeout(() => {
    container.innerHTML = "";
    }, 5000);
}