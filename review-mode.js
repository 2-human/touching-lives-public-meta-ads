/*
 * review-mode.js — composed 2026-07-01 from library/features/review-widget/
 *
 * The review widget. ES module. Loaded by review-bootstrap.js when ?review=1
 * is present. Reads config from window.TOUCHING_LIVES_CONTACT_CONFIG, opens
 * an RTDB subscription to /comments/, filters client-side by page slug,
 * renders banner + sidebar + composer modal + hover pill.
 *
 * TDZ-safe init order per FEATURE.md §"Lessons baked into composition":
 * the cfg-guard + init() call are the LAST statements in this file, after
 * every module-level const has been evaluated.
 */

import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  update,
  remove,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// ==================================================================
// DEFAULT_LABELS — canonical English defaults per intl-plural-labels.md
// ==================================================================
const DEFAULT_LABELS = {
  locale: "en",

  banner_title: "Ad Review Mode",
  banner_subtitle:
    "Hover any element to leave a comment. Comments persist across sessions.",
  banner_exit: "Exit review mode",
  entry_button: "Comments",
  entry_button_title: "Open comment review mode",

  filter_active: "Active",
  filter_applied: "Applied",
  filter_archived: "Archived",

  empty_state_pending: "No pending comments yet.",
  empty_state_applied: "Nothing marked applied yet.",
  empty_state_archived: "No archived comments yet.",

  section_pending: {one: "1 pending", other: "{n} pending"},
  section_applied: {one: "1 applied", other: "{n} applied"},
  section_archived: {one: "1 archived", other: "{n} archived"},

  action_apply: "Apply",
  action_apply_title: "Mark this comment as applied",
  action_edit: "Edit",
  action_edit_title: "Edit this comment",
  action_archive: "Archive",
  action_archive_title: "Archive this comment",
  action_restore: "Restore",
  action_restore_title: "Restore this comment to pending",
  action_delete: "Delete",
  action_delete_title: "Permanently delete this comment",
  confirm_delete: "Delete this comment? This cannot be undone.",

  bulk_archive_all: "Archive all applied",

  pill_add: "Add comment",

  composer_title: "Leave a comment",
  composer_title_edit: "Edit comment",
  composer_placeholder:
    "What should change? Suggest a replacement, note a concern, or capture an idea for future ads.",
  composer_label: "Comment",
  composer_replacement_label: "Suggested replacement (optional)",
  composer_replacement_placeholder: "Paste the exact wording you'd suggest",
  composer_required_error:
    "Please enter a comment or a suggested replacement.",
  composer_save: "Save comment",
  composer_save_edit: "Save changes",
  composer_cancel: "Cancel",

  toast_saved: "Comment saved.",
  toast_updated: "Comment updated.",
  toast_applied: "Comment applied.",
  toast_archived: "Comment archived.",
  toast_restored: "Comment restored.",
  toast_deleted: "Comment deleted.",
  toast_error: "Something went wrong. Try again?",
  toast_element_gone: "That element is no longer on the page.",

  no_anchor_fallback: "(anchor no longer on page)",
  edited_prefix: "edited",
};

// ==================================================================
// Config lookup — reads the project's config global.
// ==================================================================
const cfg = window.TOUCHING_LIVES_CONTACT_CONFIG || null;

// ==================================================================
// LABELS — merge project overrides onto defaults (shallow).
// Built BEFORE any function that uses LABELS is defined.
// ==================================================================
const LABELS = (function buildLabels() {
  const overrides = (cfg && cfg.REVIEW_LABELS) || {};
  const merged = Object.assign({}, DEFAULT_LABELS);
  for (const key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      merged[key] = overrides[key];
    }
  }
  return merged;
})();

// ==================================================================
// Anchor allowlist per anchor-strategy.md
// ==================================================================
const ANCHOR_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "li", "td", "th", "dt", "dd",
  "strong", "em", "small", "span",
  "section", "article", "aside", "header", "footer", "nav", "main", "figure",
];
const ANCHOR_TAGS_EXTRA = (cfg && Array.isArray(cfg.ANCHOR_TAGS_EXTRA)) ? cfg.ANCHOR_TAGS_EXTRA : [];
const CHROME_ANCHORED = !!(cfg && cfg.chromeAnchored);
const LIFECYCLE_MODE = (cfg && cfg.commentLifecycleMode) || "full";
const IS_FEEDBACK_ONLY = LIFECYCLE_MODE === "feedback-only";

// ==================================================================
// pageSlug — URL-based, kebab-case per project-specific rules.
//   /feed-preview.html                 -> feed-preview
//   /details/burn-the-ships.html       -> details-burn-the-ships
//   /                                  -> home
// ==================================================================
function computePageSlug() {
  let path = window.location.pathname || "/";
  // Strip trailing /index.html or /index.htm
  path = path.replace(/\/index\.html?$/i, "/");
  if (path === "" || path === "/") return "home";
  // Strip leading slash
  path = path.replace(/^\//, "");
  // Strip trailing slash
  path = path.replace(/\/$/, "");
  // Strip .html
  path = path.replace(/\.html?$/i, "");
  // Slashes -> dashes
  path = path.replace(/\//g, "-");
  // Kebab-case (lowercase, collapse repeats)
  path = path.toLowerCase().replace(/-+/g, "-");
  return path || "home";
}

const PAGE_SLUG = computePageSlug();

// ==================================================================
// Intl plural formatter per intl-plural-labels.md
// ==================================================================
function formatCount(n, key) {
  const template = LABELS[key];
  if (typeof template === "string") {
    return template.replace("{n}", String(n));
  }
  if (template && typeof template === "object") {
    let category = "other";
    try {
      category = new Intl.PluralRules(LABELS.locale || "en").select(n);
    } catch (e) {
      category = n === 1 ? "one" : "other";
    }
    const chosen = template[category] || template.other || "";
    return chosen.replace("{n}", String(n));
  }
  return String(n);
}

// ==================================================================
// Event helpers
// ==================================================================
function emit(name, detail) {
  try {
    document.dispatchEvent(new CustomEvent(name, {detail: detail || {}}));
  } catch (e) {
    // ignore
  }
}

// ==================================================================
// State
// ==================================================================
const state = {
  cfg: cfg,
  db: null,
  comments: {}, // pushId -> record (normalized)
  filter: "active",
  spotlitEl: null,
  spotlitTimer: null,
  modalOpen: false,
  modalMode: "new", // 'new' | 'edit'
  modalAnchor: null,
  modalEditingId: null,
  sidebarOpen: false, // for narrow viewports
};

// ==================================================================
// Comment record normalization (legacy shim per firebase-rtdb-adapter.md)
// ==================================================================
function normalizeRecord(id, raw) {
  if (!raw || typeof raw !== "object") return null;
  let status = raw.status;
  if (!status) {
    if (raw.archived === true) status = "archived";
    else if (raw.applied === true) status = "applied";
    else status = "pending";
  }
  return {
    id: id,
    comment: raw.comment || "",
    replacement: raw.replacement || "",
    anchor: raw.anchor || "",
    page: raw.page || "",
    status: status,
    archived: status === "archived",
    timestamp: raw.timestamp || 0,
    edited_at: raw.edited_at || 0,
    applied_at: raw.applied_at || 0,
    archived_at: raw.archived_at || 0,
    text_preview: raw.text_preview || "",
    url: raw.url || "",
    user_agent: raw.user_agent || "",
  };
}

// ==================================================================
// Anchor pass — auto-assign data-comment-id to eligible elements.
// Runs ONCE per page load, post-DOMContentLoaded.
// ==================================================================
function isAnchorEligible(el) {
  if (!el || !el.tagName) return false;
  if (el.hasAttribute("data-review-skip")) return false;
  if (el.closest && el.closest("[data-review-skip]")) return false;
  if (el.closest && el.closest(".review-banner, .review-sidebar, .review-modal-backdrop, .review-toast, .review-toggle-btn, .review-sidebar-toggle, .review-pill-container")) return false;
  const text = (el.textContent || "").trim();
  if (text.length < 2) return false;
  return true;
}

function anchorPass() {
  const tagSet = new Set(ANCHOR_TAGS.concat(ANCHOR_TAGS_EXTRA).map((t) => t.toLowerCase()));
  const skipChromeSelector = CHROME_ANCHORED ? "" : ", nav, header[role=\"banner\"], footer";
  const contentRoot = document.querySelector("main") || document.body;

  const counters = {};
  const selector = Array.from(tagSet).join(",");
  const candidates = contentRoot.querySelectorAll(selector);

  candidates.forEach(function (el) {
    if (!isAnchorEligible(el)) return;
    if (!CHROME_ANCHORED && el.closest("nav, header[role=\"banner\"], footer")) return;
    const tag = el.tagName.toLowerCase();
    if (!tagSet.has(tag)) return;
    counters[tag] = (counters[tag] || 0) + 1;
    if (!el.hasAttribute("data-comment-id")) {
      el.setAttribute("data-comment-id", PAGE_SLUG + "-" + tag + "-" + counters[tag]);
    }
  });

  // Also pick up explicit targets carrying data-comment-target
  const explicit = contentRoot.querySelectorAll("[data-comment-target]");
  explicit.forEach(function (el) {
    if (!isAnchorEligible(el)) return;
    if (el.hasAttribute("data-comment-id")) return;
    const targetSlug = el.getAttribute("data-comment-target") || "target";
    el.setAttribute("data-comment-id", PAGE_SLUG + "-" + targetSlug);
  });

  // Attach hover-pill container to every anchored element
  document.querySelectorAll("[data-comment-id]").forEach(function (el) {
    if (el.querySelector(":scope > .review-pill-container")) return;
    const container = document.createElement("span");
    container.className = "review-pill-container";
    container.setAttribute("data-review-skip", "");
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "review-pill";
    pill.textContent = "+";
    pill.title = LABELS.pill_add;
    pill.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openComposer(el.getAttribute("data-comment-id"), null);
    });
    container.appendChild(pill);
    el.appendChild(container);
  });
}

// ==================================================================
// Decorate has-comment / has-applied-comment classes on anchored els.
// ==================================================================
function decorateAnchors() {
  document.querySelectorAll("[data-comment-id]").forEach(function (el) {
    el.classList.remove("has-comment", "has-applied-comment");
  });

  const byAnchor = {};
  Object.values(state.comments).forEach(function (c) {
    if (c.page !== PAGE_SLUG) return;
    if (!c.anchor) return;
    if (!byAnchor[c.anchor]) byAnchor[c.anchor] = [];
    byAnchor[c.anchor].push(c);
  });

  Object.keys(byAnchor).forEach(function (anchorId) {
    const el = document.querySelector('[data-comment-id="' + cssEscape(anchorId) + '"]');
    if (!el) return;
    const nonArchived = byAnchor[anchorId].filter((c) => c.status !== "archived");
    if (nonArchived.length === 0) return;
    const allApplied = nonArchived.every((c) => c.status === "applied");
    if (allApplied) {
      el.classList.add("has-applied-comment");
    } else {
      el.classList.add("has-comment");
    }
  });
}

function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, "\\$&");
}

// ==================================================================
// Chrome rendering: banner + sidebar
// ==================================================================
function renderBanner() {
  let banner = document.querySelector(".review-banner");
  if (banner) return banner;
  banner = document.createElement("div");
  banner.className = "review-banner";
  banner.setAttribute("data-review-skip", "");
  banner.innerHTML =
    '<div class="review-banner-content">' +
    '<div class="review-banner-title"></div>' +
    '<div class="review-banner-subtitle"></div>' +
    "</div>" +
    '<button type="button" class="review-banner-exit"></button>';
  banner.querySelector(".review-banner-title").textContent = LABELS.banner_title;
  banner.querySelector(".review-banner-subtitle").textContent = LABELS.banner_subtitle;
  const exitBtn = banner.querySelector(".review-banner-exit");
  exitBtn.textContent = LABELS.banner_exit;
  exitBtn.addEventListener("click", function () {
    const url = new URL(window.location.href);
    url.searchParams.delete("review");
    emit("review-exited", {page: PAGE_SLUG});
    window.location.href = url.toString();
  });
  document.body.appendChild(banner);
  return banner;
}

function renderSidebar() {
  let sidebar = document.querySelector(".review-sidebar");
  if (sidebar) return sidebar;
  sidebar = document.createElement("aside");
  sidebar.className = "review-sidebar";
  sidebar.setAttribute("data-review-skip", "");
  sidebar.innerHTML =
    '<div class="review-sidebar-inner">' +
    '<h2 class="review-sidebar-title"></h2>' +
    '<div class="filter-row" role="tablist"></div>' +
    '<div class="review-sidebar-body"></div>' +
    "</div>";
  sidebar.querySelector(".review-sidebar-title").textContent = LABELS.banner_title;
  const filterRow = sidebar.querySelector(".filter-row");
  ["active", "applied", "archived"].forEach(function (key) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = LABELS["filter_" + key] || key;
    b.setAttribute("data-filter", key);
    b.setAttribute("role", "tab");
    b.addEventListener("click", function () {
      state.filter = key;
      renderSidebarBody();
      updateFilterTabs();
    });
    filterRow.appendChild(b);
  });
  document.body.appendChild(sidebar);
  updateFilterTabs();
  return sidebar;
}

function updateFilterTabs() {
  const sidebar = document.querySelector(".review-sidebar");
  if (!sidebar) return;
  sidebar.querySelectorAll(".filter-row button").forEach(function (b) {
    const key = b.getAttribute("data-filter");
    if (key === state.filter) {
      b.classList.add("active");
      b.setAttribute("aria-pressed", "true");
    } else {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    }
  });
}

function renderSidebarToggle() {
  let toggle = document.querySelector(".review-sidebar-toggle");
  if (toggle) return toggle;
  toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "review-sidebar-toggle";
  toggle.setAttribute("data-review-skip", "");
  toggle.textContent = LABELS.entry_button;
  toggle.title = LABELS.entry_button_title;
  toggle.addEventListener("click", function () {
    state.sidebarOpen = !state.sidebarOpen;
    const sidebar = document.querySelector(".review-sidebar");
    if (sidebar) sidebar.classList.toggle("open", state.sidebarOpen);
  });
  document.body.appendChild(toggle);
  return toggle;
}

// ==================================================================
// Group status per pending-archived-workflow.md — returns filter-tab
// key vocabulary (active / applied / archived), NOT status-enum.
// ==================================================================
function groupStatus(groupComments) {
  const nonArchived = groupComments.filter((c) => c.status !== "archived");
  if (nonArchived.length === 0) return "archived";
  const allApplied = nonArchived.every((c) => c.status === "applied");
  if (allApplied) return "applied";
  return "active";
}

function renderSidebarBody() {
  const sidebar = document.querySelector(".review-sidebar");
  if (!sidebar) return;
  const body = sidebar.querySelector(".review-sidebar-body");
  body.innerHTML = "";

  // Group comments by anchor
  const groups = {};
  Object.values(state.comments)
    .filter((c) => c.page === PAGE_SLUG)
    .forEach(function (c) {
      const key = c.anchor || "(no-anchor)";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

  // Sort within-group oldest-first
  Object.keys(groups).forEach(function (k) {
    groups[k].sort((a, b) => a.timestamp - b.timestamp);
  });

  // Filter groups by current filter tab
  const filtered = Object.keys(groups)
    .filter((k) => groupStatus(groups[k]) === state.filter)
    .sort(function (a, b) {
      const lastA = Math.max.apply(null, groups[a].map((c) => c.timestamp));
      const lastB = Math.max.apply(null, groups[b].map((c) => c.timestamp));
      return lastB - lastA;
    });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      state.filter === "active"
        ? LABELS.empty_state_pending
        : state.filter === "applied"
        ? LABELS.empty_state_applied
        : LABELS.empty_state_archived;
    body.appendChild(empty);
    return;
  }

  filtered.forEach(function (anchorId) {
    body.appendChild(renderGroup(anchorId, groups[anchorId]));
  });
}

function renderGroup(anchorId, groupComments) {
  const wrap = document.createElement("div");
  wrap.className = "review-group";

  const header = document.createElement("div");
  header.className = "review-group-header";
  const anchorInfo = document.createElement("div");
  anchorInfo.className = "anchor-info";
  const anchorLine = document.createElement("div");
  anchorLine.className = "anchor";
  anchorLine.textContent = anchorId;
  anchorInfo.appendChild(anchorLine);

  // Prefer live element text; fall back to first record's text_preview
  const liveEl = document.querySelector('[data-comment-id="' + cssEscape(anchorId) + '"]');
  let preview = "";
  if (liveEl) {
    preview = (liveEl.textContent || "").trim().slice(0, 80);
  } else if (groupComments[0] && groupComments[0].text_preview) {
    preview = groupComments[0].text_preview;
  } else {
    preview = LABELS.no_anchor_fallback;
  }
  const anchorPreview = document.createElement("div");
  anchorPreview.className = "anchor-preview";
  anchorPreview.textContent = preview;
  anchorInfo.appendChild(anchorPreview);
  header.appendChild(anchorInfo);

  // Status badge
  const gs = groupStatus(groupComments);
  if (gs === "active") {
    const pendingCount = groupComments.filter((c) => c.status === "pending").length;
    const badge = document.createElement("span");
    badge.className = "group-status pending";
    badge.textContent = formatCount(pendingCount, "section_pending");
    header.appendChild(badge);
  } else if (gs === "applied") {
    const appliedCount = groupComments.filter((c) => c.status === "applied").length;
    const badge = document.createElement("span");
    badge.className = "group-status applied";
    badge.textContent = formatCount(appliedCount, "section_applied");
    header.appendChild(badge);
  }

  header.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    activateSpotlight(anchorId);
  });

  wrap.appendChild(header);

  const commentsList = document.createElement("div");
  commentsList.className = "comments";
  groupComments.forEach(function (c) {
    commentsList.appendChild(renderComment(c));
  });
  wrap.appendChild(commentsList);

  // Group footer: bulk-archive button (suppressed in feedback-only or archived filter)
  if (!IS_FEEDBACK_ONLY && state.filter !== "archived") {
    const nonArchived = groupComments.filter((c) => c.status !== "archived");
    if (nonArchived.length > 0) {
      const footer = document.createElement("div");
      footer.className = "review-group-footer";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "archive-group-btn";
      btn.textContent = LABELS.bulk_archive_all;
      btn.addEventListener("click", function () {
        nonArchived.forEach((c) => archiveComment(c.id));
      });
      footer.appendChild(btn);
      wrap.appendChild(footer);
    }
  }

  return wrap;
}

function renderComment(c) {
  const row = document.createElement("div");
  row.className = "review-comment";
  if (c.status === "archived") row.classList.add("archived");

  if (c.comment) {
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = c.comment;
    row.appendChild(text);
  }
  if (c.replacement) {
    const rep = document.createElement("div");
    rep.className = "replacement";
    rep.textContent = c.replacement;
    row.appendChild(rep);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  const ts = new Date(c.timestamp || 0);
  let metaText = isNaN(ts.getTime()) ? "" : ts.toLocaleString();
  if (c.edited_at) metaText += "  ·  " + LABELS.edited_prefix;
  meta.textContent = metaText;
  row.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "actions";
  const buttons = actionButtonsFor(c);
  buttons.forEach(function (spec) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = spec.cls;
    b.textContent = spec.label;
    b.title = spec.title;
    b.addEventListener("click", spec.onClick);
    actions.appendChild(b);
  });
  row.appendChild(actions);

  return row;
}

function actionButtonsFor(c) {
  const btns = [];
  if (IS_FEEDBACK_ONLY) {
    if (c.status === "pending") {
      btns.push({
        cls: "edit-btn",
        label: LABELS.action_edit,
        title: LABELS.action_edit_title,
        onClick: () => openComposer(c.anchor, c.id),
      });
      btns.push({
        cls: "delete-btn",
        label: LABELS.action_delete,
        title: LABELS.action_delete_title,
        onClick: () => confirmDelete(c.id),
      });
    } else {
      btns.push({
        cls: "restore-btn",
        label: LABELS.action_restore,
        title: LABELS.action_restore_title,
        onClick: () => restoreComment(c.id),
      });
      btns.push({
        cls: "delete-btn",
        label: LABELS.action_delete,
        title: LABELS.action_delete_title,
        onClick: () => confirmDelete(c.id),
      });
    }
    return btns;
  }
  // full mode
  if (c.status === "pending") {
    btns.push({
      cls: "apply-btn",
      label: LABELS.action_apply,
      title: LABELS.action_apply_title,
      onClick: () => applyComment(c.id),
    });
    btns.push({
      cls: "edit-btn",
      label: LABELS.action_edit,
      title: LABELS.action_edit_title,
      onClick: () => openComposer(c.anchor, c.id),
    });
    btns.push({
      cls: "archive-btn",
      label: LABELS.action_archive,
      title: LABELS.action_archive_title,
      onClick: () => archiveComment(c.id),
    });
    btns.push({
      cls: "delete-btn",
      label: LABELS.action_delete,
      title: LABELS.action_delete_title,
      onClick: () => confirmDelete(c.id),
    });
  } else if (c.status === "applied") {
    btns.push({
      cls: "restore-btn",
      label: LABELS.action_restore,
      title: LABELS.action_restore_title,
      onClick: () => restoreComment(c.id),
    });
    btns.push({
      cls: "archive-btn",
      label: LABELS.action_archive,
      title: LABELS.action_archive_title,
      onClick: () => archiveComment(c.id),
    });
    btns.push({
      cls: "delete-btn",
      label: LABELS.action_delete,
      title: LABELS.action_delete_title,
      onClick: () => confirmDelete(c.id),
    });
  } else {
    // archived
    btns.push({
      cls: "restore-btn",
      label: LABELS.action_restore,
      title: LABELS.action_restore_title,
      onClick: () => restoreComment(c.id),
    });
    btns.push({
      cls: "delete-btn",
      label: LABELS.action_delete,
      title: LABELS.action_delete_title,
      onClick: () => confirmDelete(c.id),
    });
  }
  return btns;
}

// ==================================================================
// Spotlight per spotlight-on-click.md
// ==================================================================
function activateSpotlight(anchorId) {
  clearSpotlight();
  const el = document.querySelector('[data-comment-id="' + cssEscape(anchorId) + '"]');
  if (!el) {
    emit("spotlight-activated", {anchorId: anchorId, found: false});
    showToast(LABELS.toast_element_gone, "error");
    return;
  }
  el.classList.add("review-spotlit");
  state.spotlitEl = el;
  el.scrollIntoView({behavior: "smooth", block: "center"});
  emit("spotlight-activated", {anchorId: anchorId, found: true});
  state.spotlitTimer = window.setTimeout(function () {
    clearSpotlight();
  }, 4000);
}

function clearSpotlight() {
  if (state.spotlitTimer) {
    window.clearTimeout(state.spotlitTimer);
    state.spotlitTimer = null;
  }
  if (state.spotlitEl) {
    state.spotlitEl.classList.remove("review-spotlit");
    state.spotlitEl = null;
  }
}

// ==================================================================
// Composer modal (comment-lifecycle.md)
// ==================================================================
function openComposer(anchorId, editingId) {
  state.modalOpen = true;
  state.modalAnchor = anchorId;
  state.modalMode = editingId ? "edit" : "new";
  state.modalEditingId = editingId || null;

  let existing = null;
  if (editingId && state.comments[editingId]) existing = state.comments[editingId];

  closeComposer(); // clear any previous

  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.setAttribute("data-review-skip", "");
  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) closeComposer();
  });

  const modal = document.createElement("div");
  modal.className = "review-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = state.modalMode === "edit" ? LABELS.composer_title_edit : LABELS.composer_title;
  modal.appendChild(title);

  const commentField = document.createElement("div");
  commentField.className = "field";
  const commentLabel = document.createElement("label");
  commentLabel.textContent = LABELS.composer_label;
  const commentInput = document.createElement("textarea");
  commentInput.placeholder = LABELS.composer_placeholder;
  commentInput.rows = 4;
  if (existing) commentInput.value = existing.comment || "";
  commentField.appendChild(commentLabel);
  commentField.appendChild(commentInput);
  modal.appendChild(commentField);

  const replField = document.createElement("div");
  replField.className = "field";
  const replLabel = document.createElement("label");
  replLabel.textContent = LABELS.composer_replacement_label;
  const replInput = document.createElement("textarea");
  replInput.placeholder = LABELS.composer_replacement_placeholder;
  replInput.rows = 3;
  if (existing) replInput.value = existing.replacement || "";
  replField.appendChild(replLabel);
  replField.appendChild(replInput);
  modal.appendChild(replField);

  const error = document.createElement("div");
  error.className = "error";
  modal.appendChild(error);

  const actions = document.createElement("div");
  actions.className = "actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "review-btn review-btn--secondary";
  cancelBtn.textContent = LABELS.composer_cancel;
  cancelBtn.addEventListener("click", closeComposer);
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "review-btn review-btn--primary";
  saveBtn.textContent = state.modalMode === "edit" ? LABELS.composer_save_edit : LABELS.composer_save;
  saveBtn.addEventListener("click", function () {
    const c = commentInput.value.trim();
    const r = replInput.value.trim();
    if (!c && !r) {
      error.textContent = LABELS.composer_required_error;
      return;
    }
    error.textContent = "";
    if (state.modalMode === "edit") {
      saveEdit(state.modalEditingId, c, r);
    } else {
      saveNew(anchorId, c, r);
    }
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  commentInput.focus();
}

function closeComposer() {
  const existing = document.querySelector(".review-modal-backdrop");
  if (existing) existing.remove();
  state.modalOpen = false;
  state.modalAnchor = null;
  state.modalEditingId = null;
}

// ==================================================================
// Toast
// ==================================================================
let toastEl = null;
let toastTimer = null;
function showToast(msg, variant) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "review-toast";
    toastEl.setAttribute("data-review-skip", "");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", variant === "error");
  toastEl.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    toastEl.classList.remove("show");
  }, 2500);
}

// ==================================================================
// Lifecycle transitions
// ==================================================================
function saveNew(anchorId, comment, replacement) {
  const el = document.querySelector('[data-comment-id="' + cssEscape(anchorId) + '"]');
  const preview = el ? (el.textContent || "").trim().slice(0, 80) : "";
  const record = {
    comment: comment,
    replacement: replacement,
    anchor: anchorId,
    page: PAGE_SLUG,
    archived: false,
    status: "pending",
    timestamp: Date.now(),
    text_preview: preview,
    url: window.location.href,
    user_agent: (navigator && navigator.userAgent) || "",
  };
  push(ref(state.db, "comments"), record)
    .then(function (r) {
      emit("comment-created", {id: r.key, record: record});
      showToast(LABELS.toast_saved);
      closeComposer();
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
      emit("review-failed", {op: "create", error: String(e)});
    });
}

function saveEdit(id, comment, replacement) {
  const patch = {
    comment: comment,
    replacement: replacement,
    edited_at: Date.now(),
  };
  update(ref(state.db, "comments/" + id), patch)
    .then(function () {
      emit("comment-edited", {id: id, patch: patch});
      showToast(LABELS.toast_updated);
      closeComposer();
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
      emit("review-failed", {op: "edit", error: String(e)});
    });
}

function applyComment(id) {
  const patch = {status: "applied", applied_at: Date.now(), archived: false};
  update(ref(state.db, "comments/" + id), patch)
    .then(function () {
      emit("comment-applied", {id: id});
      showToast(LABELS.toast_applied);
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
    });
}

function archiveComment(id) {
  const patch = {status: "archived", archived: true, archived_at: Date.now()};
  update(ref(state.db, "comments/" + id), patch)
    .then(function () {
      emit("comment-archived", {id: id});
      showToast(LABELS.toast_archived);
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
    });
}

function restoreComment(id) {
  const patch = {status: "pending", archived: false};
  update(ref(state.db, "comments/" + id), patch)
    .then(function () {
      emit("comment-restored", {id: id});
      showToast(LABELS.toast_restored);
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
    });
}

function confirmDelete(id) {
  if (!window.confirm(LABELS.confirm_delete)) return;
  const snapshot = state.comments[id] ? Object.assign({}, state.comments[id]) : null;
  remove(ref(state.db, "comments/" + id))
    .then(function () {
      emit("comment-deleted", {id: id, snapshot: snapshot});
      showToast(LABELS.toast_deleted);
    })
    .catch(function (e) {
      showToast(LABELS.toast_error, "error");
    });
}

// Expose a small programmatic API for build-team scripting
window.__review = window.__review || {};
window.__review.archiveComments = function (ids) {
  (ids || []).forEach(archiveComment);
};
window.__review.restoreComments = function (ids) {
  (ids || []).forEach(restoreComment);
};

// ==================================================================
// Subscribe & sync
// ==================================================================
function subscribeAll() {
  onValue(ref(state.db, "comments"), function (snap) {
    const raw = snap.val() || {};
    const normalized = {};
    Object.keys(raw).forEach(function (id) {
      const r = normalizeRecord(id, raw[id]);
      if (r) normalized[id] = r;
    });
    state.comments = normalized;
    decorateAnchors();
    renderSidebarBody();
  });
}

// ==================================================================
// init — runs after everything above is defined.
// ==================================================================
function init() {
  try {
    const app = initializeApp(cfg.FIREBASE_CONFIG);
    state.db = getDatabase(app);
  } catch (e) {
    emit("review-failed", {op: "firebase-init", error: String(e)});
    // Fall through — chrome still renders so reviewer sees the failure state.
  }

  renderBanner();
  renderSidebar();
  renderSidebarToggle();
  anchorPass();

  if (state.db) subscribeAll();

  // Global escape to close modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state.modalOpen) closeComposer();
  });

  emit("review-entered", {page: PAGE_SLUG});
}

// ==================================================================
// TDZ-safe guard + init call — MUST be the last statements in this module
// per FEATURE.md §"Lessons baked into composition".
// ==================================================================
if (!cfg || !cfg.FIREBASE_CONFIG) {
  console.warn(
    "[review-widget] window.TOUCHING_LIVES_CONTACT_CONFIG or FIREBASE_CONFIG is missing; widget will not initialize."
  );
  emit("review-failed", {op: "config", error: "missing config"});
} else {
  init();
}
