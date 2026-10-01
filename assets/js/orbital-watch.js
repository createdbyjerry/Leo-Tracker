/* Orbital Watch — satellite tracker widget
 * Requires (loaded before this file): three.js r128, OrbitControls, satellite.js 5, tokens.js */
(function () {
  "use strict";

  if (!window.THREE || !window.satellite) {
    console.error("[SatTracker] three.js or satellite.js failed to load.");
    return;
  }

  /* ---- Design tokens (generated from tokens/tokens.json) ---- */
  const TOKENS = (window.OW_TOKENS && window.OW_TOKENS.values) || {};
  const token = (name, fallback) => TOKENS[name] || fallback;

  /* ---- Config ---- */
  const CONFIG = {
    hoverScale: 1.6,
    hoverColor: token("accent-hover", "#ffffff"),
    defaultColor: token("accent-tracked", "#ff5533"),
    selectedColor: token("accent-selected", "#33ff88"),
    stationColor: token("accent-station", "#33ffee"),
    hoverCursor: "pointer",
    trajectoryColor: token("accent-selected", "#33ff88"),
    trajectoryOpacity: 0.6,
    trajectorySamples: 120,
    propagationIntervalMs: 1000,
    earthMode: "texture", // "texture" | "wireframe" | "solid"
    earthTextureUrl: "assets/img/earth_atmos_2048.jpg",
    earthColor: 0xffffff,
    earthBackgroundColor: null,
    earthWireframeDensity: 32,
    earthOpacity: 0.9,
    earthDoubleSided: true,
    conjunctionThresholdKm: 900,
    groundStation: { name: "SEATTLE, US", latDeg: 47.6062, lonDeg: -122.3321, altKm: 0.1 },
    passSearchHours: 48,
    passStepSec: 30
  };

  /* ---- Demo catalog (static TLEs; "Update Data" pulls live ones from CelesTrak) ---- */
  const SATELLITES = [
    { name: "LANDSAT 9", designation: "2021-088A", noradId: 49260,
      tle1: "1 49260U 21088A   24001.50000000  .00000200  00000-0  50000-4 0  9991",
      tle2: "2 49260  98.2200  50.0000 0001000  90.0000 270.1000 14.57100000100000" },
    { name: "LANDSAT 8", designation: "2013-008A", noradId: 39084,
      tle1: "1 39084U 13008A   24001.50000000  .00000180  00000-0  46000-4 0  9992",
      tle2: "2 39084  98.2100  55.0000 0001200  95.0000 265.0500 14.57108000560000" },
    { name: "SENTINEL-2A", designation: "2015-028A", noradId: 40697,
      tle1: "1 40697U 15028A   24001.50000000  .00000110  00000-0  30000-4 0  9993",
      tle2: "2 40697  98.5700  60.0000 0001300 100.0000 260.0000 14.30820000450000" },
    { name: "SENTINEL-2B", designation: "2017-013A", noradId: 42063,
      tle1: "1 42063U 17013A   24001.50000000  .00000105  00000-0  29000-4 0  9994",
      tle2: "2 42063  98.5600  61.0000 0001250 101.0000 259.0000 14.30822000380000" },
    { name: "SENTINEL-1A", designation: "2014-016A", noradId: 39634,
      tle1: "1 39634U 14016A   24001.50000000  .00000130  00000-0  33000-4 0  9995",
      tle2: "2 39634  98.1800  45.0000 0001100  80.0000 280.2000 14.59200000510000" },
    { name: "TERRA", designation: "1999-068A", noradId: 25994,
      tle1: "1 25994U 99068A   24001.50000000  .00000090  00000-0  24000-4 0  9996",
      tle2: "2 25994  98.2000  40.0000 0001500  70.0000 290.3000 14.57190000 8100" },
    { name: "AQUA", designation: "2002-022A", noradId: 27424,
      tle1: "1 27424U 02022A   24001.50000000  .00000095  00000-0  25000-4 0  9997",
      tle2: "2 27424  98.2000  38.0000 0001600  72.0000 288.1000 14.57192000 9200" },
    { name: "SUOMI NPP", designation: "2011-061A", noradId: 37849,
      tle1: "1 37849U 11061A   24001.50000000  .00000100  00000-0  27000-4 0  9998",
      tle2: "2 37849  98.7300  65.0000 0001400 110.0000 250.4000 14.19560000450000" },
    { name: "NOAA-20", designation: "2017-073A", noradId: 43013,
      tle1: "1 43013U 17073A   24001.50000000  .00000098  00000-0  26000-4 0  9999",
      tle2: "2 43013  98.7100  66.0000 0001450 112.0000 248.9000 14.19570000330000" },
    { name: "ICESAT-2", designation: "2018-078A", noradId: 43613,
      tle1: "1 43613U 18078A   24001.50000000  .00000085  00000-0  22000-4 0  9990",
      tle2: "2 43613  92.0100  30.0000 0001000  60.0000 300.5000 15.23100000280000" }
  ];

  const EARTH_RADIUS_KM = 6371;
  const SCENE_EARTH_RADIUS = 5;
  const SCALE = SCENE_EARTH_RADIUS / EARTH_RADIUS_KM;
  const MU = 398600.4418;
  const DEG2RAD = Math.PI / 180;

  const FIELDS = [
    ["altitude", "Altitude"], ["velocity", "Velocity"], ["lat", "Latitude"], ["lon", "Longitude"],
    ["inclination", "Inclination"], ["period", "Period"], ["apogee", "Apogee"], ["perigee", "Perigee"],
    ["eccentricity", "Eccentricity"], ["raan", "RAAN"], ["argp", "Arg. of Perigee"], ["ma", "Mean Anomaly"],
    ["epoch", "Epoch (UTC)"], ["status", "Status"],
    ["aos", "Next AOS"], ["maxel", "Max Elev."], ["los", "Next LOS"], ["passdur", "Pass Duration"]
  ];

  /* ---- DOM ---- */
  const container = document.getElementById("canvas-container");
  if (!container) { console.error("[SatTracker] #canvas-container not found."); return; }
  const fieldGrid = document.getElementById("field-grid");
  const panelEls = {
    count: document.getElementById("cat-count"),
    hint: document.getElementById("sat-hint"),
    readout: document.getElementById("hud-readout"),
    name: document.getElementById("sat-name"),
    designation: document.getElementById("sat-designation"),
    station: document.getElementById("station-line"),
    lastUpdated: document.getElementById("last-updated"),
    values: {}
  };
  FIELDS.forEach(([key, label]) => {
    const field = document.createElement("div");
    field.className = "hud-field";
    field.innerHTML = '<span class="hud-field__label">' + label + '</span><span class="hud-field__value" id="sat-' + key + '">—</span>';
    fieldGrid.appendChild(field);
    panelEls.values[key] = field.querySelector(".hud-field__value");
  });
  const updateBtn = document.getElementById("update-tle-btn");
  const catalogList = document.getElementById("catalog-list");
  const conjunctionListEl = document.getElementById("conjunction-list");
  const mapEl = document.getElementById("map2d");
  const mapExpandBtn = document.getElementById("map2d-expand-btn");
  const mapSvg = document.getElementById("map2d-svg");
  const mapTrackPath = document.getElementById("map2d-track");

  if (panelEls.count) panelEls.count.textContent = SATELLITES.length + " objects";
  if (panelEls.lastUpdated) panelEls.lastUpdated.textContent = "Static demo data";
  if (panelEls.station) panelEls.station.textContent = "Ground station: " + CONFIG.groundStation.name;

  const observerGd = {
    longitude: CONFIG.groundStation.lonDeg * DEG2RAD,
    latitude: CONFIG.groundStation.latDeg * DEG2RAD,
    height: CONFIG.groundStation.altKm
  };
  let sats = [], selectedIndex = -1, hoveredIndex = -1;

  /* ---- Orbital helpers ---- */
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
      raanDeg: (satrec.nodeo * 180) / Math.PI, argpDeg: (satrec.argpo * 180) / Math.PI,
      maDeg: (satrec.mo * 180) / Math.PI, epoch: epochDate(satrec)
    };
  }
  function buildSatrecs(data) {
    return data.map((sat) => {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      return { ...sat, satrec, inclinationDeg: (satrec.inclo * 180) / Math.PI, ...deriveElements(satrec) };
    });
  }
  sats = buildSatrecs(SATELLITES);

  /* ---- Catalog ---- */
  function buildCatalog() {
    catalogList.innerHTML = "";
    sats.forEach((sat, i) => {
      const row = document.createElement("div");
      row.className = "catalog-row";
      row.dataset.index = i;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.innerHTML = '<span class="dot dot--tracked"></span><span class="catalog-row__text"><span class="catalog-row__name">' +
        sat.name + '</span><span class="catalog-row__id">NORAD ' + sat.noradId + ' · ' + sat.designation + '</span></span>';
      row.addEventListener("click", () => selectSatellite(i));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectSatellite(i); }
      });
      catalogList.appendChild(row);
    });
  }
  buildCatalog();
  function syncCatalogActive() {
    catalogList.querySelectorAll(".catalog-row").forEach((row) => {
      const active = Number(row.dataset.index) === selectedIndex;
      row.classList.toggle("is-active", active);
      row.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  if (mapExpandBtn) mapExpandBtn.addEventListener("click", () => {
    const expanded = mapEl.classList.toggle("is-expanded");
    mapExpandBtn.textContent = expanded ? "Collapse" : "Expand";
    mapExpandBtn.title = expanded ? "Collapse" : "Expand";
    mapExpandBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  });

  /* ---- 2D ground-track map ---- */
  const MAP_NS = "http://www.w3.org/2000/svg";
  function makeMapCircle(r, cls) {
    const c = document.createElementNS(MAP_NS, "circle");
    c.setAttribute("r", r); c.setAttribute("class", cls);
    mapSvg.appendChild(c);
    return c;
  }
  const mapSatDots = sats.map(() => makeMapCircle(1.3, "map2d-dot"));
  const mapStationDot = makeMapCircle(1.4, "map2d-dot map2d-dot--station");
  const stationXY = llToXY(CONFIG.groundStation.latDeg, CONFIG.groundStation.lonDeg);
  mapStationDot.setAttribute("cx", stationXY.x); mapStationDot.setAttribute("cy", stationXY.y);

  function buildGroundTrackPath(sat) {
    const satrec = sat.satrec, periodMinutes = (2 * Math.PI) / satrec.no, now = new Date();
    let d = "", prevX = null;
    for (let i = 0; i <= CONFIG.trajectorySamples; i++) {
      const t = new Date(now.getTime() + (i / CONFIG.trajectorySamples) * periodMinutes * 60000);
      const gmst = satellite.gstime(t), pv = satellite.propagate(satrec, t);
      if (!pv.position) continue;
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      const lonDeg = (((geo.longitude * 180) / Math.PI + 540) % 360) - 180, latDeg = (geo.latitude * 180) / Math.PI;
      const p = llToXY(latDeg, lonDeg);
      d += (prevX === null || Math.abs(p.x - prevX) > 50 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
      prevX = p.x;
    }
    return d;
  }

  /* ---- Three.js scene ---- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 6, 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.insertBefore(renderer.domElement, container.firstChild);
  Object.assign(renderer.domElement.style, { pointerEvents: "auto", position: "absolute", inset: "0", zIndex: "1" });

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 8; controls.maxDistance = 40;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(20, 10, 10);
  scene.add(sunLight);
  if (CONFIG.earthBackgroundColor !== null) scene.background = new THREE.Color(CONFIG.earthBackgroundColor);

  let earthMesh;
  if (CONFIG.earthMode === "texture") {
    const earthTexture = new THREE.TextureLoader().load(CONFIG.earthTextureUrl);
    earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SCENE_EARTH_RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({ map: earthTexture, transparent: true, opacity: CONFIG.earthOpacity, side: CONFIG.earthDoubleSided ? THREE.DoubleSide : THREE.FrontSide })
    );
  } else if (CONFIG.earthMode === "wireframe") {
    earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SCENE_EARTH_RADIUS, CONFIG.earthWireframeDensity, CONFIG.earthWireframeDensity),
      new THREE.MeshBasicMaterial({ color: CONFIG.earthColor, wireframe: true, transparent: CONFIG.earthOpacity < 1, opacity: CONFIG.earthOpacity })
    );
  } else {
    earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SCENE_EARTH_RADIUS, 64, 64),
      new THREE.MeshBasicMaterial({ color: CONFIG.earthColor, transparent: CONFIG.earthOpacity < 1, opacity: CONFIG.earthOpacity })
    );
  }
  scene.add(earthMesh);

  const stationEcf = satellite.geodeticToEcf(observerGd);
  const stationMarker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshBasicMaterial({ color: CONFIG.stationColor }));
  stationMarker.position.set(stationEcf.x * SCALE, stationEcf.z * SCALE, -stationEcf.y * SCALE);
  scene.add(stationMarker);

  const satGeo = new THREE.SphereGeometry(0.09, 12, 12);
  const satMat = new THREE.MeshBasicMaterial({ color: CONFIG.defaultColor });
  const satMesh = new THREE.InstancedMesh(satGeo, satMat, sats.length);
  satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sats.length * 3), 3);
  scene.add(satMesh);

  const dummy = new THREE.Object3D();
  const baseColor = new THREE.Color(CONFIG.defaultColor);
  const hoverColorObj = new THREE.Color(CONFIG.hoverColor);
  const selectedColorObj = new THREE.Color(CONFIG.selectedColor);
  function resetInstanceColors() {
    for (let i = 0; i < sats.length; i++) satMesh.setColorAt(i, i === selectedIndex ? selectedColorObj : baseColor);
    satMesh.instanceColor.needsUpdate = true;
  }
  resetInstanceColors();

  /* ---- Orbit trajectory ---- */
  let trajectoryLine = null;
  const trajectoryMat = new THREE.LineBasicMaterial({ color: CONFIG.trajectoryColor, transparent: true, opacity: CONFIG.trajectoryOpacity });
  function clearTrajectory() {
    if (trajectoryLine) { scene.remove(trajectoryLine); trajectoryLine.geometry.dispose(); trajectoryLine = null; }
  }
  function drawTrajectory(sat) {
    clearTrajectory();
    if (!sat) return;
    const satrec = sat.satrec, periodMinutes = (2 * Math.PI) / satrec.no, now = new Date(), points = [];
    for (let i = 0; i <= CONFIG.trajectorySamples; i++) {
      const t = new Date(now.getTime() + (i / CONFIG.trajectorySamples) * periodMinutes * 60000);
      const gmst = satellite.gstime(t), pv = satellite.propagate(satrec, t);
      if (!pv.position) continue;
      const ecf = satellite.eciToEcf(pv.position, gmst);
      points.push(new THREE.Vector3(ecf.x * SCALE, ecf.z * SCALE, -ecf.y * SCALE));
    }
    trajectoryLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), trajectoryMat);
    scene.add(trajectoryLine);
  }

  /* ---- Conjunctions (simple instantaneous distance check, not a screening tool) ---- */
  function computeConjunctions() {
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
    return alerts.slice(0, 5);
  }
  function renderConjunctions() {
    const alerts = computeConjunctions();
    conjunctionListEl.innerHTML = alerts.length
      ? alerts.map((a) => '<div class="conj-row"><span class="conj-dot"></span>' + sats[a.i].name + ' ↔ ' + sats[a.j].name + '<strong>' + a.d.toFixed(0) + ' km</strong></div>').join("")
      : '<div class="conj-empty">No conjunctions detected</div>';
  }

  /* ---- Ground-station pass prediction ---- */
  function findNextPass(sat) {
    let aos = null, los = null, maxElDeg = -90, prevElOk = false;
    const start = Date.now();
    for (let s = 0; s <= CONFIG.passSearchHours * 3600; s += CONFIG.passStepSec) {
      const t = new Date(start + s * 1000);
      const gmst = satellite.gstime(t), pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const ecf = satellite.eciToEcf(pv.position, gmst);
      const look = satellite.ecfToLookAngles(observerGd, ecf);
      const elDeg = (look.elevation * 180) / Math.PI;
      if (aos === null) {
        if (elDeg > 0) { aos = t; maxElDeg = elDeg; prevElOk = true; }
      } else {
        if (elDeg > maxElDeg) maxElDeg = elDeg;
        if (elDeg <= 0 && prevElOk) { los = t; break; }
      }
    }
    return aos && los ? { aos, los, maxElDeg, durMin: (los - aos) / 60000 } : null;
  }
  function refreshPass(sat) {
    if (!sat) return;
    const v = panelEls.values, pass = findNextPass(sat);
    if (pass) {
      if (v.aos) v.aos.textContent = pass.aos.toISOString().slice(11, 16) + " UTC";
      if (v.los) v.los.textContent = pass.los.toISOString().slice(11, 16) + " UTC";
      if (v.maxel) v.maxel.textContent = pass.maxElDeg.toFixed(1) + "°";
      if (v.passdur) v.passdur.textContent = pass.durMin.toFixed(1) + " min";
    } else {
      ["aos", "los", "maxel", "passdur"].forEach((k) => { if (v[k]) v[k].textContent = "No pass <" + CONFIG.passSearchHours + "h"; });
    }
  }

  /* ---- Propagation loop ---- */
  function updateSatellitePositions() {
    const now = new Date(), gmst = satellite.gstime(now);
    sats.forEach((sat, i) => {
      const pv = satellite.propagate(sat.satrec, now);
      if (!pv.position) return;
      const ecf = satellite.eciToEcf(pv.position, gmst), geo = satellite.eciToGeodetic(pv.position, gmst);
      sat.ecfKm = { x: ecf.x, y: ecf.y, z: ecf.z };
      const x = ecf.x * SCALE, y = ecf.z * SCALE, z = -ecf.y * SCALE, scale = i === hoveredIndex ? CONFIG.hoverScale : 1;
      dummy.position.set(x, y, z); dummy.scale.setScalar(scale); dummy.updateMatrix();
      satMesh.setMatrixAt(i, dummy.matrix);
      const latDeg = (geo.latitude * 180) / Math.PI, lonDeg = (geo.longitude * 180) / Math.PI;
      sat.live = {
        altitudeKm: geo.height,
        velocityKmS: Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2),
        lat: latDeg, lon: lonDeg
      };
      const mp = llToXY(latDeg, lonDeg);
      mapSatDots[i].setAttribute("cx", mp.x); mapSatDots[i].setAttribute("cy", mp.y);
      mapSatDots[i].setAttribute("class", "map2d-dot" + (i === selectedIndex ? " map2d-dot--selected" : ""));
      if (i === selectedIndex) renderSelectedSatellite(sat);
    });
    satMesh.instanceMatrix.needsUpdate = true;
    if (selectedIndex !== -1) {
      drawTrajectory(sats[selectedIndex]);
      mapTrackPath.setAttribute("d", buildGroundTrackPath(sats[selectedIndex]));
    }
    renderConjunctions();
  }

  /* ---- Picking ---- */
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
      if (id !== -1 && id !== selectedIndex) { satMesh.setColorAt(id, hoverColorObj); satMesh.instanceColor.needsUpdate = true; }
    }
  });
  renderer.domElement.addEventListener("click", (event) => {
    const id = getIntersectedInstance(event);
    if (id !== -1) selectSatellite(id);
  });

  function selectSatellite(i) {
    selectedIndex = i;
    resetInstanceColors();
    syncCatalogActive();
    renderSelectedSatellite(sats[i]);
    drawTrajectory(sats[i]);
    refreshPass(sats[i]);
  }

  /* ---- Telemetry readout ---- */
  function fmt(n, d) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }
  function renderSelectedSatellite(sat) {
    if (!sat) return;
    if (panelEls.hint) panelEls.hint.style.display = "none";
    if (panelEls.readout) panelEls.readout.style.display = "block";
    if (panelEls.name) panelEls.name.textContent = sat.name;
    if (panelEls.designation) panelEls.designation.textContent = "Int'l Designator: " + sat.designation;
    const v = panelEls.values;
    if (v.inclination) v.inclination.textContent = fmt(sat.inclinationDeg, 2) + "°";
    if (v.period) v.period.textContent = fmt(sat.periodMin, 1) + " min";
    if (v.apogee) v.apogee.textContent = fmt(sat.apogeeKm, 0) + " km";
    if (v.perigee) v.perigee.textContent = fmt(sat.perigeeKm, 0) + " km";
    if (v.eccentricity) v.eccentricity.textContent = fmt(sat.eccentricity, 4);
    if (v.raan) v.raan.textContent = fmt(sat.raanDeg, 2) + "°";
    if (v.argp) v.argp.textContent = fmt(sat.argpDeg, 2) + "°";
    if (v.ma) v.ma.textContent = fmt(sat.maDeg, 2) + "°";
    if (v.epoch) v.epoch.textContent = sat.epoch.toISOString().slice(0, 16).replace("T", " ");
    if (v.status) v.status.textContent = "Active";
    if (sat.live) {
      if (v.altitude) v.altitude.textContent = fmt(sat.live.altitudeKm, 1) + " km";
      if (v.velocity) v.velocity.textContent = fmt(sat.live.velocityKmS, 2) + " km/s";
      if (v.lat) v.lat.textContent = fmt(sat.live.lat, 2) + "°";
      if (v.lon) v.lon.textContent = fmt(sat.live.lon, 2) + "°";
    }
  }
  setInterval(() => { if (selectedIndex !== -1) refreshPass(sats[selectedIndex]); }, 30000);

  /* ---- Live TLE update (CelesTrak) ---- */
  async function fetchLatestTLEs() {
    if (updateBtn) { updateBtn.textContent = "Updating…"; updateBtn.disabled = true; }
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
      resetInstanceColors();
      buildCatalog();
      syncCatalogActive();
      updateSatellitePositions();
      if (selectedIndex !== -1) refreshPass(sats[selectedIndex]);
      if (panelEls.lastUpdated) panelEls.lastUpdated.textContent = "Updated " + new Date().toLocaleString();
      if (updateBtn) updateBtn.textContent = "Update Data";
    } catch (err) {
      console.error("[SatTracker] TLE update failed:", err);
      if (panelEls.lastUpdated) panelEls.lastUpdated.textContent = "Update failed — showing last known data";
      if (updateBtn) updateBtn.textContent = "Retry Update";
    } finally {
      if (updateBtn) updateBtn.disabled = false;
    }
  }
  if (updateBtn) { updateBtn.textContent = "Update Data"; updateBtn.addEventListener("click", fetchLatestTLEs); }

  /* ---- Resize + render loop ---- */
  function handleResize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }
  if (window.ResizeObserver) new ResizeObserver(handleResize).observe(container);
  else window.addEventListener("resize", handleResize);

  let lastPropagation = 0;
  function animate(timestamp) {
    requestAnimationFrame(animate);
    if (!lastPropagation || timestamp - lastPropagation > CONFIG.propagationIntervalMs) {
      updateSatellitePositions();
      lastPropagation = timestamp;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  updateSatellitePositions();
  selectSatellite(0);
  requestAnimationFrame(animate);
})();
