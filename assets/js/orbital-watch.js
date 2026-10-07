/* Orbital Watch — satellite tracker widget
 * Requires (loaded before this file): three.js r128, OrbitControls, satellite.js 5, tokens.js
 *
 * Data sources
 *   LIVE  real UTC clock · weather from Open-Meteo · imagery from NASA GIBS · TLEs from CelesTrak
 *   SIM   accelerated clock · weather from a procedural cloud model (no network needed)
 * If a live source can't be reached, the widget falls back to the model and says so. */
(function () {
  "use strict";

  if (!window.THREE || !window.satellite) {
    console.error("[OrbitalWatch] three.js or satellite.js failed to load.");
    return;
  }

  /* ---- Design tokens (generated from tokens/tokens.json) ---- */
  const TOKENS = (window.OW_TOKENS && window.OW_TOKENS.values) || {};
  const token = (name, fallback) => TOKENS[name] || fallback;

  /* ---- Config ---- */
  const CONFIG = {
    hoverScale: 1.6,
    hoverColor: token("accent-hover", "#ffffff"),
    defaultColor: token("accent-tracked", "#ff6a3d"),
    selectedColor: token("accent-selected", "#3dfc9b"),
    stationColor: token("accent-station", "#3ee8ff"),
    dimColor: token("p-ink-700", "#16232f"),
    atmosphereColor: token("p-sky", "#6aa8ff"),
    starColor: token("p-mist-300", "#a9bdc1"),
    wxRamp: [token("wx-clear", "#1f6f8b"), token("wx-partly", "#7fa9b8"), token("wx-overcast", "#e6eef0")],
    hoverCursor: "pointer",
    trajectoryOpacity: 0.65,
    trajectorySamples: 120,
    propagationIntervalMs: 1000,   // live
    simPropagationIntervalMs: 100, // sim, so fast-forward stays smooth
    earthTextureUrl: "assets/img/earth_atmos_2048.jpg",
    conjunctionThresholdKm: 900,
    groundStation: { name: "SEATTLE, US", latDeg: 47.6062, lonDeg: -122.3321, altKm: 0.1 },
    passSearchHours: 48,
    passStepSec: 30,
    defaultSimSpeed: 60,
    // Weather
    openMeteoUrl: "https://api.open-meteo.com/v1/forecast",
    belowRefreshSec: 60,       // live weather under the selected satellite
    catalogRefreshSec: 120,    // live cloud cover under every satellite
    stripCells: 12,
    stripMinutes: 24,
    // Imagery (NASA GIBS WMS, equirectangular)
    gibsWms: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
    gibsPrecipLayer: "IMERG_Precipitation_Rate",
    gibsSize: [2048, 1024],
    modelTexSize: [384, 192],
    modelTexRefreshSimMin: 10
  };

  /* ---- Catalog: static demo TLEs plus sensor metadata ----
   * sensor: optical | sar | lidar  (drives the imaging outlook)
   * swathKm: nominal cross-track swath of the primary imager */
  const SATELLITES = [
    { name: "LANDSAT 9", designation: "2021-088A", noradId: 49260, sensor: "optical", instrument: "OLI-2 + TIRS-2", swathKm: 185,
      tle1: "1 49260U 21088A   24001.50000000  .00000200  00000-0  50000-4 0  9991",
      tle2: "2 49260  98.2200  50.0000 0001000  90.0000 270.1000 14.57100000100000" },
    { name: "LANDSAT 8", designation: "2013-008A", noradId: 39084, sensor: "optical", instrument: "OLI + TIRS", swathKm: 185,
      tle1: "1 39084U 13008A   24001.50000000  .00000180  00000-0  46000-4 0  9992",
      tle2: "2 39084  98.2100  55.0000 0001200  95.0000 265.0500 14.57108000560000" },
    { name: "SENTINEL-2A", designation: "2015-028A", noradId: 40697, sensor: "optical", instrument: "MSI · 13 bands", swathKm: 290,
      tle1: "1 40697U 15028A   24001.50000000  .00000110  00000-0  30000-4 0  9993",
      tle2: "2 40697  98.5700  60.0000 0001300 100.0000 260.0000 14.30820000450000" },
    { name: "SENTINEL-2B", designation: "2017-013A", noradId: 42063, sensor: "optical", instrument: "MSI · 13 bands", swathKm: 290,
      tle1: "1 42063U 17013A   24001.50000000  .00000105  00000-0  29000-4 0  9994",
      tle2: "2 42063  98.5600  61.0000 0001250 101.0000 259.0000 14.30822000380000" },
    { name: "SENTINEL-1A", designation: "2014-016A", noradId: 39634, sensor: "sar", instrument: "C-SAR · IW mode", swathKm: 250,
      tle1: "1 39634U 14016A   24001.50000000  .00000130  00000-0  33000-4 0  9995",
      tle2: "2 39634  98.1800  45.0000 0001100  80.0000 280.2000 14.59200000510000" },
    { name: "TERRA", designation: "1999-068A", noradId: 25994, sensor: "optical", instrument: "MODIS · ASTER · MISR", swathKm: 2330,
      tle1: "1 25994U 99068A   24001.50000000  .00000090  00000-0  24000-4 0  9996",
      tle2: "2 25994  98.2000  40.0000 0001500  70.0000 290.3000 14.57190000 8100" },
    { name: "AQUA", designation: "2002-022A", noradId: 27424, sensor: "optical", instrument: "MODIS · AIRS · AMSR-E", swathKm: 2330,
      tle1: "1 27424U 02022A   24001.50000000  .00000095  00000-0  25000-4 0  9997",
      tle2: "2 27424  98.2000  38.0000 0001600  72.0000 288.1000 14.57192000 9200" },
    { name: "SUOMI NPP", designation: "2011-061A", noradId: 37849, sensor: "optical", instrument: "VIIRS · ATMS · CrIS", swathKm: 3040,
      tle1: "1 37849U 11061A   24001.50000000  .00000100  00000-0  27000-4 0  9998",
      tle2: "2 37849  98.7300  65.0000 0001400 110.0000 250.4000 14.19560000450000" },
    { name: "NOAA-20", designation: "2017-073A", noradId: 43013, sensor: "optical", instrument: "VIIRS · ATMS · CrIS", swathKm: 3040,
      tle1: "1 43013U 17073A   24001.50000000  .00000098  00000-0  26000-4 0  9999",
      tle2: "2 43013  98.7100  66.0000 0001450 112.0000 248.9000 14.19570000330000" },
    { name: "ICESAT-2", designation: "2018-078A", noradId: 43613, sensor: "lidar", instrument: "ATLAS photon-counting lidar", swathKm: 7,
      tle1: "1 43613U 18078A   24001.50000000  .00000085  00000-0  22000-4 0  9990",
      tle2: "2 43613  92.0100  30.0000 0001000  60.0000 300.5000 15.23100000280000" }
  ];
  const SENSOR_LABEL = { optical: "Optical", sar: "SAR", lidar: "Lidar" };

  const EARTH_RADIUS_KM = 6371;
  const SCENE_EARTH_RADIUS = 5;
  const SCALE = SCENE_EARTH_RADIUS / EARTH_RADIUS_KM;
  const MU = 398600.4418;
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const ORBIT_FIELDS = [
    ["inclination", "Inclination"], ["period", "Period"], ["apogee", "Apogee"], ["perigee", "Perigee"],
    ["eccentricity", "Eccentricity"], ["raan", "RAAN"], ["argp", "Arg. of perigee"], ["ma", "Mean anomaly"],
    ["epoch", "TLE epoch"], ["tleage", "TLE age"]
  ];

  /* ================================================================
   * DOM
   * ================================================================ */
  const $ = (id) => document.getElementById(id);
  const root = $("prototype-wrapper");
  const container = $("canvas-container");
  if (!container) { console.error("[OrbitalWatch] #canvas-container not found."); return; }

  const ui = {
    count: $("cat-count"), hint: $("sat-hint"), readout: $("hud-readout"),
    name: $("sat-name"), designation: $("sat-designation"), sensorTag: $("sat-sensor-tag"), instrument: $("sat-instrument"),
    station: $("station-line"), lastUpdated: $("last-updated"),
    ksAlt: $("ks-alt"), ksVel: $("ks-vel"), ksPos: $("ks-pos"),
    wxMeterFill: $("wx-meter-fill"), wxCloud: $("wx-cloud"), wxVerdict: $("wx-verdict"), wxSource: $("wx-source"),
    wxTemp: $("wx-temp"), wxWind: $("wx-wind"), wxPrecip: $("wx-precip"), wxSun: $("wx-sun"), wxLocal: $("wx-local"), wxImaging: $("wx-imaging"),
    strip: $("track-strip"), stripSpan: $("strip-span"),
    outlook: $("outlook"), outlookChip: $("outlook-chip"), outlookText: $("outlook-text"),
    aos: $("sat-aos"), los: $("sat-los"), maxel: $("sat-maxel"), passdur: $("sat-passdur"), aosCloud: $("sat-aoscloud"), aosSun: $("sat-aossun"),
    fieldGrid: $("field-grid"), orbit: {},
    updateBtn: $("update-tle-btn"), catalogList: $("catalog-list"), conjList: $("conjunction-list"),
    mapEl: $("map2d"), mapExpandBtn: $("map2d-expand-btn"), mapSvg: $("map2d-svg"),
    mapTrack: $("map2d-track"), mapSwath: $("map2d-swath"), mapNight: $("map2d-night"),
    clockUtc: $("clock-utc"), clockDate: $("clock-date"), simControls: $("sim-controls"),
    simPause: $("sim-pause"), simNow: $("sim-now"),
    layersToggle: $("layers-toggle"), layersBody: $("layers-body"),
    ovWeather: $("ov-weather"), ovWeatherLabel: $("ov-weather-label"), ovNight: $("ov-night"), ovSwath: $("ov-swath"),
    toast: $("toast")
  };

  ORBIT_FIELDS.forEach(([key, label]) => {
    const field = document.createElement("div");
    field.className = "hud-field";
    field.innerHTML = '<span class="hud-field__label">' + label + '</span><span class="hud-field__value">—</span>';
    ui.fieldGrid.appendChild(field);
    ui.orbit[key] = field.querySelector(".hud-field__value");
  });
  const stripCells = Array.from({ length: CONFIG.stripCells }, () => {
    const c = document.createElement("span");
    ui.strip.appendChild(c);
    return c;
  });
  ui.stripSpan.textContent = "next " + CONFIG.stripMinutes + " min";
  ui.station.textContent = "Ground station: " + CONFIG.groundStation.name +
    " · " + CONFIG.groundStation.latDeg.toFixed(2) + "°, " + CONFIG.groundStation.lonDeg.toFixed(2) + "°";

  /* ---- Toast ---- */
  let toastTimer = null;
  function toast(msg, ms) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms || 6000);
  }

  /* ================================================================
   * Mission clock (live or simulated)
   * ================================================================ */
  const clock = {
    mode: "live", speed: 1, paused: false,
    anchorReal: Date.now(), anchorSim: Date.now(),
    now() {
      if (this.mode === "live") return new Date();
      const rate = this.paused ? 0 : this.speed;
      return new Date(this.anchorSim + (Date.now() - this.anchorReal) * rate);
    },
    rebase() { const t = this.now().getTime(); this.anchorReal = Date.now(); this.anchorSim = t; },
    setSpeed(s) { this.rebase(); this.speed = s; },
    setPaused(p) { this.rebase(); this.paused = p; },
    jumpToNow() { this.anchorReal = Date.now(); this.anchorSim = Date.now(); }
  };

  /* ================================================================
   * Sun geometry (low-precision solar ephemeris, ~0.01° — fine for shading)
   * ================================================================ */
  function sunPosition(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG2RAD;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG2RAD;
    const eps = (23.439 - 0.0000004 * n) * DEG2RAD;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const lon = wrapLon((ra - satellite.gstime(date)) * RAD2DEG);
    return { decRad: dec, latDeg: dec * RAD2DEG, lonDeg: lon };
  }
  function sunElevationDeg(latDeg, lonDeg, sun) {
    const phi = latDeg * DEG2RAD, dl = (lonDeg - sun.lonDeg) * DEG2RAD;
    return Math.asin(Math.sin(phi) * Math.sin(sun.decRad) + Math.cos(phi) * Math.cos(sun.decRad) * Math.cos(dl)) * RAD2DEG;
  }
  function localSolarTime(date, lonDeg) {
    const h = (((date.getUTCHours() + date.getUTCMinutes() / 60 + lonDeg / 15) % 24) + 24) % 24;
    return String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.floor((h % 1) * 60)).padStart(2, "0");
  }
  function wrapLon(lon) { return ((((lon + 180) % 360) + 360) % 360) - 180; }

  /* ================================================================
   * Simulated weather model
   * Value-noise fBm on a cylinder (so longitude wraps), advected by latitude
   * band and biased by a cloud climatology: wet ITCZ, dry subtropics, cloudy
   * storm tracks. Deterministic in time, so the globe, the strip and the pass
   * forecast all agree.
   * ================================================================ */
  function hash3(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
      w
    );
  }
  function climatology(latDeg) {
    const a = Math.abs(latDeg);
    return 0.5 + 0.22 * Math.exp(-Math.pow(latDeg / 8, 2)) - 0.26 * Math.exp(-Math.pow((a - 24) / 9, 2)) + 0.16 * Math.exp(-Math.pow((a - 58) / 12, 2));
  }
  // Zonal drift in deg/hour: trade winds westward, westerlies eastward, blended smoothly so bands don't tear.
  function zonalDrift(latDeg) {
    const a = Math.abs(latDeg), w = Math.min(1, Math.max(0, (a - 18) / 16));
    return -0.3 * (1 - w) + 0.55 * w;
  }
  const FLOW_PERIOD_H = 36; // two staggered advection phases cross-fade so drift never accumulates into streaks
  function cloudField(latDeg, lonDeg, hours, phase, seed) {
    const lon = (lonDeg - zonalDrift(latDeg) * phase * FLOW_PERIOD_H) * DEG2RAD;
    const R = 3.4;
    const x = Math.cos(lon) * R + seed, y = Math.sin(lon) * R + 50, z = latDeg / 17 + hours * 0.03;
    let n = 0, amp = 0.55, f = 1;
    for (let o = 0; o < 4; o++) { n += amp * vnoise(x * f, y * f, z * f + o * 17.3); amp *= 0.5; f *= 2.07; }
    return n;
  }
  function cloudModel(latDeg, lonDeg, date) {
    const hours = (date.getTime() / 3.6e6) % 100000;
    const p1 = (hours / FLOW_PERIOD_H) % 1, p2 = (p1 + 0.5) % 1;
    const w1 = 1 - Math.abs(2 * p1 - 1);
    const n = w1 * cloudField(latDeg, lonDeg, hours, p1, 11) + (1 - w1) * cloudField(latDeg, lonDeg, hours, p2, 91);
    const v = n + (climatology(latDeg) - 0.5) * 0.75;
    const t = Math.min(1, Math.max(0, (v - 0.4) / 0.27));
    return 100 * t * t * (3 - 2 * t);
  }
  function modelConditions(latDeg, lonDeg, date, sun) {
    const cloud = cloudModel(latDeg, lonDeg, date);
    const sunEl = sunElevationDeg(latDeg, lonDeg, sun);
    const temp = 30 * Math.cos(latDeg * DEG2RAD) - 9 + 5 * Math.sin(Math.max(-30, sunEl) * DEG2RAD) - cloud * 0.02;
    const wind = 2 + 11 * vnoise(lonDeg / 14 + 7, latDeg / 14 + 3, date.getTime() / 3.6e7);
    const precip = cloud > 82 ? ((cloud - 82) / 18) * 3.5 * vnoise(lonDeg / 6, latDeg / 6, 9) : 0;
    return { cloud, temp, wind, precip };
  }

  /* ================================================================
   * Live weather (Open-Meteo, no API key, CORS-enabled)
   * ================================================================ */
  const live = {
    ok: null,           // null = untested, true, false = unreachable (use model)
    warned: false,
    below: null,        // { satIndex, fetchedAt, points: [{cloud,temp,wind,precip}] }
    belowInflight: false,
    catalog: null,      // { fetchedAt, clouds: [] }
    catalogInflight: false,
    station: null,      // { fetchedAt, times: [ms], clouds: [] }
    stationInflight: false
  };
  async function openMeteo(points, params) {
    const lat = points.map((p) => p.lat.toFixed(2)).join(",");
    const lon = points.map((p) => p.lon.toFixed(2)).join(",");
    const res = await fetch(CONFIG.openMeteoUrl + "?latitude=" + lat + "&longitude=" + lon + "&" + params);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const json = await res.json();
    return Array.isArray(json) ? json : [json];
  }
  function liveFailed(err) {
    console.warn("[OrbitalWatch] live weather unavailable:", err);
    live.ok = false;
    if (!live.warned) {
      live.warned = true;
      toast("Live weather couldn't be reached from this page, so the simulated cloud model is filling in. Serve the site from GitHub Pages or localhost to use Open-Meteo.", 8000);
    }
    renderAll();
  }
  function useLive() { return clock.mode === "live" && live.ok !== false; }

  function maybeFetchBelow(sat) {
    if (!useLive() || live.belowInflight || !sat || !sat.live) return;
    const fresh = live.below && live.below.satIndex === selectedIndex && Date.now() - live.below.fetchedAt < CONFIG.belowRefreshSec * 1000;
    if (fresh) return;
    live.belowInflight = true;
    const pts = [{ lat: sat.live.lat, lon: sat.live.lon }].concat(trackAhead(sat, clock.now()).map((p) => ({ lat: p.lat, lon: p.lon })));
    openMeteo(pts, "current=cloud_cover,temperature_2m,wind_speed_10m,precipitation&wind_speed_unit=ms")
      .then((arr) => {
        live.ok = true;
        live.below = {
          satIndex: selectedIndex, fetchedAt: Date.now(),
          points: arr.map((r) => ({ cloud: r.current.cloud_cover, temp: r.current.temperature_2m, wind: r.current.wind_speed_10m, precip: r.current.precipitation }))
        };
        renderWeather();
      })
      .catch(liveFailed)
      .finally(() => { live.belowInflight = false; });
  }
  function maybeFetchCatalog() {
    if (!useLive() || live.catalogInflight) return;
    if (live.catalog && Date.now() - live.catalog.fetchedAt < CONFIG.catalogRefreshSec * 1000) return;
    const pts = sats.filter((s) => s.live).map((s) => ({ lat: s.live.lat, lon: s.live.lon }));
    if (pts.length !== sats.length) return;
    live.catalogInflight = true;
    openMeteo(pts, "current=cloud_cover")
      .then((arr) => { live.ok = true; live.catalog = { fetchedAt: Date.now(), clouds: arr.map((r) => r.current.cloud_cover) }; renderCatalogWx(); })
      .catch(liveFailed)
      .finally(() => { live.catalogInflight = false; });
  }
  function maybeFetchStation() {
    if (!useLive() || live.stationInflight) return;
    if (live.station && Date.now() - live.station.fetchedAt < 30 * 60000) return;
    live.stationInflight = true;
    const gs = CONFIG.groundStation;
    openMeteo([{ lat: gs.latDeg, lon: gs.lonDeg }], "hourly=cloud_cover&forecast_days=3&timezone=GMT")
      .then((arr) => {
        live.ok = true;
        const h = arr[0].hourly;
        live.station = { fetchedAt: Date.now(), times: h.time.map((t) => Date.parse(t + ":00Z")), clouds: h.cloud_cover };
        renderPass();
      })
      .catch(liveFailed)
      .finally(() => { live.stationInflight = false; });
  }
  function stationCloudAt(date) {
    if (useLive() && live.station) {
      const t = date.getTime();
      let best = -1, bestD = Infinity;
      live.station.times.forEach((tt, i) => { const d = Math.abs(tt - t); if (d < bestD) { bestD = d; best = i; } });
      if (best !== -1 && bestD < 2 * 3600000) return { cloud: live.station.clouds[best], source: "live" };
    }
    const gs = CONFIG.groundStation;
    return { cloud: cloudModel(gs.latDeg, gs.lonDeg, date), source: "model" };
  }

  /* ================================================================
   * Orbital helpers
   * ================================================================ */
  const observerGd = {
    longitude: CONFIG.groundStation.lonDeg * DEG2RAD,
    latitude: CONFIG.groundStation.latDeg * DEG2RAD,
    height: CONFIG.groundStation.altKm
  };
  let sats = [], selectedIndex = -1, hoveredIndex = -1, sensorFilter = "all", tleSource = "demo";

  function llToXY(latDeg, lonDeg) { return { x: (lonDeg + 180) / 360 * 100, y: (90 - latDeg) / 180 * 100 }; }
  function epochDate(satrec) {
    const jd = satrec.jdsatepoch + (satrec.jdsatepochF || 0);
    return new Date((jd - 2440587.5) * 86400000);
  }
  function deriveElements(satrec) {
    const n = satrec.no / 60, a = Math.cbrt(MU / (n * n)), e = satrec.ecco;
    return {
      apogeeKm: a * (1 + e) - EARTH_RADIUS_KM, perigeeKm: a * (1 - e) - EARTH_RADIUS_KM,
      periodMin: (2 * Math.PI) / satrec.no, eccentricity: e,
      raanDeg: satrec.nodeo * RAD2DEG, argpDeg: satrec.argpo * RAD2DEG,
      maDeg: satrec.mo * RAD2DEG, epoch: epochDate(satrec)
    };
  }
  function buildSatrecs(data) {
    return data.map((sat) => {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      return { ...sat, satrec, inclinationDeg: satrec.inclo * RAD2DEG, ...deriveElements(satrec) };
    });
  }
  function geodeticAt(satrec, t) {
    const pv = satellite.propagate(satrec, t);
    if (!pv.position) return null;
    const gmst = satellite.gstime(t), geo = satellite.eciToGeodetic(pv.position, gmst);
    return { lat: geo.latitude * RAD2DEG, lon: wrapLon(geo.longitude * RAD2DEG), pv, gmst };
  }
  function trackAhead(sat, now) {
    const out = [], step = (CONFIG.stripMinutes / CONFIG.stripCells) * 60000;
    for (let k = 0; k < CONFIG.stripCells; k++) {
      const t = new Date(now.getTime() + (k + 0.5) * step);
      const g = geodeticAt(sat.satrec, t);
      out.push(g ? { lat: g.lat, lon: g.lon, t } : { lat: 0, lon: 0, t });
    }
    return out;
  }
  sats = buildSatrecs(SATELLITES);

  /* ================================================================
   * Catalog
   * ================================================================ */
  function buildCatalog() {
    ui.catalogList.innerHTML = "";
    sats.forEach((sat, i) => {
      const row = document.createElement("div");
      row.className = "catalog-row";
      row.dataset.index = i;
      row.dataset.sensor = sat.sensor;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.innerHTML =
        '<span class="dot dot--tracked"></span>' +
        '<span class="catalog-row__text"><span class="catalog-row__name">' + sat.name + '</span>' +
        '<span class="catalog-row__id">NORAD ' + sat.noradId + ' · ' + SENSOR_LABEL[sat.sensor] + '</span></span>' +
        '<span class="catalog-row__wx" title="Cloud cover under the satellite"><span class="mini-bar"><span></span></span><span class="catalog-row__cc">—</span></span>';
      row.addEventListener("click", () => selectSatellite(i));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectSatellite(i); }
      });
      ui.catalogList.appendChild(row);
    });
    applyFilter();
  }
  function syncCatalogActive() {
    ui.catalogList.querySelectorAll(".catalog-row").forEach((row) => {
      const active = Number(row.dataset.index) === selectedIndex;
      row.classList.toggle("is-active", active);
      row.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  function applyFilter() {
    let n = 0;
    ui.catalogList.querySelectorAll(".catalog-row").forEach((row) => {
      const show = sensorFilter === "all" || row.dataset.sensor === sensorFilter;
      row.hidden = !show;
      if (show) n++;
    });
    ui.count.textContent = (sensorFilter === "all" ? sats.length : n + " of " + sats.length) + " objects";
    if (typeof resetInstanceColors === "function") resetInstanceColors();
  }
  const isFilteredOut = (i) => sensorFilter !== "all" && sats[i].sensor !== sensorFilter;

  document.querySelectorAll("#sensor-filter .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      sensorFilter = chip.dataset.filter;
      document.querySelectorAll("#sensor-filter .chip").forEach((c) => {
        const on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-checked", on ? "true" : "false");
      });
      applyFilter();
    });
  });

  /* ---- Cloud-cover color ramp (clear → partly → overcast) ---- */
  const rampColors = CONFIG.wxRamp.map((h) => new THREE.Color(h));
  function cloudColor(pct) {
    const t = Math.max(0, Math.min(1, pct / 100)) * 2;
    const i = Math.min(1, Math.floor(t));
    return "#" + rampColors[i].clone().lerp(rampColors[i + 1], t - i).getHexString();
  }
  function cloudClass(pct) { return pct < 30 ? "Clear" : pct < 60 ? "Partly cloudy" : pct < 85 ? "Mostly cloudy" : "Overcast"; }

  function renderCatalogWx() {
    const now = clock.now();
    const liveClouds = useLive() && live.catalog ? live.catalog.clouds : null;
    ui.catalogList.querySelectorAll(".catalog-row").forEach((row) => {
      const i = Number(row.dataset.index), sat = sats[i];
      if (!sat || !sat.live) return;
      const cc = liveClouds && liveClouds[i] != null ? liveClouds[i] : cloudModel(sat.live.lat, sat.live.lon, now);
      const bar = row.querySelector(".mini-bar span");
      bar.style.width = Math.max(4, cc) + "%";
      bar.style.background = cloudColor(cc);
      row.querySelector(".catalog-row__cc").textContent = Math.round(cc) + "%";
    });
  }

  /* ================================================================
   * Map 2D
   * ================================================================ */
  if (ui.mapExpandBtn) ui.mapExpandBtn.addEventListener("click", () => {
    const expanded = ui.mapEl.classList.toggle("is-expanded");
    ui.mapExpandBtn.textContent = expanded ? "Collapse" : "Expand";
    ui.mapExpandBtn.title = expanded ? "Collapse" : "Expand";
    ui.mapExpandBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  });
  const MAP_NS = "http://www.w3.org/2000/svg";
  function makeMapCircle(r, cls) {
    const c = document.createElementNS(MAP_NS, "circle");
    c.setAttribute("r", r); c.setAttribute("class", cls);
    ui.mapSvg.appendChild(c);
    return c;
  }
  const mapSatDots = sats.map(() => makeMapCircle(1.3, "map2d-dot"));
  const mapStationDot = makeMapCircle(1.4, "map2d-dot map2d-dot--station");
  const stationXY = llToXY(CONFIG.groundStation.latDeg, CONFIG.groundStation.lonDeg);
  mapStationDot.setAttribute("cx", stationXY.x); mapStationDot.setAttribute("cy", stationXY.y);

  function buildGroundTrackPath(sat, now) {
    let d = "", prevX = null;
    const periodMs = sat.periodMin * 60000;
    for (let i = 0; i <= CONFIG.trajectorySamples; i++) {
      const g = geodeticAt(sat.satrec, new Date(now.getTime() + (i / CONFIG.trajectorySamples) * periodMs));
      if (!g) continue;
      const p = llToXY(g.lat, g.lon);
      d += (prevX === null || Math.abs(p.x - prevX) > 50 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
      prevX = p.x;
    }
    return d;
  }
  function buildNightPath(sun) {
    const tanDec = Math.tan(Math.abs(sun.decRad) < 1e-4 ? 1e-4 : sun.decRad);
    let d = "";
    for (let lon = -180; lon <= 180; lon += 3) {
      const lat = Math.atan(-Math.cos((lon - sun.lonDeg) * DEG2RAD) / tanDec) * RAD2DEG;
      const p = llToXY(lat, lon);
      d += (lon === -180 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
    }
    const poleY = sun.decRad > 0 ? 100 : 0;
    return d + "L100," + poleY + " L0," + poleY + " Z";
  }
  function swathStrokePx(sat) {
    const w = ui.mapSvg.getBoundingClientRect().width || 300;
    return Math.max(2, (sat.swathKm / 40075) * w); // width at the equator; approximate elsewhere
  }

  /* ================================================================
   * Three.js scene
   * ================================================================ */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 6, 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.insertBefore(renderer.domElement, container.firstChild);
  Object.assign(renderer.domElement.style, { pointerEvents: "auto", position: "absolute", inset: "0", zIndex: token("z-scene", "1") });

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 7.5; controls.maxDistance = 40;
  controls.enablePan = false;

  const ambient = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.25);
  scene.add(sunLight);

  // Star field
  (function addStars() {
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 300, s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: CONFIG.starColor, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.55 })));
  })();

  // Earth
  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin("anonymous");
  const blueMarble = texLoader.load(CONFIG.earthTextureUrl);
  const earthMat = new THREE.MeshPhongMaterial({ map: blueMarble, shininess: 8, specular: new THREE.Color(0x111a22) });
  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(SCENE_EARTH_RADIUS, 72, 72), earthMat);
  scene.add(earthMesh);

  // Atmosphere rim (fresnel)
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_EARTH_RADIUS * 1.09, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { glow: { value: new THREE.Color(CONFIG.atmosphereColor) } },
      vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 glow; varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(glow, 1.0) * i; }",
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    })
  );
  scene.add(atmosphere);

  // Weather overlays: model clouds (canvas texture, lit by the sun) and IMERG precipitation (unlit)
  const modelCanvas = document.createElement("canvas");
  modelCanvas.width = CONFIG.modelTexSize[0]; modelCanvas.height = CONFIG.modelTexSize[1];
  const modelCtx = modelCanvas.getContext("2d");
  const modelTex = new THREE.CanvasTexture(modelCanvas);
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_EARTH_RADIUS * 1.008, 72, 72),
    new THREE.MeshPhongMaterial({ map: modelTex, transparent: true, depthWrite: false, shininess: 0 })
  );
  cloudMesh.visible = false;
  scene.add(cloudMesh);
  const precipMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_EARTH_RADIUS * 1.006, 72, 72),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 })
  );
  precipMesh.visible = false;
  scene.add(precipMesh);

  let modelTexTime = -Infinity, modelPaintedAt = -Infinity;
  function paintModelClouds(date) {
    const [w, h] = CONFIG.modelTexSize, img = modelCtx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        const c = cloudModel(lat, lon, date) / 100, k = (y * w + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255;
        d[k + 3] = Math.round(Math.pow(c, 1.15) * 235);
      }
    }
    modelCtx.putImageData(img, 0, 0);
    modelTex.needsUpdate = true;
    modelTexTime = date.getTime();
    modelPaintedAt = performance.now();
  }

  // Ground station
  const stationEcf = satellite.geodeticToEcf(observerGd);
  const stationMarker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshBasicMaterial({ color: CONFIG.stationColor }));
  stationMarker.position.set(stationEcf.x * SCALE, stationEcf.z * SCALE, -stationEcf.y * SCALE);
  scene.add(stationMarker);

  // Satellites
  const satMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), sats.length);
  satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sats.length * 3), 3);
  scene.add(satMesh);

  const dummy = new THREE.Object3D();
  const baseColor = new THREE.Color(CONFIG.defaultColor);
  const hoverColorObj = new THREE.Color(CONFIG.hoverColor);
  const selectedColorObj = new THREE.Color(CONFIG.selectedColor);
  const dimColorObj = new THREE.Color(CONFIG.dimColor);
  function resetInstanceColors() {
    for (let i = 0; i < sats.length; i++) {
      satMesh.setColorAt(i, i === selectedIndex ? selectedColorObj : isFilteredOut(i) ? dimColorObj : baseColor);
    }
    if (hoveredIndex !== -1 && hoveredIndex !== selectedIndex) satMesh.setColorAt(hoveredIndex, hoverColorObj);
    satMesh.instanceColor.needsUpdate = true;
  }
  resetInstanceColors();

  // Orbit trajectory
  let trajectoryLine = null;
  const trajectoryMat = new THREE.LineBasicMaterial({ color: CONFIG.selectedColor, transparent: true, opacity: CONFIG.trajectoryOpacity });
  function drawTrajectory(sat, now) {
    if (trajectoryLine) { scene.remove(trajectoryLine); trajectoryLine.geometry.dispose(); trajectoryLine = null; }
    if (!sat) return;
    const points = [], periodMs = sat.periodMin * 60000;
    for (let i = 0; i <= CONFIG.trajectorySamples; i++) {
      const t = new Date(now.getTime() + (i / CONFIG.trajectorySamples) * periodMs);
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const ecf = satellite.eciToEcf(pv.position, satellite.gstime(t));
      points.push(new THREE.Vector3(ecf.x * SCALE, ecf.z * SCALE, -ecf.y * SCALE));
    }
    trajectoryLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), trajectoryMat);
    scene.add(trajectoryLine);
  }

  /* ================================================================
   * Layers: base imagery, weather overlay, day/night, swath
   * ================================================================ */
  function utcDateString(d) { return d.toISOString().slice(0, 10); }
  function imageryDate() { return utcDateString(new Date(Date.now() - 86400000)); } // yesterday: today's mosaic is incomplete
  function gibsUrl(layer, opts) {
    const [w, h] = CONFIG.gibsSize;
    return CONFIG.gibsWms + "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180" +
      "&WIDTH=" + w + "&HEIGHT=" + h + "&LAYERS=" + layer +
      "&FORMAT=" + (opts.png ? "image/png&TRANSPARENT=TRUE" : "image/jpeg") + (opts.time ? "&TIME=" + opts.time : "");
  }
  document.querySelectorAll(".layer-date").forEach((el) => { el.textContent = imageryDate().slice(5); el.title = "NASA GIBS daily mosaic, " + imageryDate(); });

  const gibsCache = {};
  let baseLayer = "bluemarble", weatherSource = "model"; // "imerg" | "model"
  function setBaseLayer(layer) {
    baseLayer = layer;
    if (layer === "bluemarble") { earthMat.map = blueMarble; earthMat.needsUpdate = true; return; }
    if (gibsCache[layer]) { earthMat.map = gibsCache[layer]; earthMat.needsUpdate = true; return; }
    toast("Loading " + layer.split("_").slice(0, 2).join(" ") + " imagery for " + imageryDate() + " from NASA GIBS…", 4000);
    texLoader.load(gibsUrl(layer, { time: imageryDate() }), (tex) => {
      gibsCache[layer] = tex;
      if (baseLayer === layer) { earthMat.map = tex; earthMat.needsUpdate = true; ui.toast.hidden = true; }
    }, undefined, () => {
      toast("NASA GIBS imagery couldn't load here (the preview sandbox blocks outside images). It works when the site is served from GitHub Pages. Showing Blue Marble.", 8000);
      const radio = document.querySelector('input[name="base"][value="' + layer + '"]');
      if (radio) radio.closest(".layer-opt").classList.add("is-unavailable");
      document.querySelector('input[name="base"][value="bluemarble"]').checked = true;
      setBaseLayer("bluemarble");
    });
  }
  document.querySelectorAll('input[name="base"]').forEach((r) => r.addEventListener("change", () => { if (r.checked) setBaseLayer(r.value); }));

  let precipTried = false;
  function syncWeatherOverlay() {
    const on = ui.ovWeather.checked;
    if (clock.mode === "live" && !precipTried) {
      precipTried = true;
      texLoader.load(gibsUrl(CONFIG.gibsPrecipLayer, { png: true }), (tex) => {
        precipMesh.material.map = tex; precipMesh.material.needsUpdate = true;
        weatherSource = "imerg"; syncWeatherOverlay();
      }, undefined, () => { weatherSource = "model"; syncWeatherOverlay(); });
    }
    const imerg = clock.mode === "live" && weatherSource === "imerg";
    precipMesh.visible = on && imerg;
    cloudMesh.visible = on && !imerg;
    ui.ovWeatherLabel.textContent = imerg ? "Precipitation · IMERG" : "Clouds · model";
    ui.ovWeatherLabel.title = imerg ? "NASA GPM IMERG precipitation rate" : clock.mode === "live" ? "Live precipitation layer unavailable here; showing the simulated cloud model" : "Simulated cloud model";
  }
  ui.ovWeather.addEventListener("change", syncWeatherOverlay);
  ui.ovNight.addEventListener("change", () => { syncLighting(clock.now()); });
  ui.ovSwath.addEventListener("change", () => { ui.mapSwath.style.display = ui.ovSwath.checked ? "" : "none"; });

  function syncLighting(now) {
    const sun = sunPosition(now);
    if (ui.ovNight.checked) {
      const la = sun.latDeg * DEG2RAD, lo = sun.lonDeg * DEG2RAD;
      const ex = Math.cos(la) * Math.cos(lo), ey = Math.cos(la) * Math.sin(lo), ez = Math.sin(la);
      sunLight.position.set(ex * 50, ez * 50, -ey * 50);
      sunLight.intensity = 1.25; ambient.intensity = 0.2;
      ui.mapNight.setAttribute("d", buildNightPath(sun));
    } else {
      sunLight.position.copy(camera.position).multiplyScalar(3);
      sunLight.intensity = 0.55; ambient.intensity = 0.75;
      ui.mapNight.setAttribute("d", "");
    }
    return sun;
  }

  ui.layersToggle.addEventListener("click", () => {
    const open = ui.layersToggle.getAttribute("aria-expanded") !== "true";
    ui.layersToggle.setAttribute("aria-expanded", open ? "true" : "false");
    ui.layersBody.hidden = !open;
  });
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
    ui.layersToggle.setAttribute("aria-expanded", "false");
    ui.layersBody.hidden = true;
  }

  /* ================================================================
   * Conjunctions (instantaneous distance check, not a screening tool)
   * ================================================================ */
  function renderConjunctions() {
    const alerts = [];
    for (let i = 0; i < sats.length; i++) {
      for (let j = i + 1; j < sats.length; j++) {
        const a = sats[i].ecfKm, b = sats[j].ecfKm;
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < CONFIG.conjunctionThresholdKm) alerts.push({ i, j, d });
      }
    }
    alerts.sort((x, y) => x.d - y.d);
    ui.conjList.innerHTML = alerts.length
      ? alerts.slice(0, 4).map((a) => '<div class="conj-row"><span class="conj-dot"></span><span>' + sats[a.i].name + ' ↔ ' + sats[a.j].name + '</span><strong>' + a.d.toFixed(0) + ' km</strong></div>').join("")
      : '<div class="conj-empty">No pairs within ' + CONFIG.conjunctionThresholdKm + ' km</div>';
  }

  /* ================================================================
   * Pass prediction + imaging outlook
   * ================================================================ */
  let currentPass = null; // { satIndex, aos, los, maxElDeg, durMin } | { satIndex, none: true, searchedFrom }
  function findNextPass(sat, from) {
    let aos = null, maxElDeg = -90;
    const start = from.getTime();
    for (let s = 0; s <= CONFIG.passSearchHours * 3600; s += CONFIG.passStepSec) {
      const t = new Date(start + s * 1000);
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const look = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(pv.position, satellite.gstime(t)));
      const elDeg = look.elevation * RAD2DEG;
      if (aos === null) {
        if (elDeg > 0) { aos = t; maxElDeg = elDeg; }
      } else {
        if (elDeg > maxElDeg) maxElDeg = elDeg;
        if (elDeg <= 0) return { aos, los: t, maxElDeg, durMin: (t - aos) / 60000 };
      }
    }
    return null;
  }
  function ensurePass(now) {
    if (selectedIndex === -1) return;
    const stale = !currentPass || currentPass.satIndex !== selectedIndex ||
      (currentPass.los && now > currentPass.los) ||
      (currentPass.aos && now < currentPass.aos - CONFIG.passSearchHours * 3600000) ||
      (currentPass.none && Math.abs(now - currentPass.searchedFrom) > 3600000);
    if (!stale) return;
    const p = findNextPass(sats[selectedIndex], now);
    currentPass = p ? { satIndex: selectedIndex, ...p } : { satIndex: selectedIndex, none: true, searchedFrom: now.getTime() };
    renderPass();
  }
  function hhmm(d) { return d.toISOString().slice(11, 16) + " UTC"; }
  function relTime(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return "now";
    if (m < 60) return "in " + m + " min";
    return "in " + Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
  }
  function outlookFor(sat, cloud, sunEl) {
    if (sat.sensor === "sar") return { state: "sar", chip: "All-weather", text: "C-band radar sees through cloud and works at night. Expect a usable acquisition whatever the weather." };
    const night = sunEl < 5;
    if (sat.sensor === "optical" && night) {
      return { state: "alert", chip: "Night pass", text: "Sun is " + Math.abs(sunEl).toFixed(0) + "° " + (sunEl < 0 ? "below" : "above") + " the horizon at AOS, too dark for reflective bands. Thermal channels only." };
    }
    const cc = Math.round(cloud);
    const where = "Forecast " + cc + "% cloud over " + CONFIG.groundStation.name.split(",")[0].replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
    const lidarNote = sat.sensor === "lidar" ? " Lidar returns stop at cloud tops." : "";
    if (cc < 30) return { state: "ok", chip: "Clear window", text: where + ", sun " + sunEl.toFixed(0) + "° up. Good conditions for a usable scene." + lidarNote };
    if (cc < 70) return { state: "warn", chip: "Marginal", text: where + ". Expect partial coverage; cloud masking will drop part of the scene." + lidarNote };
    return { state: "alert", chip: "Overcast", text: where + ". The surface will likely be hidden on this pass." + lidarNote };
  }
  function renderPass() {
    if (selectedIndex === -1 || !currentPass) return;
    const sat = sats[selectedIndex];
    if (currentPass.none) {
      [ui.aos, ui.los, ui.maxel, ui.passdur, ui.aosCloud, ui.aosSun].forEach((el) => { el.textContent = "—"; });
      ui.outlook.dataset.state = "";
      ui.outlookChip.textContent = "No pass";
      ui.outlookText.textContent = "No pass above the horizon in the next " + CONFIG.passSearchHours + " hours.";
      return;
    }
    const { aos, los, maxElDeg, durMin } = currentPass;
    const now = clock.now();
    const sunAos = sunElevationDeg(CONFIG.groundStation.latDeg, CONFIG.groundStation.lonDeg, sunPosition(aos));
    const wx = stationCloudAt(aos);
    ui.aos.textContent = hhmm(aos);
    ui.los.textContent = hhmm(los);
    ui.maxel.textContent = maxElDeg.toFixed(1) + "°";
    ui.passdur.textContent = durMin.toFixed(1) + " min";
    ui.aosCloud.textContent = Math.round(wx.cloud) + "%" + (wx.source === "model" ? " ·sim" : "");
    ui.aosSun.textContent = sunAos.toFixed(0) + "°";
    const o = outlookFor(sat, wx.cloud, sunAos);
    ui.outlook.dataset.state = o.state;
    ui.outlookChip.textContent = o.chip;
    ui.outlookText.textContent = (now < aos ? "AOS " + relTime(aos - now) + ". " : "Pass in progress. ") + o.text;
  }

  /* ================================================================
   * Weather under the selected satellite
   * ================================================================ */
  const METER_LEN = 169.6;
  function renderWeather() {
    if (selectedIndex === -1) return;
    const sat = sats[selectedIndex];
    if (!sat.live) return;
    const now = clock.now(), sun = sunPosition(now);
    const ahead = trackAhead(sat, now);
    const liveData = useLive() && live.below && live.below.satIndex === selectedIndex ? live.below.points : null;
    const c = liveData ? liveData[0] : modelConditions(sat.live.lat, sat.live.lon, now, sun);
    const sunEl = sunElevationDeg(sat.live.lat, sat.live.lon, sun);

    ui.wxMeterFill.style.strokeDashoffset = String(METER_LEN * (1 - c.cloud / 100));
    ui.wxMeterFill.style.stroke = cloudColor(c.cloud);
    ui.wxCloud.textContent = Math.round(c.cloud) + "%";
    ui.wxVerdict.textContent = cloudClass(c.cloud);
    ui.wxSource.textContent = liveData ? "Open-Meteo · " + Math.round((Date.now() - live.below.fetchedAt) / 1000) + " s ago" : "Simulated cloud model";
    ui.wxSource.classList.toggle("is-sim", !liveData);
    ui.wxTemp.textContent = c.temp.toFixed(1) + " °C";
    ui.wxWind.textContent = c.wind.toFixed(1) + " m/s";
    ui.wxPrecip.textContent = c.precip.toFixed(1) + " mm/h";
    ui.wxSun.textContent = sunEl.toFixed(0) + "°";
    ui.wxLocal.textContent = localSolarTime(now, sat.live.lon) + " LST";
    ui.wxImaging.textContent = sat.sensor === "sar" ? "All-weather" : sat.sensor === "optical" && sunEl < 5 ? "Night" : c.cloud < 30 ? "Clear" : c.cloud < 70 ? "Marginal" : "Blocked";

    ahead.forEach((p, k) => {
      const cc = liveData && liveData[k + 1] ? liveData[k + 1].cloud : cloudModel(p.lat, p.lon, p.t);
      const night = sunElevationDeg(p.lat, p.lon, sunPosition(p.t)) < 0;
      stripCells[k].style.background = cloudColor(cc);
      stripCells[k].classList.toggle("is-night", night);
      stripCells[k].title = "+" + Math.round(((k + 0.5) * CONFIG.stripMinutes) / CONFIG.stripCells) + " min · " + Math.round(cc) + "% cloud" + (night ? " · night" : "");
    });
  }

  /* ================================================================
   * Telemetry readout
   * ================================================================ */
  function fmt(n, d) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }
  function renderSelectedSatellite(sat) {
    if (!sat) return;
    ui.hint.hidden = true;
    ui.readout.hidden = false;
    ui.name.textContent = sat.name;
    ui.designation.textContent = "NORAD " + sat.noradId + " · " + sat.designation;
    ui.sensorTag.textContent = SENSOR_LABEL[sat.sensor];
    ui.sensorTag.className = "sensor-tag sensor-tag--" + sat.sensor;
    ui.instrument.textContent = sat.instrument + " · " + sat.swathKm.toLocaleString() + " km swath";
    const o = ui.orbit, now = clock.now();
    o.inclination.textContent = fmt(sat.inclinationDeg, 2) + "°";
    o.period.textContent = fmt(sat.periodMin, 1) + " min";
    o.apogee.textContent = fmt(sat.apogeeKm, 0) + " km";
    o.perigee.textContent = fmt(sat.perigeeKm, 0) + " km";
    o.eccentricity.textContent = fmt(sat.eccentricity, 4);
    o.raan.textContent = fmt(sat.raanDeg, 2) + "°";
    o.argp.textContent = fmt(sat.argpDeg, 2) + "°";
    o.ma.textContent = fmt(sat.maDeg, 2) + "°";
    o.epoch.textContent = sat.epoch.toISOString().slice(0, 10);
    const ageDays = (now - sat.epoch) / 86400000;
    o.tleage.textContent = ageDays > 60 ? Math.round(ageDays) + " d · stale" : ageDays.toFixed(1) + " d";
    if (sat.live) {
      ui.ksAlt.textContent = fmt(sat.live.altitudeKm, 1) + " km";
      ui.ksVel.textContent = fmt(sat.live.velocityKmS, 2) + " km/s";
      ui.ksPos.textContent = fmt(Math.abs(sat.live.lat), 1) + (sat.live.lat >= 0 ? "N " : "S ") + fmt(Math.abs(sat.live.lon), 1) + (sat.live.lon >= 0 ? "E" : "W");
    }
  }

  /* ================================================================
   * Tabs
   * ================================================================ */
  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  function activateTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => activateTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        activateTab(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length], true);
      }
    });
  });

  /* ================================================================
   * Propagation loop
   * ================================================================ */
  function updateSatellitePositions() {
    const now = clock.now(), gmst = satellite.gstime(now);
    sats.forEach((sat, i) => {
      const pv = satellite.propagate(sat.satrec, now);
      if (!pv.position) return;
      const ecf = satellite.eciToEcf(pv.position, gmst), geo = satellite.eciToGeodetic(pv.position, gmst);
      sat.ecfKm = { x: ecf.x, y: ecf.y, z: ecf.z };
      dummy.position.set(ecf.x * SCALE, ecf.z * SCALE, -ecf.y * SCALE);
      dummy.scale.setScalar(i === hoveredIndex ? CONFIG.hoverScale : isFilteredOut(i) ? 0.7 : 1);
      dummy.updateMatrix();
      satMesh.setMatrixAt(i, dummy.matrix);
      const lat = geo.latitude * RAD2DEG, lon = wrapLon(geo.longitude * RAD2DEG);
      sat.live = {
        altitudeKm: geo.height,
        velocityKmS: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
        lat, lon
      };
      const mp = llToXY(lat, lon);
      mapSatDots[i].setAttribute("cx", mp.x); mapSatDots[i].setAttribute("cy", mp.y);
      mapSatDots[i].setAttribute("class", "map2d-dot" + (i === selectedIndex ? " map2d-dot--selected" : ""));
      mapSatDots[i].style.opacity = isFilteredOut(i) ? "0.25" : "";
    });
    satMesh.instanceMatrix.needsUpdate = true;
    if (selectedIndex !== -1) {
      const sat = sats[selectedIndex];
      renderSelectedSatellite(sat);
      drawTrajectory(sat, now);
      const d = buildGroundTrackPath(sat, now);
      ui.mapTrack.setAttribute("d", d);
      ui.mapSwath.setAttribute("d", d);
      ui.mapSwath.style.strokeWidth = swathStrokePx(sat) + "px";
      ensurePass(now);
    }
    renderConjunctions();
    syncLighting(now);
  }

  let lastSlow = 0;
  function renderAll() {
    renderWeather();
    renderCatalogWx();
    renderPass();
  }
  function slowTick(now) {
    // weather + model texture refresh, a few times a second at most
    renderAll();
    const realSincePaint = performance.now() - modelPaintedAt;
    if (cloudMesh.visible && Math.abs(now.getTime() - modelTexTime) > CONFIG.modelTexRefreshSimMin * 60000 && realSincePaint > 1500) paintModelClouds(now);
    if (selectedIndex !== -1) maybeFetchBelow(sats[selectedIndex]);
    maybeFetchCatalog();
    maybeFetchStation();
  }

  /* ================================================================
   * Picking
   * ================================================================ */
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function getIntersectedInstance(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(satMesh);
    return hits.length > 0 ? hits[0].instanceId : -1;
  }
  renderer.domElement.addEventListener("pointermove", (event) => {
    const id = getIntersectedInstance(event);
    if (id !== hoveredIndex) {
      hoveredIndex = id;
      renderer.domElement.style.cursor = id !== -1 ? CONFIG.hoverCursor : "default";
      resetInstanceColors();
    }
  });
  renderer.domElement.addEventListener("click", (event) => {
    const id = getIntersectedInstance(event);
    if (id !== -1) selectSatellite(id);
  });

  function selectSatellite(i) {
    selectedIndex = i;
    currentPass = null;
    resetInstanceColors();
    syncCatalogActive();
    updateSatellitePositions();
    renderAll();
    if (sats[i].live) maybeFetchBelow(sats[i]);
  }

  /* ================================================================
   * Mode + clock controls
   * ================================================================ */
  const modeBtns = Array.from(document.querySelectorAll(".segmented__btn"));
  const speedBtns = Array.from(document.querySelectorAll(".speed-btn"));
  function setSpeedUI(speed) {
    speedBtns.forEach((b) => {
      const on = Number(b.dataset.speed) === speed;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  function setMode(mode) {
    if (mode === clock.mode) return;
    if (mode === "sim") {
      clock.anchorReal = Date.now(); clock.anchorSim = Date.now();
      clock.mode = "sim"; clock.speed = CONFIG.defaultSimSpeed; clock.paused = false;
      setSpeedUI(clock.speed);
      ui.simPause.textContent = "Pause";
    } else {
      clock.mode = "live";
      if (live.ok === false) { live.ok = null; live.warned = false; } // try the live sources again
    }
    root.dataset.mode = mode;
    ui.simControls.hidden = mode !== "sim";
    modeBtns.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    currentPass = null;
    modelTexTime = -Infinity; modelPaintedAt = -Infinity;
    syncWeatherOverlay();
    updateSatellitePositions();
    slowTick(clock.now());
  }
  modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  speedBtns.forEach((b) => b.addEventListener("click", () => { clock.setSpeed(Number(b.dataset.speed)); setSpeedUI(clock.speed); }));
  ui.simPause.addEventListener("click", () => {
    clock.setPaused(!clock.paused);
    ui.simPause.textContent = clock.paused ? "Resume" : "Pause";
  });
  ui.simNow.addEventListener("click", () => { clock.jumpToNow(); currentPass = null; modelTexTime = -Infinity; modelPaintedAt = -Infinity; updateSatellitePositions(); });

  function renderClock(now) {
    ui.clockUtc.textContent = now.toISOString().slice(11, 19);
    ui.clockDate.textContent = now.toISOString().slice(0, 10) + " UTC" +
      (clock.mode === "sim" ? (clock.paused ? " · paused" : " · " + clock.speed + "×") : "");
  }

  /* ================================================================
   * Live TLE update (CelesTrak)
   * ================================================================ */
  async function fetchLatestTLEs() {
    ui.updateBtn.textContent = "Updating…"; ui.updateBtn.disabled = true;
    try {
      const results = await Promise.all(SATELLITES.map(async (sat) => {
        const res = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=" + sat.noradId + "&FORMAT=TLE");
        if (!res.ok) throw new Error("Fetch failed for " + sat.name);
        const lines = (await res.text()).trim().split("\n").map((l) => l.trim()).filter(Boolean);
        const line1 = lines.find((l) => l.startsWith("1 ")), line2 = lines.find((l) => l.startsWith("2 "));
        if (!line1 || !line2) throw new Error("Malformed TLE for " + sat.name);
        return { ...sat, tle1: line1, tle2: line2 };
      }));
      sats = buildSatrecs(results);
      tleSource = "celestrak";
      currentPass = null;
      buildCatalog();
      syncCatalogActive();
      resetInstanceColors();
      updateSatellitePositions();
      renderAll();
      ui.lastUpdated.textContent = "CelesTrak · " + hhmm(new Date());
      ui.updateBtn.textContent = "Update TLEs";
    } catch (err) {
      console.error("[OrbitalWatch] TLE update failed:", err);
      ui.lastUpdated.textContent = "Update failed · showing last TLEs";
      ui.updateBtn.textContent = "Retry";
      toast("CelesTrak couldn't be reached, so the last orbital elements are still in use. Try again in a minute; CelesTrak rate-limits repeated requests.");
    } finally {
      ui.updateBtn.disabled = false;
    }
  }
  ui.updateBtn.addEventListener("click", fetchLatestTLEs);

  /* ================================================================
   * Resize + render loop
   * ================================================================ */
  function handleResize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    if (selectedIndex !== -1) ui.mapSwath.style.strokeWidth = swathStrokePx(sats[selectedIndex]) + "px";
  }
  if (window.ResizeObserver) new ResizeObserver(handleResize).observe(container);
  else window.addEventListener("resize", handleResize);

  let lastPropagation = 0, lastClock = 0;
  function animate(ts) {
    requestAnimationFrame(animate);
    const interval = clock.mode === "sim" && !clock.paused && clock.speed > 1 ? CONFIG.simPropagationIntervalMs : CONFIG.propagationIntervalMs;
    if (!lastPropagation || ts - lastPropagation > interval) { updateSatellitePositions(); lastPropagation = ts; }
    if (ts - lastClock > 200) { renderClock(clock.now()); lastClock = ts; }
    if (ts - lastSlow > 500) { slowTick(clock.now()); lastSlow = ts; }
    controls.update();
    renderer.render(scene, camera);
  }

  buildCatalog();
  syncWeatherOverlay();
  updateSatellitePositions();
  paintModelClouds(clock.now());
  selectSatellite(0);
  requestAnimationFrame(animate);
})();
