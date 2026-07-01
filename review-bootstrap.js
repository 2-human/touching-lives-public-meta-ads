/*
 * review-bootstrap.js — composed 2026-07-01 from library/features/review-widget/
 *
 * Inert-by-default loader. Two responsibilities:
 *
 *   1. When ?review=1 is ABSENT: inject a floating entry button
 *      (.review-toggle-btn) with a self-contained inline <style> block.
 *      Clicking it appends ?review=1 to the URL and hard-reloads.
 *
 *   2. When ?review=1 is PRESENT: set <html data-review-mode="on">, load
 *      review-mode.css, and load review-mode.js as an ES module.
 *
 * Loads no CSS and no JS module on the inert path. Opens no RTDB connection
 * on the inert path. Per FEATURE.md §"Composition contract".
 */
(function () {
  "use strict";

  var reviewActive = (function () {
    try {
      return new URLSearchParams(window.location.search).get("review") === "1";
    } catch (e) {
      return false;
    }
  })();

  // ------------------------------------------------------------------
  // Resolve labels from the project's config global. Falls back to
  // English defaults if config is missing or unset.
  // ------------------------------------------------------------------
  function resolveLabels() {
    var cfg = window.TOUCHING_LIVES_CONTACT_CONFIG || {};
    var labels = cfg.REVIEW_LABELS || {};
    return {
      toggleButton: labels.entry_button || labels.toggleButton || "Comments",
      toggleButtonTitle:
        labels.entry_button_title ||
        labels.toggleButtonTitle ||
        "Open comment review mode",
    };
  }

  // ------------------------------------------------------------------
  // Inert-page entry button per inert-entry-button.md.
  // Runs on the inert path only; no-op in active mode.
  // ------------------------------------------------------------------
  function injectEntryButton() {
    if (reviewActive) return;
    if (document.querySelector(".review-toggle-btn")) return; // idempotent
    if (!document.body) return;

    var labels = resolveLabels();

    var style = document.createElement("style");
    style.setAttribute("data-review-bootstrap-style", "");
    style.textContent =
      ".review-toggle-btn{" +
      "position:fixed;bottom:20px;right:20px;z-index:9990;" +
      "background:#1f3a5f;color:#f8fafc;border:none;padding:12px 20px;" +
      "border-radius:999px;cursor:pointer;" +
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;" +
      "font-size:13px;font-weight:600;letter-spacing:.04em;" +
      "box-shadow:0 4px 14px rgba(31,32,36,.18);" +
      "transition:transform .15s,box-shadow .15s,background .15s;" +
      "display:inline-flex;align-items:center;gap:8px;" +
      "}" +
      ".review-toggle-btn:hover{transform:translateY(-1px);background:#142646;box-shadow:0 6px 20px rgba(31,32,36,.22);}" +
      ".review-toggle-btn:active{transform:translateY(0);}" +
      ".review-toggle-btn::before{content:'\\1F4AC';font-size:14px;line-height:1;}" +
      "@media print{.review-toggle-btn{display:none;}}";
    document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-toggle-btn";
    btn.setAttribute("data-review-skip", "");
    btn.title = labels.toggleButtonTitle;
    btn.textContent = labels.toggleButton;

    btn.addEventListener("click", function () {
      var url = new URL(window.location.href);
      url.searchParams.set("review", "1");
      window.location.href = url.toString();
    });

    document.body.appendChild(btn);
  }

  // ------------------------------------------------------------------
  // Active-path loader. Sets the data attribute, loads CSS + JS module.
  // ------------------------------------------------------------------
  function activateReviewMode() {
    document.documentElement.setAttribute("data-review-mode", "on");

    // Resolve URLs relative to this bootstrap script's own location so it
    // works whether the host page is at /feed-preview.html or /details/*.
    var scriptEl = document.currentScript;
    var base;
    if (scriptEl && scriptEl.src) {
      base = scriptEl.src.replace(/[^/]*$/, "");
    } else {
      // Fallback: find any <script> tag pointing at review-bootstrap.js
      var all = document.getElementsByTagName("script");
      for (var i = 0; i < all.length; i++) {
        if (all[i].src && /review-bootstrap\.js(\?|$)/.test(all[i].src)) {
          base = all[i].src.replace(/[^/]*$/, "");
          break;
        }
      }
      if (!base) base = "";
    }

    // Load CSS.
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = base + "review-mode.css";
    link.setAttribute("data-review-mode-css", "");
    document.head.appendChild(link);

    // Load the ES module.
    var mod = document.createElement("script");
    mod.type = "module";
    mod.src = base + "review-mode.js";
    mod.setAttribute("data-review-mode-js", "");
    document.head.appendChild(mod);
  }

  // ------------------------------------------------------------------
  // Late-binding DOM ready guard
  // ------------------------------------------------------------------
  function boot() {
    if (reviewActive) {
      activateReviewMode();
    } else {
      injectEntryButton();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
