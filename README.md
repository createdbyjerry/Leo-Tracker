# Leo Tracker

A browser-based 3D tracker for Earth-observation satellites in low Earth orbit, plus the design system it's built on.

Leo Tracker propagates satellite positions in real time from two-line element sets (TLEs), draws them around a textured globe, and shows each satellite's live telemetry, orbit path, ground track, next pass over a ground station, and close approaches with other tracked objects. Everything runs client-side; there's no backend.

**Live demo:** `https://<your-username>.github.io/<repo-name>/`
**Design system:** `https://<your-username>.github.io/<repo-name>/design-system.html`

> Replace `<your-username>` and `<repo-name>` above once Pages is enabled.

---

## Features

- **3D globe** (three.js) with orbit controls, hover highlight and click-to-select
- **Catalog** of 10 Earth-observation satellites (Landsat, Sentinel, Terra, Aqua, Suomi NPP, NOAA-20, ICESat-2)
- **Live telemetry**: altitude, velocity, lat/lon, plus orbital elements (inclination, period, apogee/perigee, eccentricity, RAAN, argument of perigee, mean anomaly, epoch)
- **Pass prediction** for a ground station (default: Seattle) — next AOS, LOS, max elevation and pass duration within 48 h
- **Conjunction alerts** — pairs of tracked satellites currently within 900 km of each other
- **2D ground-track map**, expandable in place
- **Update Data** button that pulls current TLEs from [CelesTrak](https://celestrak.org)

## Repository structure

```
.
├── index.html                  # The tracker prototype
├── design-system.html          # Token + component reference
├── assets/
│   ├── css/
│   │   ├── tokens.css          # GENERATED — do not edit
│   │   ├── leo-tracker.css     # Prototype styles
│   │   └── design-system.css   # Design-system page styles
│   ├── js/
│   │   ├── tokens.js           # GENERATED — do not edit
│   │   ├── leo-tracker.js      # Prototype logic (scene, propagation, UI)
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

The pages are plain static files, but they **must be served over HTTP** — opening `index.html` directly from disk (`file://`) blocks the globe texture via CORS.

```bash
# any of these, from the repo root
npm run serve                 # uses npx serve
python3 -m http.server 8000   # then open http://localhost:8000
```

No `npm install` is needed. Node is only used for the token build script, which has zero dependencies.

## Design tokens

All colors, type sizes, spacing, radii, glass-surface values, layout dimensions and motion timings live in **`tokens/tokens.json`**. A build script turns that file into two generated outputs:

| Output | Used by | Contents |
| --- | --- | --- |
| `assets/css/tokens.css` | Both pages' stylesheets | `:root { --token-name: value; }` |
| `assets/js/tokens.js` | `leo-tracker.js` (three.js colors), `design-system.js` (token tables) | `window.LT_TOKENS = { values, list }` |

So a change in the JSON flows into the CSS, the 3D scene's satellite/orbit colors, and the design-system page at once.

### Workflow

```bash
# 1. edit tokens/tokens.json
# 2. regenerate
npm run build:tokens
# 3. commit the JSON *and* the two generated files
```

`npm run check:tokens` exits non-zero if the generated files don't match the JSON — useful as a pre-commit hook. The deploy workflow also rebuilds tokens before publishing, so the live site is always correct even if you forget step 2 (it'll log a warning).

### Token format

The file follows a small subset of the [W3C Design Tokens draft](https://tr.designtokens.org/format/):

```json
{
  "fs": {
    "$type": "fontSize",
    "sm": { "$value": "11px", "$description": "Buttons, hints, legend" }
  }
}
```

The rules:

- **A token** is any object with a `$value`. Keys starting with `$` are metadata.
- **CSS name** is `--<group>-<key>` (e.g. `fs.sm` → `--fs-sm`). Override the prefix with `"$cssPrefix"` on the group — the `color` group uses `""`, so `color.accent-selected` → `--accent-selected`.
- **`$type`** can be set per token or once on the group.
- **`"$rgb": true`** on a hex color also emits `--<name>-rgb: r, g, b`, so CSS can use `rgba(var(--accent-selected-rgb), 0.4)`.
- **Aliases**: a value like `"{space.8}"` references another token. CSS gets `var(--space-8)`; JS gets the resolved `16px`.
- **`$description`** is written as a CSS comment and shown on the design-system page.

Adding a new group (say `"z": { "panel": { "$value": "6" } }`) needs no code changes — it appears as `--z-panel` in CSS and in the "Surface, layout & motion" table on the design-system page.

## Deploying to GitHub Pages

The included workflow (`.github/workflows/pages.yml`) builds tokens, stages the site and deploys it on every push to `main`.

1. Push the repo to GitHub with `main` as the default branch.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push (or run the workflow manually from the **Actions** tab). The site URL appears in the workflow summary.

Pull requests run the build but don't deploy.

**Prefer no Actions?** Set Pages **Source** to **Deploy from a branch → `main` / root** instead. That works because the generated token files are committed — just remember to run `npm run build:tokens` before pushing.

## Configuration

Tweak behavior in the `CONFIG` object at the top of `assets/js/leo-tracker.js`:

| Option | Default | What it does |
| --- | --- | --- |
| `groundStation` | Seattle | Name, lat/lon (deg) and altitude (km) used for pass prediction |
| `conjunctionThresholdKm` | `900` | Distance under which a pair is listed as a conjunction |
| `passSearchHours` / `passStepSec` | `48` / `30` | How far ahead and how finely to search for passes |
| `propagationIntervalMs` | `1000` | How often positions update |
| `trajectorySamples` | `120` | Points per orbit path |
| `earthMode` | `"texture"` | `"texture"`, `"wireframe"` or `"solid"` globe |

Colors are **not** set here — they come from tokens. To change the catalog, edit the `SATELLITES` array (name, international designator, NORAD ID, and TLE lines).

## Data and limitations

- **Default TLEs are illustrative**, with a 2024-01-01 epoch and approximate elements. Positions are plausible but not real until you press **Update Data**, which fetches current elements from CelesTrak's GP API (one request per satellite). If CelesTrak is unreachable or rate-limits you, the app keeps the last data and offers a retry.
- **Conjunctions** are an instantaneous center-to-center distance check between the tracked objects only. This is a visualization, not a collision-screening tool.
- **Pass prediction** uses a 30-second step with a 0° elevation mask, so AOS/LOS times are accurate to roughly ±30 s.

## Third-party dependencies

Loaded from jsDelivr at runtime — nothing to install:

- [three.js](https://threejs.org) r128 and its `OrbitControls` (MIT)
- [satellite.js](https://github.com/shashwatak/satellite-js) 5.0.0 (MIT) — SGP4 propagation
- [IBM Plex Mono](https://github.com/IBM/plex) and [Inter](https://rsms.me/inter/) via Google Fonts (OFL)

The globe texture `assets/img/earth_atmos_2048.jpg` is copied from the [three.js examples](https://github.com/mrdoob/three.js/tree/r128/examples/textures/planets). If you need a texture with clearly documented public-domain terms, NASA's [Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble) imagery is a drop-in replacement — keep the equirectangular 2:1 aspect ratio and the same filename.

## License

Add a license of your choice (e.g. MIT) as `LICENSE` before making the repo public.