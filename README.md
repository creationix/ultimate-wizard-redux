# Runekeep

An original single-screen wizard puzzle platformer in the tradition of 1980s
home-computer games: ladders, ropes, keys, treasure and spell scrolls, drawn in
a 16-colour 8-bit palette and lit with modern glows and particles.

It is a plain static web app - no framework, no build step, no dependencies -
that runs on phones and desktops and installs as an offline app.

## Play

```sh
npm start          # serves the folder at http://127.0.0.1:8080
```

Or host the repository root on any static host. For GitHub Pages choose
**Settings → Pages → Deploy from a branch** with the `/ (root)` folder; there is nothing to build.

| | Keyboard | Touch |
|---|---|---|
| Move / climb | Arrows or WASD | D-pad |
| Jump (hold for higher) | Space, Z | Jump |
| Cast spell | X, Shift, Enter | Spell |
| Pause / restart | Esc / R | Pause button |

Gamepads work too. Take the key, reach the door; gems are optional. Ten
chambers are built in, and the **level editor** lets you paint your own, have
the solver prove they can be won, and share them as a link.

## How it is put together

| File | Role |
|---|---|
| `src/sim.js` | The whole game simulation. Pure, DOM-free, integer maths, fixed 60 Hz step - identical results everywhere. |
| `src/levels.js` | Built-in levels as ASCII maps (legend at the top of the file). |
| `src/solver.js` | A* search over the real simulation; produces frame-exact winning input recordings. |
| `src/solutions.js` | Generated: a verified winning run and a collect-everything run for each level. |
| `src/render.js`, `src/sprites.js` | Canvas renderer; all art is generated from pixel maps at load time. |
| `src/editor.js`, `src/solver-worker.js` | Level editor and its background "verify winnable" check. |
| `src/main.js`, `src/input.js`, `src/audio.js`, `src/store.js` | App shell, input, chip-style sound, saved progress. |
| `sw.js`, `manifest.webmanifest` | Offline cache and install metadata. |

## Testing

```sh
npm test           # physics, level winnability, PWA checks (about 3 seconds, no dependencies)
npm run test:e2e   # the real app in headless Chromium (needs Playwright)
```

- **Physics** - jump height, gaps, ledges, ladders, ropes, fall damage, every
  hazard, creature and spell, plus determinism and a fuzz test asserting the
  wizard never ends a frame inside stone.
- **Levels** - every level is validated, its stored solutions are replayed
  frame by frame (win, and win with every gem), and the solver must rediscover
  a route from scratch. Solutions are pinned to a hash of the level, so an
  edited level fails the suite until it has been re-proven.
- **PWA** - manifest and icon sanity, and that the service worker precaches
  every shipped file with no external requests.
- **Browser** - keyboard and touch play, phone portrait and landscape layout,
  the editor and solver, share links, and a full offline reload.

### Changing or adding a level

1. Edit `src/levels.js`.
2. `npm run solve` - re-solves changed levels and rewrites `src/solutions.js`.
   It exits non-zero if a level cannot be won.
3. `npm test`.

After changing files that ship to the browser, bump `CACHE` in `sw.js` if you
add or remove files (a test will tell you if the precache list is stale).

`npm run icons` regenerates the app icons from the wizard sprite.
