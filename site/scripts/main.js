/* main.js: wiring + animations. Depends on i18n.js + theme.js globals. */
function setupThemeButton() {
  var btn = document.querySelector("[data-theme-toggle]");
  if (btn && window.TM_theme) btn.addEventListener("click", function () { window.TM_theme.toggle(); });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function () { if (window.TM_theme) window.TM_theme.reflect(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  if (window.TM_theme) window.TM_theme.reflect();
}

function formatToken(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

function countUp(el) {
  var target = parseFloat(el.getAttribute("data-count"));
  if (isNaN(target)) return;
  if (reducedMotion()) { el.textContent = formatToken(target); return; }
  var start = null, dur = 1100;
  function frame(ts) {
    if (start === null) start = ts;
    var p = Math.min((ts - start) / dur, 1);
    var eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatToken(target * eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function setupObservers() {
  var counters = document.querySelectorAll("[data-count]");
  var reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    for (var a = 0; a < counters.length; a++) counters[a].textContent = formatToken(parseFloat(counters[a].getAttribute("data-count")) || 0);
    for (var c = 0; c < reveals.length; c++) reveals[c].classList.add("is-visible");
    return;
  }
  document.documentElement.classList.add("js");
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e.isIntersecting) continue;
      var t = e.target;
      if (t.classList.contains("reveal")) t.classList.add("is-visible");
      if (t.hasAttribute("data-count")) countUp(t);
      io.unobserve(t);
    }
  }, { threshold: 0.2 });
  for (var x = 0; x < reveals.length; x++) io.observe(reveals[x]);
  for (var y = 0; y < counters.length; y++) io.observe(counters[y]);
}

/* Discord Rich Presence elapsed timer: counts up from the app's first release
   (2026-05-19), formatted HH:MM:SS with hours unbounded, like Discord shows it. */
function setupDiscordClock() {
  var el = document.getElementById("d-elapsed");
  if (!el) return;
  var since = Date.UTC(2026, 4, 19, 0, 0, 0); // month is 0-based: 4 = May
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function tick() {
    var s = Math.max(0, Math.floor((Date.now() - since) / 1000));
    el.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
  }
  tick();
  if (!reducedMotion()) setInterval(tick, 1000);
}

/* the session card swaps between the detail page and the session list:
   ‹ sessions opens the list, tapping a list row returns to the detail. */
function setupSessionNav() {
  var root = document.querySelector(".tm-sessions");
  if (!root) return;
  var back = root.querySelector(".tm-back");
  if (back) back.addEventListener("click", function () { root.setAttribute("data-view", "list"); });
  var items = root.querySelectorAll(".tm-litem");
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener("click", function () { root.setAttribute("data-view", "detail"); });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  setupLanguageButtons();
  applyLanguage(preferredLanguage());
  setupThemeButton();
  setupObservers();
  setupDiscordClock();
  setupSessionNav();
});
