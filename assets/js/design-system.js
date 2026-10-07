/* Orbital Watch — design system page
 * Renders the token sections from window.OW_TOKENS (assets/js/tokens.js),
 * so anything added to tokens/tokens.json shows up here after a rebuild. */
(function () {
  "use strict";

  const data = window.OW_TOKENS;
  if (!data || !Array.isArray(data.list)) {
    document.querySelectorAll("[data-ds]").forEach((el) => {
      el.textContent = "Token data missing — run `npm run build:tokens` to generate assets/js/tokens.js.";
    });
    return;
  }

  // Groups with a dedicated section; everything else lands in the table at the bottom.
  const KNOWN = ["palette", "color", "status", "wx", "font", "fw", "fs", "tracking", "space", "radius"];
  const tokens = data.list;
  const byGroup = (g) => tokens.filter((t) => t.group === g);
  const others = tokens.filter((t) => !KNOWN.includes(t.group));

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const cssVar = (t) => "var(--" + t.name + ")";
  const valueLabel = (t) => (t.alias ? "{" + t.alias + "} → " : "") + t.value;
  function mount(key, nodes) {
    const host = document.querySelector('[data-ds="' + key + '"]');
    if (host) nodes.forEach((n) => host.appendChild(n));
  }

  // Color swatches (palette, semantic, status, weather)
  function swatch(t) {
    const s = el("div", "ds-swatch");
    const chip = el("div", "ds-swatch-color");
    const fill = el("i");
    fill.style.background = cssVar(t);
    chip.appendChild(fill);
    const meta = el("div", "ds-swatch-meta");
    meta.append(el("span", "ds-swatch-name", "--" + t.name), el("span", "ds-swatch-value", valueLabel(t)));
    if (t.description) meta.append(el("span", "ds-swatch-desc", t.description));
    s.append(chip, meta);
    return s;
  }
  ["palette", "color", "status", "wx"].forEach((g) => mount(g, byGroup(g).map(swatch)));

  // Font families
  mount("font", byGroup("font").map((t) => {
    const card = el("div", "ds-font-card");
    const glyphs = el("div", "ds-font-card__glyphs", t.name === "font-condensed" ? "TARGET LOCK" : "Aa 705.2 km");
    glyphs.style.fontFamily = cssVar(t);
    if (t.name === "font-condensed") { glyphs.style.fontWeight = "600"; glyphs.style.letterSpacing = "0.14em"; glyphs.style.fontSize = "26px"; }
    card.append(glyphs, el("span", "ds-font-card__name", "--" + t.name + " · " + t.value.split(",")[0].replace(/'/g, "")), el("span", "ds-font-card__use", t.description));
    return card;
  }));

  // Type scale
  mount("fs", byGroup("fs").map((t) => {
    const row = el("div", "ds-type-row");
    const sample = el("span", "ds-type-sample", t.description || "The quick brown fox");
    sample.style.fontSize = cssVar(t);
    sample.style.fontFamily = "var(--font-mono)";
    row.append(el("span", "ds-type-label", "--" + t.name + " / " + t.value), sample);
    return row;
  }));

  // Weights and tracking
  mount("fw", byGroup("fw").map((t) => {
    const row = el("div", "ds-type-row");
    const sample = el("span", "ds-type-sample", "LANDSAT 9 · 7.51 km/s");
    sample.style.fontWeight = cssVar(t);
    sample.style.fontFamily = "var(--font-mono)";
    row.append(el("span", "ds-type-label", "--" + t.name + " / " + t.value), sample);
    return row;
  }));
  mount("tracking", byGroup("tracking").map((t) => {
    const row = el("div", "ds-type-row");
    const sample = el("span", "ds-type-sample", t.description || "LETTER SPACING");
    sample.style.letterSpacing = cssVar(t);
    sample.style.fontFamily = "var(--font-condensed)";
    sample.style.fontWeight = "600";
    sample.style.textTransform = "uppercase";
    row.append(el("span", "ds-type-label", "--" + t.name + " / " + t.value), sample);
    return row;
  }));

  // Spacing
  mount("space", byGroup("space").map((t) => {
    const row = el("div", "ds-space-row");
    const bar = el("span", "ds-space-bar");
    bar.style.width = cssVar(t);
    row.append(el("span", "ds-type-label", "--" + t.name + " / " + t.value), bar);
    return row;
  }));

  // Radius
  mount("radius", byGroup("radius").map((t) => {
    const sample = el("div", "ds-radius-sample");
    sample.style.borderRadius = cssVar(t);
    sample.append(el("span", null, "--" + t.name + " / " + t.value));
    sample.title = t.description || "";
    return sample;
  }));

  // Everything else (glass, shadow, layout, z, motion, and any new groups), grouped
  let lastGroup = null;
  const rows = [];
  others.forEach((t) => {
    if (t.group !== lastGroup) { rows.push(el("div", "ds-token-group", t.group)); lastGroup = t.group; }
    const row = el("div", "ds-token-row");
    row.append(
      el("span", "ds-type-label", "--" + t.name),
      el("span", "ds-token-value", valueLabel(t)),
      el("span", "ds-token-desc", t.description || "")
    );
    rows.push(row);
  });
  mount("other", rows);

  // Specimen data colors: cloud-cover ramp from the wx tokens, same math as the app
  const v = data.values;
  const ramp = ["wx-clear-rgb", "wx-partly-rgb", "wx-overcast-rgb"].map((k) => (v[k] || "0, 0, 0").split(",").map(Number));
  function cloudColor(pct) {
    const t = Math.max(0, Math.min(1, pct / 100)) * 2, i = Math.min(1, Math.floor(t)), f = t - i;
    const c = ramp[i].map((a, k) => Math.round(a + (ramp[i + 1][k] - a) * f));
    return "rgb(" + c.join(",") + ")";
  }
  document.querySelectorAll("[data-cc]").forEach((n) => {
    const pct = Number(n.dataset.cc);
    n.style.background = cloudColor(pct);
    n.style.width = Math.max(4, pct) + "%";
  });
  document.querySelectorAll("[data-cc-stroke]").forEach((n) => {
    const pct = Number(n.dataset.ccStroke);
    n.style.stroke = cloudColor(pct);
    n.style.strokeDashoffset = String(169.6 * (1 - pct / 100));
  });
  const strip = document.querySelector("[data-ds-strip]");
  if (strip) [8, 12, 22, 35, 51, 72, 88, 96, 90, 64, 40, 26].forEach((pct, k) => {
    const c = el("span");
    c.style.background = cloudColor(pct);
    if (k > 8) c.className = "is-night";
    c.title = pct + "% cloud";
    strip.appendChild(c);
  });
})();
