# RepTimer

A simple, motivating rep-based workout timer built with vanilla HTML, CSS, and JavaScript.

RepTimer helps you complete a target number of reps over a fixed workout duration, with:

- a prep countdown,
- per-rep pacing,
- progress tracking,
- motivational messages,
- sound cues,
- and celebration confetti at the finish.

---

## Features

- **Time + reps input**
  - Set total workout minutes and target rep count.
- **Automatic pacing**
  - Calculates interval time per rep:  
    `intervalSeconds = (totalMinutes * 60) / reps`
- **Prep phase**
  - 10-second ready countdown before first rep.
- **Live workout UI**
  - Large countdown timer
  - Current rep display (`x of y`)
  - “Next rep in” time
- **Controls**
  - Start, Pause/Continue, Reset
- **Progress bar**
  - Fills as reps complete and changes color by progress stage.
- **Motivation messages**
  - Random messages based on early/mid/final workout progress.
- **Audio feedback**
  - Beep cue per interval
  - Clap sound at workout completion
- **Finish effects**
  - Completion message and confetti animation.

---

## Project Structure

- `index.html` — app layout and UI elements
- `style.css` — responsive styling
- `app.js` — timer logic and state management
- `timersounds/` — audio assets (e.g., clapping)
- `timergifs/` — optional visual assets

---

## Getting Started

No build tools or dependencies are required.

1. Clone or download this repository.
2. Open `index.html` in your browser.
3. Enter:
   - **Mins** (total session duration)
   - **Reps** (target number of reps)
4. Click **Start**.

---

## How It Works

1. You provide workout duration and reps.
2. App computes rep interval.
3. A 10-second prep phase runs.
4. The app advances rep-by-rep on each interval.
5. Progress and messaging update during the session.
6. On final rep, app shows completion state with sound + confetti.

---

## Controls

- **Start**: begins a new workout (from idle state only)
- **Pause**: pauses current phase and preserves remaining time
- **Continue**: resumes from paused state
- **Reset**: returns app to idle/default UI

---

## Input Rules

- Minutes must be a positive number.
- Reps must be a positive whole number.
- Invalid values will prompt an alert.

---

## Browser Notes

- Modern browsers supported.
- Audio playback may require user interaction before sounds can play (browser autoplay policies).

---

## Customization Tips

You can easily tweak:

- **Prep duration** in `app.js` (`PREP_SECONDS`)
- **Tick refresh rate** in `app.js` (`COUNTDOWN_TICK_MS`)
- **Motivational text pools** in `app.js`
- **Theme and typography** in `style.css`
- **Button colors and progress styles** in `style.css`

---

## Known Limitations

- No persistence of settings between page reloads.
- No keyboard shortcuts.
- No dedicated accessibility labels/live region tuning yet.
- No test suite currently included.

---

## Roadmap Ideas

- Save last used settings in local storage
- Add keyboard controls and better accessibility semantics
- Add interval presets (e.g., EMOM, Tabata-like modes)
- Add optional vibration/mobile haptics
- Add session history and stats

---

## License

See `LICENSE` for details.