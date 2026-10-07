# Leo Tracker · Orbital Watch

A browser-based 3D tracker for Earth-observation satellites in low Earth orbit, with live or simulated weather under each satellite, an imaging outlook for the next ground-station pass, and the design system it's built on.

Orbital Watch propagates satellite positions from two-line element sets (TLEs), draws them around a sunlit globe, and shows each satellite's telemetry, orbit path, ground track and sensor swath. It checks the cloud cover the sensor is looking at and predicts whether the next pass over a ground station will produce a usable scene. Everything runs client-side; there's no backend.

**Live demo:** `https://<your-username>.github.io/<repo-name>/`
**Design system:** `https://<your-username>.github.io/<repo-name>/design-system.html`

> Replace `<your-username>` and `<repo-name>` above once Pages is enabled.

---

## Features

- **3D globe** (three.js) with real sun lighting, a day/night terminator, an atmosphere rim and a star field
- **Mission clock** with **LIVE** and **SIM** modes. SIM runs an accelerated clock (1×, 60×, 300×, 1200×) with pause and jump-to-now, so you can watch passes and weather play out
- **Catalog** of 10 Earth-observation satellites, filterable by sensor type (optical, SAR, lidar), each showing cloud cover directly beneath it
- **Below tab**: cloud cover, air temperature, wind, precipitation, sun elevation and local solar time at the sub-satellite point, plus a 24-minute along-track cloud strip
- **Next pass tab**: AOS, LOS, max elevation and duration over the ground station (default Seattle), with an **imaging outlook** that combines the cloud forecast at AOS with sun angle and sensor type. SAR is all-weather; optical needs daylight and clear sky; lidar stops at cloud tops
- **Orbit tab**: inclination, period, apogee/perigee, eccentricity, RAAN, argument of perigee, mean anomaly, TLE epoch and age
- **Layers**: Blue Marble or yesterday's true-color mosaic from Terra MODIS, Suomi NPP VIIRS or NOAA-20 VIIRS (NASA GIBS); a weather overlay (GPM IMERG precipitation in LIVE, simulated clouds in SIM); day/night; sensor swath
- **2D ground track** with night shading and swath band, expandable in place
- **Conjunction alerts** for tracked pairs within 900 km
- **Update TLEs** pulls current elements from [CelesTrak](https://celestrak.org)

## Data sources

| Data | LIVE mode | SIM mode / fallback |
| --- | --- | --- |
| Clock | Real UTC | Accelerated clock |
| Weather under satellites, along-track strip | [Open-Meteo](https://open-meteo.com) current conditions (no key) | Procedural cloud model |
| Cloud forecast at AOS | Open-Meteo hourly forecast for the ground station | Procedural cloud model |
| Globe weather overlay | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) `IMERG_Precipitation_Rate` | Procedural cloud model, lit by the sun |
| Base imagery | NASA GIBS daily corrected-reflectance mosaics (yesterday, UTC) | same |
| Orbital elements | CelesTrak GP API on demand | bundled demo TLEs |

If a live source can't be reached, the app switches that piece to the model, shows a toast once, and marks the value as simulated (amber dot, `·sim` suffix). Switching SIM → LIVE retries the live sources.

The **procedural cloud model** is deterministic in time: value-noise fBm on a cylinder (so longitude wraps), advected eastward in the mid-latitudes and westward in the tropics, and biased by a cloud climatology (wet ITCZ, dry subtropics, cloudy storm tracks). The globe texture, the along-track strip and the AOS forecast all sample the same field, so they agree.

## Repository structure

```
.
├── index.html                  # The tracker prototype
├── design-system.html          # Token + component reference
├── assets/
│   ├── css/
│   │   ├── tokens.css          # GENERATED — do not edit
│   │   ├── orbital-watch.css   # Prototype styles (also used by the design-system specimens)
│   │   └── design-system.css   # Design-system page styles
│   ├── js/
│   │   ├── tokens.js           # GENERATED — do not edit
│   │   ├── orbital-watch.js    # Prototype logic (scene, propagation, weather, UI)
│   │   └── design-system.js    # Renders token tables from tokens.js
│   └── img/
│       └── earth_atmos_2048.jpg
├── tokens/
│   └── tokens.json             # Single source of truth for design tokens
├── scripts/
│   └── build-tokens.js         # tokens.json → tokens.css + tokens.js
├── .github/workflows/pages.yml # Build + deploy to GitHub Pages
├── package.json
└── .nojekyll
```

## Running locally

The pages are plain static files, but they **must be served over HTTP**. Opening `index.html` directly from disk (`file://`) blocks the globe texture via CORS.

```bash
# any of these, from the repo root
npm run serve                 # uses npx serve
python3 -m http.server 8000   # then open http://localhost:8000
```

No `npm install` is needed. Node is only used for the token build script, which has zero dependencies.

## Design tokens (v2)

All colors, type, spacing, radii, glass values, layout dimensions, z-layers and motion timings live in **`tokens/tokens.json`**. A build script turns that file into two generated outputs:

| Output | Used by | Contents |
| --- | --- | --- |
| `assets/css/tokens.css` | Both pages' stylesheets | `:root { --token-name: value; }` |
| `assets/js/tokens.js` | `orbital-watch.js` (three.js colors, cloud ramp), `design-system.js` (token tables) | `window.OW_TOKENS = { values, list }` |

### Color tiers

1. **`palette`** (`--p-*`): raw primitives such as `--p-signal`, `--p-flare`, `--p-ink-950`. Never used directly by components.
2. **Semantic** tokens alias into the palette:
   - `color` (no prefix): surfaces, lines, accents, text, e.g. `--accent-selected: var(--p-signal)`
   - `status` (`--status-ok | warn | alert | info`): state, kept separate from the accents
   - `wx` (`--wx-clear | partly | overcast | precip | night | sar`): the cloud-cover ramp and sensing colors

Change a palette value and every semantic token that points at it follows.

### Other groups

`font` (Plex Mono, Plex Sans, Plex Sans Condensed) · `fw` · `fs` · `tracking` · `space` (1–12) · `radius` · `glass` · `shadow` · `layout` · `z` · `motion`.

### Workflow

```bash
# 1. edit tokens/tokens.json
# 2. regenerate
npm run build:tokens
# 3. commit the JSON *and* the two generated files
```

`npm run check:tokens` exits non-zero if the generated files don't match the JSON, which is useful as a pre-commit hook. The deploy workflow also rebuilds tokens before publishing.

### Token format

The file follows a small subset of the [W3C Design Tokens draft](https://tr.designtokens.org/format/):

```json
{
  "fs": {
    "$type": "fontSize",
    "sm": { "$value": "12px", "$description": "Buttons, hints, legend" }
  }
}
```

- **A token** is any object with a `$value`. Keys starting with `$` are metadata.
- **CSS name** is `--<group>-<key>` (e.g. `fs.sm` → `--fs-sm`). Override the prefix with `"$cssPrefix"` on the group: `color` uses `""`, `palette` uses `"p"`.
- **`$type`** can be set per token or once on the group.
- **`"$rgb": true`** on a hex color (or an alias that resolves to one) also emits `--<name>-rgb: r, g, b`, so CSS can use `rgba(var(--accent-selected-rgb), 0.4)`.
- **Aliases**: a value like `"{palette.signal}"` references another token. CSS gets `var(--p-signal)`; JS gets the resolved `#3dfc9b`.
- **`$description`** is written as a CSS comment and shown on the design-system page.

Adding a new group needs no code changes. It appears in CSS and in the "Surface, layout, depth & motion" table on the design-system page.

## Deploying to GitHub Pages

The included workflow (`.github/workflows/pages.yml`) builds tokens, stages the site and deploys it on every push to `main`.

1. Push the repo to GitHub with `main` as the default branch.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push (or run the workflow manually from the **Actions** tab). The site URL appears in the workflow summary.

Pull requests run the build but don't deploy.

**Prefer no Actions?** Set Pages **Source** to **Deploy from a branch → `main` / root**. That works because the generated token files are committed; just run `npm run build:tokens` before pushing.

## Configuration

Tweak behavior in the `CONFIG` object at the top of `assets/js/orbital-watch.js`:

| Option | Default | What it does |
| --- | --- | --- |
| `groundStation` | Seattle | Name, lat/lon (deg) and altitude (km) used for pass prediction and the AOS cloud forecast |
| `conjunctionThresholdKm` | `900` | Distance under which a pair is listed as a conjunction |
| `passSearchHours` / `passStepSec` | `48` / `30` | How far ahead and how finely to search for passes |
| `propagationIntervalMs` / `simPropagationIntervalMs` | `1000` / `100` | Position update rate in LIVE and fast-forward SIM |
| `defaultSimSpeed` | `60` | Clock rate when switching to SIM |
| `belowRefreshSec` / `catalogRefreshSec` | `60` / `120` | How often Open-Meteo is polled for the selected satellite and the whole catalog |
| `stripCells` / `stripMinutes` | `12` / `24` | Resolution and length of the along-track cloud strip |
| `gibsPrecipLayer` | `IMERG_Precipitation_Rate` | Any transparent GIBS layer works as the LIVE weather overlay |

Colors are **not** set here; they come from tokens. To change the catalog, edit the `SATELLITES` array (name, designator, NORAD ID, `sensor`, `instrument`, `swathKm`, TLE lines). Base-imagery options are the `<input name="base">` values in `index.html`: any daily GIBS layer ID works.

## Data and limitations

- **Default TLEs are illustrative**, with a 2024-01-01 epoch, and the Orbit tab flags them as stale. Positions are plausible but not real until you press **Update TLEs**.
- **Live weather** uses Open-Meteo *current conditions* along the next 24 minutes of track, not a forecast for the exact minute the satellite arrives. Open-Meteo is free for non-commercial use.
- **Swath width** on the 2D map is drawn at its equatorial scale, so it's approximate at high latitudes.
- **Conjunctions** are an instantaneous center-to-center distance check between tracked objects only. This is a visualization, not a collision-screening tool.
- **Pass prediction** uses a 30-second step with a 0° elevation mask, so AOS/LOS times are accurate to roughly ±30 s.

## Third-party dependencies

Loaded at runtime, nothing to install:

- [three.js](https://threejs.org) r128 and its `OrbitControls` (MIT)
- [satellite.js](https://github.com/shashwatak/satellite-js) 5.0.0 (MIT) for SGP4 propagation
- [IBM Plex](https://github.com/IBM/plex) Mono, Sans and Sans Condensed via Google Fonts (OFL)
- Data: CelesTrak, Open-Meteo (CC BY 4.0, attribution required), NASA GIBS (public domain)

The globe texture `assets/img/earth_atmos_2048.jpg` is copied from the [three.js examples](https://github.com/mrdoob/three.js/tree/r128/examples/textures/planets). NASA's [Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble) imagery is a drop-in replacement with clear public-domain terms; keep the equirectangular 2:1 ratio and the same filename.

## License

Add a license of your choice (e.g. MIT) as `LICENSE` before making the repo public.
