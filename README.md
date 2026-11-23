# TRAILFORGE — Off-road Engineering

A private-feeling, single-player off-road browser game built for phones first. It is a static site: no accounts, servers, in-game currency, ads, or purchases.

## Play

After GitHub Pages has deployed the repository, open:

`https://pages01.github.io/Off-road-game/`

If this is the first Pages deployment and the workflow reports that Pages is not enabled, open **Settings → Pages** for this repository and set **Build and deployment → Source** to **GitHub Actions**. Re-run the workflow afterward.

## Controls

- **Touch:** left/right steering, throttle, brake, reverse.
- **Keyboard:** WASD or arrow keys; hold **R** for reverse and **Shift** for handbrake.
- **Camera:** use the CAM button to toggle chase and cockpit views.
- **Garage:** tune the build, engine, suspension, and graphics.
- **Save build:** saves your settings in this browser on this device.

## What is in this first playable build

- Procedurally generated 3D Redwood Ridge terrain, looping dirt trail, trees, and rocks.
- A custom 3D 4×4 truck with paint, wheel, tire, mass, and gearing adjustments.
- A simplified real-time driving model with throttle, braking, reverse, steering, terrain-dependent grip, wheel rotation, and body pitch/roll.
- Engine lab with adjustable cylinder count, bore, stroke, compression, boost, cam profile, rev limiter, ECU tune, and a live estimated horsepower/torque dyno.
- Suspension tuning for ride height, travel, spring rate, compression/rebound damping, and anti-roll stiffness.
- Graphics controls for render scale, draw distance, shadows, foliage, filtering, and frame-rate target.
- Local build saving and a small service-worker shell cache.

## Important scope notes

This is a playable early prototype, not a finished commercial simulator. Vehicle dynamics and engine curves are game approximations; they are not suitable for real vehicle design or tuning. The first build has one truck and one environment. Procedural scene geometry keeps the download small, but it is not equivalent to a professionally art-directed, high-resolution asset library. Three.js is loaded from jsDelivr, so the first launch requires an internet connection even though the local application shell is cached.

## Technology

- HTML, CSS, JavaScript modules
- Three.js 0.174.0
- GitHub Pages + GitHub Actions
- Browser localStorage for local builds

No build step or package installation is required.