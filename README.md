# TRAILFORGE — Off-road Engineering

A private-feeling, single-player off-road browser game built for phones first. It is a static site: no accounts, servers, in-game currency, ads, or purchases.

## Play

After GitHub Pages has deployed the repository, open:

`https://pages01.github.io/Off-road-game/`

If this is the first Pages deployment and the workflow reports that Pages is not enabled, open **Settings → Pages** for this repository and set **Build and deployment → Source** to **GitHub Actions**. Re-run the workflow afterward.

## Controls

- **Touch:** left/right steering, throttle, brake, reverse, and e-brake.
- **Time Trial:** use START TIME TRIAL to run through four checkpoints and finish; your best time is saved locally.
- **Keyboard:** WASD or arrow keys; hold **R** for reverse and **Shift** for handbrake.
- **Camera:** use the CAM button to toggle chase and cockpit views.
- **Garage:** tune the build, engine, suspension, and graphics.
- **Save build:** saves your settings in this browser on this device.

## What is in this first playable build

- A real-world elevation-data terrain option using an AWS/Mapzen Terrarium DEM tile centred near Humboldt Redwoods, California. The tile is decoded into the Three.js terrain mesh; a generated fallback remains available when the elevation tile cannot be loaded.
- A custom in-game 3D 4×4 vehicle plus a separately labelled real Suzuki Jimny reference photograph in the garage. The photo is not presented as the live 3D vehicle.
- Tire width, tire radius, tire tread profile, 2WD/4WD/4LO, open/locked differential, vehicle mass, and final-drive gearing now feed into the driving model. Low range multiplies wheel torque and limits speed; tire type changes traction by surface; wheel dimensions and tread style update the wheel meshes.
- A simplified real-time driving model with throttle, braking, reverse, steering, terrain-dependent grip, wheel rotation, and body pitch/roll.
- Engine lab with adjustable cylinder count, bore, stroke, compression, boost, cam profile, rev limiter, ECU tune, and a live estimated horsepower/torque dyno.
- Suspension tuning for ride height, travel, spring rate, compression/rebound damping, and anti-roll stiffness.
- Graphics controls for render scale, draw distance, shadows, foliage, filtering, and frame-rate target.
- Local build saving, time-trial best-time saving, and a small service-worker shell cache.

## Important scope notes

This is a playable early prototype, not a finished commercial simulator. A timed checkpoint mode has been added, but the checkpoints and time-trial flow have not yet been play-tested in a live browser. Vehicle dynamics and engine curves are game approximations; they are not suitable for real vehicle design or tuning. The first build has one truck and one environment. Procedural scene geometry keeps the download small, but it is not equivalent to a professionally art-directed, high-resolution asset library. Three.js is loaded from jsDelivr, so the first launch requires an internet connection even though the local application shell is cached.

## External data and image credits

- **Terrain elevation:** AWS Open Data / Mapzen Terrarium elevation tiles. The game uses tile `15/5108/12373`, centred near Humboldt Redwoods, California. Terrarium elevation is decoded as `(R × 256 + G + B / 256) − 32768` metres, then vertically exaggerated for readability in the game. Terrain download is optional at runtime; if the tile or cross-origin image access fails, the local fallback terrain is used. The height tile is accessed from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
- **Garage reference photograph:** “Off Road vehicle.jpg” by Rudyasho, Wikimedia Commons, licensed CC BY 4.0. The garage credits the author and links to the image's license/source page. The photo depicts a real Suzuki Jimny Sierra; it is a reference photo, not the in-game 3D mesh.

## Technology

- HTML, CSS, JavaScript modules
- Three.js 0.174.0
- GitHub Pages + GitHub Actions
- Browser localStorage for local builds

No build step or package installation is required.