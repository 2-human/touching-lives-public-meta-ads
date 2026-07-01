// public/meta-ads/contact-form.config.js
//
// Project input for the review-widget adoption. Read at composition time
// for code-generation parameters and at runtime for backend connection +
// user-facing labels.
//
// Convention per library/features/review-widget/FEATURE.md: the config
// global is named {PROJECT}_CONTACT_CONFIG. For touching-lives, that is
// TOUCHING_LIVES_CONTACT_CONFIG. The bootstrap script looks it up on
// window after this file is loaded.
//
// Shape adopted 2026-07-01 from glinda/public/method/contact-form.config.js.
// Firebase project values kept from the prior touching-lives config
// (touching-lives-84345, Spark plan, us-central1). Labels rewritten for
// the ad-review context. Behaviour keys copied from glinda:
//   commentLifecycleMode: 'feedback-only'
//   commentableContent:   'direct-text'
//   ANCHOR_TAGS_EXTRA:    ['label', 'blockquote', 'cite', 'figcaption', 'button']
//   chromeAnchored:       false
//
// Label keys follow the canonical inventory from the library components +
// feature-atomics. Only keys touching-lives wants different from the
// English defaults are listed; everything else falls through to
// DEFAULT_LABELS inside review-mode.js.

window.TOUCHING_LIVES_CONTACT_CONFIG = {

  // ============================================================
  // commentLifecycleMode — 'full' | 'feedback-only'
  // ============================================================
  // Per library/features/review-widget/comment-lifecycle.md §"Per-comment
  // actions in the sidebar". 'feedback-only' trims the in-UI button set so
  // reviewers leave comments (status: pending) and Claude / operator works
  // the RTDB directly to set status: applied or archived. The UI exposes
  // Edit + Delete on pending, Restore + Delete on applied/archived. The
  // group-footer bulk-archive button is suppressed in feedback-only mode.
  commentLifecycleMode: 'feedback-only',

  // ============================================================
  // ANCHOR_TAGS_EXTRA — additional tags to anchor beyond the canonical list
  // ============================================================
  // Per library/features/review-widget/anchor-extensibility.md
  // §"ANCHOR_TAGS_EXTRA — project-level tag-list extension". These five
  // additions cover common ad-preview surface elements:
  //   - label       form-field labels (any future contact-form surfaces)
  //   - blockquote  pull-quote / testimonial bodies
  //   - cite        attributions
  //   - figcaption  figure captions
  //   - button      CTA buttons — reviewers comment on copy
  //
  // Anti-pattern: never put 'div' here (every container becomes anchorable,
  // UX collapses). Use the per-element [data-comment-target] attribute on
  // specific wrapper divs instead.
  //
  // Note: rendered redundant while commentableContent === 'direct-text'
  // (which anchors any text-bearing element regardless of tag). Kept here
  // anyway so a flip back to 'allowlist' still covers these surfaces.
  ANCHOR_TAGS_EXTRA: ['label', 'blockquote', 'cite', 'figcaption', 'button'],

  // ============================================================
  // commentableContent — 'allowlist' | 'direct-text'
  // ============================================================
  // Per library/features/review-widget/commentable-everything.md.
  // 'allowlist' (default): iterate ANCHOR_TAGS ∪ ANCHOR_TAGS_EXTRA ∪
  //   [data-comment-target].
  // 'direct-text': anchor any element with direct text content >= 2 chars,
  //   filtered by NEVER_ANCHOR deny-list (form controls, SVG internals,
  //   void elements, etc.). Catches every text-bearing element including
  //   <a>, <button>, <label>, custom tags — reviewer expectation that
  //   "if there's text, I should be able to comment on it."
  commentableContent: 'direct-text',

  // ============================================================
  // chromeAnchored — boolean
  // ============================================================
  // Per library/features/review-widget/commentable-everything.md.
  // true: site chrome (nav, header[role="banner"], footer) is anchored
  //   with shared chrome-{tag}-{n} slugs (page-independent). Comments on
  //   chrome elements write page: '__chrome__' and surface on every page.
  // false (default): chrome skipped from anchoring.
  //
  // Ad-preview pages don't have real shared site chrome, so keep this off.
  chromeAnchored: false,

  // ============================================================
  // FIREBASE_CONFIG — touching-lives-84345 project (Spark plan, us-central1)
  // ============================================================
  // Realtime Database paths:
  //   /comments/{pushId}  — review-widget comments per features.review-widget.firebase-rtdb-adapter
  FIREBASE_CONFIG: {
    apiKey:            "AIzaSyBwf796wzoUojSh7uBmqa5leBWIFZo58vs",
    authDomain:        "touching-lives-84345.firebaseapp.com",
    databaseURL:       "https://touching-lives-84345-default-rtdb.firebaseio.com",
    projectId:         "touching-lives-84345",
    storageBucket:     "touching-lives-84345.firebasestorage.app",
    messagingSenderId: "604273986058",
    appId:             "1:604273986058:web:85cb3af64d45b5fa82adf3"
  },

  // ============================================================
  // REVIEW_LABELS
  // ============================================================
  // Overrides on top of DEFAULT_LABELS in review-mode.js. Unspecified
  // keys fall through to the English defaults.
  REVIEW_LABELS: {
    locale: "en",

    // Toggle controls (per inert-entry-button.md + components/toggle-button.md)
    // Shared label set: the inert-page entry button (bottom-right floating
    // pill) AND the mobile sidebar-collapse toggle use the same label keys.
    toggleButton: "Comments",
    toggleButtonTitle: "Open comment review mode",

    // Banner
    bannerText: "Ad review mode",
    bannerHint: "Hover any element to leave a comment.",

    // Sidebar
    sidebarTitle: "Comments",
    sidebarEmpty: "No comments yet. Hover any element to add one.",

    // Modal composer
    modalCommentPlaceholder: "What's not landing here?",
    modalReplacementPlaceholder: "Optional — rewrite it the way you'd like to see it."
  }

};
