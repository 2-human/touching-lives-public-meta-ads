/* Touching Lives Meta Ads preview — review widget config.
 *
 * Comments persist to a Firebase Realtime Database so the internal team and the
 * client see each other's feedback. Firebase project: touching-lives-84345
 * (Spark plan, us-central1).
 *
 * If FIREBASE_CONFIG is missing, the widget stores comments in THIS browser only
 * (localStorage) — fine for solo review, but NOT shared. The banner shows a
 * "Local-only" badge when running in that mode.
 *
 * Adopted 2026-07-01 from credo/public/meta-ads-preview/review.config.js.
 * Labels rewritten for the ad-review context. See .composition-manifest.md.
 */
window.TOUCHING_LIVES_REVIEW_CONFIG = {
  FIREBASE_CONFIG: {
    apiKey:            "AIzaSyBwf796wzoUojSh7uBmqa5leBWIFZo58vs",
    authDomain:        "touching-lives-84345.firebaseapp.com",
    databaseURL:       "https://touching-lives-84345-default-rtdb.firebaseio.com",
    projectId:         "touching-lives-84345",
    storageBucket:     "touching-lives-84345.firebasestorage.app",
    messagingSenderId: "604273986058",
    appId:             "1:604273986058:web:85cb3af64d45b5fa82adf3"
  },
  REVIEW_LABELS: {
    toggleButton: "Comments",
    toggleButtonTitle: "Open comment review mode",
    bannerTitle: "Review mode · Touching Lives Meta Ads",
    localOnly: "Local-only — add Firebase config for shared comments",
    exit: "Exit review",
    sidebarTitle: "Comments",
    empty: "No comments yet. Hover any ad or line of text and click the + to add one.",
    add: "+ Comment",
    save: "Post comment",
    cancel: "Cancel",
    edit: "Edit",
    del: "Delete",
    resolve: "Resolve",
    reopen: "Reopen",
    tabOpen: "Open",
    tabResolved: "Resolved",
    resolvePrompt: "Resolution note (what was done):",
    placeholder: "Your feedback…",
    replacementPlaceholder: "Suggested change (optional)…",
    namePrompt: "Your name (so the team knows who left this comment):"
  }
};
