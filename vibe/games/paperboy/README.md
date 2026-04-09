# Paperboy (Browser Game)

A Paperboy-inspired arcade game built with vanilla HTML/CSS/JS and playable directly in the browser.

## Run

1. Open `/Users/amalialiogas/Documents/Games/paperboy/index.html` in a browser.
2. Or serve the folder locally for best results:
   - `python3 -m http.server 8080`
   - Visit `http://localhost:8080`

## Controls

- Move: `Arrow Left/Right` or `A/D`
- Throw paper: `Space` (auto), `Q` (left), `E` (right)
- Speed up / slow down: `W/S` or `Arrow Up/Down`
- Pause: `P`
- Restart after run: `R`

Mobile/touch controls are shown at the bottom on smaller screens.

## Sound

Sound effects are generated in-browser with the Web Audio API (throw, delivery, crash, pickup, win/lose cues). Click `Start Route` once to enable audio.
