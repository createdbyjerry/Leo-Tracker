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

  const KNOWN = ["color", "font", "fs", "space", "radius"];
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

  // Color
  mount("color", byGroup("color").map((t) => {
    const swatch = el("div", "ds-swatch");
    const chip = el("div", "ds-swatch-color");
    chip.style.background = cssVar(t);
    const meta = el("div", "ds-swatch-meta");
    meta.append(el("span", "ds-swatch-name", "--" + t.name), el("span", "ds-swatch-value", valueLabel(t)));
    if (t.description) meta.append(el("span", "ds-swatch-desc", t.description));
    swatch.append(chip, meta);
    return swatch;
  }));

  // Type scale
  mount("fs", byGroup("fs").map((t) => {
    const row = el("div", "ds-type-row");
    const sample = el("span", "ds-type-sample", t.description || "The quick brown fox");
    sample.style.fontSize = cssVar(t);
    row.append(el("span", "ds-type-label", "--" + t.name + " / " + t.value), sample);
    return row;
  }));

  // Font families
  mount("font", byGroup("font").map((t) => {
    const row = el("div");
    const sample = el("span", null, t.value.split(",")[0].replace(/'/g, "") + (t.description ? " — " + t.description : ""));
    sample.style.fontFamily = cssVar(t);
    row.append(el("span", "ds-type-label", "--" + t.name), sample);
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

  // Everything else (glass, shadow, layout, motion, and any new groups)
  mount("other", others.map((t) => {
    const row = el("div", "ds-token-row");
    row.append(
      el("span", "ds-type-label", "--" + t.name),
      el("span", "ds-token-value", valueLabel(t)),
      el("span", "ds-token-desc", t.description || "")
    );
    return row;
  }));
})();
