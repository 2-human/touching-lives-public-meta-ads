/**
 * Project config for review-widget (and future contact-form) surfaces.
 *
 * Read at composition time from library/features/review-widget/. Values are
 * baked into the generated review-bootstrap.js / review-mode.js at
 * public/meta-ads/. If you change values here, re-run:
 *   python3 work-setup/build-feed-preview.py    # (or the composition script)
 *
 * Config global name convention: {PROJECT}_CONTACT_CONFIG.
 */
window.TOUCHING_LIVES_CONTACT_CONFIG = {
  // ------------------------------------------------------------------
  // Firebase — touching-lives-84345 (Spark plan, us-central1)
  // Realtime Database, test-mode rules while piloting.
  // ------------------------------------------------------------------
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyBwf796wzoUojSh7uBmqa5leBWIFZo58vs",
    authDomain: "touching-lives-84345.firebaseapp.com",
    databaseURL: "https://touching-lives-84345-default-rtdb.firebaseio.com",
    projectId: "touching-lives-84345",
    storageBucket: "touching-lives-84345.firebasestorage.app",
    messagingSenderId: "604273986058",
    appId: "1:604273986058:web:85cb3af64d45b5fa82adf3",
  },

  // ------------------------------------------------------------------
  // Review widget — English defaults, tuned for ad-review context
  // (per library/features/review-widget/intl-plural-labels.md).
  // Any string can be overridden here without touching the widget.
  // Plural keys use CLDR categories: one / other (English needs both).
  // ------------------------------------------------------------------
  REVIEW_LABELS: {
    banner_title: "Ad Review Mode",
    banner_subtitle:
      "Hover any element to leave a comment. Comments persist across sessions.",
    entry_button: "Review comments",

    // Comment lifecycle
    empty_state_pending: "No pending comments yet.",
    empty_state_applied: "Nothing marked applied yet.",
    empty_state_archived: "No archived comments yet.",
    section_pending: {one: "1 pending", other: "{n} pending"},
    section_applied: {one: "1 applied", other: "{n} applied"},
    section_archived: {one: "1 archived", other: "{n} archived"},

    // Per-comment actions
    action_apply: "Apply",
    action_edit: "Edit",
    action_archive: "Archive",
    action_restore: "Restore",
    action_delete: "Delete",
    confirm_delete: "Delete this comment? This cannot be undone.",

    // Group-footer bulk actions
    bulk_archive_all: "Archive all applied",

    // Composer
    composer_title: "Leave a comment",
    composer_placeholder:
      "What should change? Suggest a replacement, note a concern, or capture an idea for future ads.",
    composer_replacement_label: "Suggested replacement (optional)",
    composer_save: "Save comment",
    composer_cancel: "Cancel",

    // Toasts
    toast_saved: "Comment saved.",
    toast_updated: "Comment updated.",
    toast_archived: "Comment archived.",
    toast_restored: "Comment restored.",
    toast_deleted: "Comment deleted.",
    toast_error: "Something went wrong. Try again?",
  },

  // ------------------------------------------------------------------
  // Widget behaviour — per-project inputs from FEATURE.md
  // ------------------------------------------------------------------
  // Default 'full' — buttons: Apply / Edit / Archive / Restore / Delete
  commentLifecycleMode: "full",

  // Default 'allowlist' — only anchor canonical tags + [data-comment-target]
  // (This library revision doesn't include commentable-everything.md, so
  // 'direct-text' isn't supported. 'allowlist' is the only correct value.)
  commentableContent: "allowlist",

  // Anchor extras — additional tag names beyond the canonical allowlist.
  // Leave [] for the default ad-preview surface; extend later if needed
  // (see anchor-extensibility guidance in the FEATURE.md project_inputs).
  ANCHOR_TAGS_EXTRA: [],

  // Chrome (nav / header[role=banner] / footer) is NOT anchored by default.
  // Ad-preview pages don't have real site chrome anyway.
  chromeAnchored: false,
};
