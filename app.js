let timer = null;
let interval = 0;
let reps = 0;
let currentRep = 0;
let paused = false;
let prepCountdown = 5;
let prepTimer = null;

const earlyMessages = [
    "You got this! 💪",
    "Just getting warmed up!",
    "Looking sharp!",
    "Keep going, you're looking great!",
    "Push through! 🚀"
];

const lateMessages = [
    "Almost there! 🔥",
    "Finish strong! 💯",
    "Your future self is cheering!",
    "Just one more rep!",
    "You beast! 🐅"
];


const readyGif = "timergifs/ready.gif";

const runningGif = "timergifs/running.gif";

const clappingGif = "timergifs/clapping.gif";

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
    
    const msgPool = currentRep > reps / 2 ? lateMessages : earlyMessages;
    const msg = msgPool[Math.floor(Math.random() * msgPool.length)];

    document.getElementById("message").textContent = msg;
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
    if (timer || prepTimer) return;

    const time = parseFloat(document.getElementById("time").value);
    reps = parseInt(document.getElementById("reps").value);
    if (time <= 0 || reps <= 0) {
    alert("Enter positive values.");
    return;
    }

    interval = (time * 60) / reps;
    currentRep = 0;
    paused = false;
    prepCountdown = 5;
    updateProgress();

    document.getElementById("status").textContent = `⏳ Starting in 5...`;

    prepTimer = setInterval(() => {
    if (paused) return;
    if (prepCountdown <= 1) {
        clearInterval(prepTimer);
        prepTimer = null;
        beep(); // signal start
        document.getElementById("status").textContent = `💪 Let's go! Rep ${currentRep+1}!`;
        document.getElementById("motivationGif").src = runningGif;
        startReps();
    } else {
        prepCountdown--;
        document.getElementById("status").textContent = `⏳ Starting in ${prepCountdown}...`;
    }
    }, 1000);
}

function startReps() {
    timer = setInterval(() => {
    if (paused) return;
    currentRep++;
        if (currentRep >= reps) {
        clearInterval(timer);
        timer = null;
        document.getElementById("status").textContent = "🎉 Workout Complete!";
        document.getElementById("clapSound").play();
        document.getElementById("motivationGif").src = clappingGif;
        beep();
        updateProgress();
        setTimeout(() => {
        launchConfetti();
        }, 1000);
    } else {
        beep();
        showMotivation();
        document.getElementById("status").textContent = `⏱️ Rep ${currentRep+1} of ${reps}`;
        updateProgress();
    }
    }, interval * 1000);
}

function pauseTimer() {
    paused = !paused;
    document.getElementById("status").textContent = paused
    ? "⏸️ Paused"
    : prepTimer
    ? `⏳ Resuming countdown: ${prepCountdown}`
    : `▶️ Resuming rep ${currentRep+1} of ${reps}`;
}

function resetTimer() {
    clearInterval(timer);
    clearInterval(prepTimer);
    timer = null;
    prepTimer = null;
    paused = false;
    currentRep = 0;
    prepCountdown = 5;
    updateProgress();
    document.getElementById("status").textContent = "🔁 Ready.";
    document.getElementById("message").textContent = "";
    document.getElementById("motivationGif").src = readyGif;
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