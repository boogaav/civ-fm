/* CIV FM — analytics. One line of booga-sdk (v1.js, loaded before this
   file) counts page views per anonymous visitor id. This file adds what the
   SDK does not know: which button was clicked on which page, and a few
   events the globe raises itself (point set, channel tuned, station played,
   card shared). Nothing personal is sent: no names, no location beyond the
   country of a point the visitor chose to click, no IP on our side. */
(function () {
  const t = (name, props) => { try { window.booga && window.booga.track(name, props); } catch (e) {} };
  window.civTrack = t;

  // every click on a button, link, select or dial element becomes
  // "click:<label>" so the dashboard lists buttons by name
  const label = (el) =>
    (el.getAttribute("aria-label") || el.dataset.ch || el.dataset.sub || el.dataset.f || el.id || el.textContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 48);
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("button, a, [role=button], .chan, select, summary");
    if (!el) return;
    const l = label(el);
    if (!l) return;
    const props = { page: location.pathname };
    if (el.id) props.id = el.id;
    if (el.dataset.ch) props.channel = el.dataset.ch;
    if (el.dataset.sub) props.sub = el.dataset.sub;
    if (el.tagName === "A" && el.getAttribute("href")) props.href = el.getAttribute("href").slice(0, 120);
    if (el.closest(".rlist")) props.kind = "station";
    t("click:" + l, props);
  }, true);

  // selects: the chosen value, not just the click
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.tagName !== "SELECT") return;
    t("select:" + (el.id || el.getAttribute("aria-label") || "select"), { value: String(el.value).slice(0, 48), page: location.pathname });
  }, true);

  // the globe: a point set on the map is the one interaction that is not a click on a control
  if (typeof map !== "undefined" && map && typeof map.on === "function") {
    map.on("click", (e) => t("globe_click", { lat: +e.lngLat.lat.toFixed(1), lng: +e.lngLat.lng.toFixed(1), channel: window.state && state.channel }));
  }
})();
