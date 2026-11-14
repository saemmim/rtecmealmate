/*
 * Shared theme loader (no toggle UI).
 * Load in <head>, without defer/async, so the theme is set before first paint.
 *
 * Priority: localStorage["rtec-dark-mode"] ("true" / "false") > OS preference.
 */
(function () {
    "use strict";

    var KEY = "rtec-dark-mode";
    var mql = window.matchMedia("(prefers-color-scheme: dark)");

    function readSaved() {
        try {
            var v = localStorage.getItem(KEY);
            if (v === "true") return true;
            if (v === "false") return false;
        } catch (e) { /* storage blocked */ }
        return null;
    }

    function apply(isDark) {
        var root = document.documentElement;
        root.classList.toggle("dark-mode", isDark);
        root.classList.toggle("light-mode", !isDark);
    }

    function sync() {
        var saved = readSaved();
        apply(saved !== null ? saved : mql.matches);
    }

    sync();

    // Another tab/page changed the toggle.
    window.addEventListener("storage", function (e) {
        if (e.key === KEY || e.key === null) sync();
    });

    // OS theme changed: follow it only when the user has no saved choice.
    function onOsChange() {
        if (readSaved() === null) sync();
    }
    if (mql.addEventListener) mql.addEventListener("change", onOsChange);
    else if (mql.addListener) mql.addListener(onOsChange);
})();
