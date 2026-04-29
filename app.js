// app.js — UI logic, conversation state, message rendering, report library
// Depends on api.js being loaded first (sendToAI, extractSQL).

/* ── Shell mode ─────────────────────────────────────── */

function detectEmbeddedMode() {
  const urlEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
  let iframeEmbedded = false;
  try {
    iframeEmbedded = window.self !== window.top;
  } catch (_) {
    iframeEmbedded = true;
  }
  document.documentElement.classList.toggle('pw-embedded', urlEmbedded || iframeEmbedded);
}

detectEmbeddedMode();

/* ── Copy button SVG ────────────────────────────────── */

const COPY_BTN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 8h10s2 0 2 2v10s0 2 -2 2H10s-2 0 -2 -2V10s0 -2 2 -2" stroke-width="2"></path><path d="M4 16c-1.1 0 -2 -0.9 -2 -2V4c0 -1.1 0.9 -2 2 -2h10c1.1 0 2 0.9 2 2" stroke-width="2"></path></svg>`;

/* ── marked configuration ───────────────────────────── */

if (typeof marked !== 'undefined') {
  marked.use({
    breaks: true,
    renderer: {
      code(token) {
        const text = token.text || '';
        const lang = token.lang || '';
        const escaped = text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const langClass = lang ? ` class="language-${lang}"` : '';
        return `<div class="chat-code-wrap"><pre><code${langClass}>${escaped}</code></pre><button class="btn-copy-float" data-tooltip="Copy" aria-label="Copy" onclick="copyCodeBlock(this)">${COPY_BTN_SVG}</button></div>`;
      }
    }
  });
}

/* ── State ─────────────────────────────────────────── */

let conversations = [];
let activeId = null;

/** Explicit library saves only (not autosaved generation). */
const MANUAL_REPORTS_KEY         = 'pw_reports_manual';
const ARCHIVED_CONVERSATIONS_KEY = 'pw_archived_conversations';
const DELETED_CONVERSATIONS_KEY  = 'pw_deleted_conversations';
const PREFERENCES_KEY            = 'pw_preferences';
const USER_MEMORY_KEY            = 'pw_user_memory';
const SIDEBAR_COLLAPSED_KEY      = 'pw_sidebar_collapsed';
const DELETED_PURGE_DAYS         = 30;

/** Persisted UI for same-tab refresh (not used on first tab load). */
const UI_SNAPSHOT_KEY = 'pw_ui_snapshot';
/** sessionStorage: set after first load in this tab — distinguishes refresh vs fresh tab open. */
const TAB_SESSION_KEY = 'pw_tab_session_started';

// Global mode: sent with /api/chat (Report vs Advisor routing)
let advisorMode = false;

/** UI shell: replace with server-provided tenant config when available. */
const PW_TENANT_UI = Object.freeze({
  displayName: 'Projectworks',
  /** Set to a URL (e.g. `assets/your-logo.svg`) to replace the default hero mark. */
  brandLogoSrc: null,
  welcomeHeadline: 'What are we working on today?',
  welcomeTagline:
    'Ask in natural language — I can work with your data, draft reports, and walk through how things connect.',
});

/**
 * Signed-in user + server preferences (v1).
 * FUTURE: inject preferredRevenueMethod / explanationStyle into prompts; optional memory.
 */
let pwCurrentUser = null;
let pwPreferences = null;

/**
 * Namespaces a localStorage/sessionStorage key by the logged-in user's ID so
 * that two different users on the same browser never share stored data.
 * Falls back to the bare key only when no user is resolved (should not happen
 * in normal flow since auth is awaited before any storage access).
 */
function userKey(base) {
  return pwCurrentUser ? `${base}:${pwCurrentUser.id}` : base;
}

/** Main workspace: chat, library list, saved-report detail, or assistant feed. */
let appView = 'chat';

/** Unread insight count — drives the assistant channel badge. */
let _assistantUnreadCount = 0;

/** Insight objects from the last feed load — needed by drawer/dropdown functions. */
let _currentFeedInsights = [];

/** Full library row while viewing report detail; cleared when leaving detail. */
let detailLibraryEntry = null;

/** Tracks which conversation had the SQL panel open; auto-reopens panel on chat navigation. Null = panel was explicitly closed. */
let lastViewedReportId = null;

/** Results vs SQL workspace inside report detail (Chat is a separate navigation action). */
let reportDetailWorkspace = 'results';

// Current mock data for the results panel — reused by full screen view and CSV export
let currentMockData = null;

/* ── DOM refs ───────────────────────────────────────── */

const chatArea  = document.getElementById('chat-area');
const chatInner = document.getElementById('chat-inner');
const welcome   = document.getElementById('welcome');
const inputEl   = document.getElementById('user-input');
const sendBtn   = document.getElementById('send-btn');
const convList  = document.getElementById('conv-list');
const sqlPanel  = document.getElementById('sql-panel');
const sqlOutput = document.getElementById('sql-output');

/* ── Sidebar ────────────────────────────────────────── */

const ICON_ARROW_LEFT  = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9.78 12.78a.75.75 0 01-1.06 0L4.47 8.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L6.06 8l3.72 3.72a.75.75 0 010 1.06z"/></svg>`;
const ICON_ARROW_RIGHT = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>`;

function renderSidebar() {
  renderConversationList(conversations, true);
}

function _assistantChannelItemHTML() {
  const badge = _assistantUnreadCount > 0
    ? `<span class="assistant-badge">${_assistantUnreadCount}</span>`
    : '';
  return `<div id="assistant-channel-item" class="assistant-channel-item" onclick="openAssistantFeed()" role="button" tabindex="0">
    <svg class="assistant-channel-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"/></svg>
    <span class="assistant-channel-label">Your Assistant</span>
    ${badge}
  </div>`;
}

function renderConversationList(convs, showSections = false) {
  const assistantItem = _assistantChannelItemHTML();
  if (!showSections) {
    convList.innerHTML = assistantItem + (convs.length ? convs.map(c => buildConvItemHTML(c)).join('') : '');
    return;
  }

  const pinned  = convs.filter(c => c.pinned);
  const recents = convs.filter(c => !c.pinned);
  let html = assistantItem;

  // Pinned section — always rendered
  html += `<div class="conv-section-label">Pinned</div>`;
  html += `<div class="conv-section-body" data-section="pinned">`;
  if (pinned.length) {
    html += pinned.map(c => buildConvItemHTML(c, 'pinned')).join('');
  } else {
    html += `<div class="pinned-drop-zone" id="pinned-drop-zone">Drag here to pin</div>`;
  }
  html += `</div>`;

  if (recents.length) {
    html += `<div class="conv-section-label conv-section-label--recents">Recent</div>`;
    html += `<div class="conv-section-body" data-section="recent">`;
    html += recents.map(c => buildConvItemHTML(c, 'recent')).join('');
    html += `</div>`;
  }

  convList.innerHTML = html;
}

function buildConvItemHTML(c, section) {
  const isActive = c.id === activeId;
  const pinIcon = c.pinned
    ? `<span class="conv-pin-icon" aria-label="Pinned"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg></span>`
    : '';
  return `
    <div class="conv-item ${isActive ? 'active' : ''} ${c.pinned ? 'conv-item--pinned' : ''}"
         data-conv-id="${c.id}"
         onclick="switchTo(${c.id})"
         data-tooltip="${escapeAttr(c.title)}"
         title="${escapeAttr(c.title)}">
      ${pinIcon}
      <span class="conv-title">${escapeHTML(c.title)}</span>
      <button type="button" class="conv-menu-btn" onclick="openConvMenu(${c.id}, this, event)" title="More options" aria-label="Conversation options">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM1.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm13 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
        </svg>
      </button>
    </div>`;
}

function searchConversations(query) {
  const clearBtn = document.getElementById('btn-search-clear');
  if (clearBtn) clearBtn.hidden = !query;
  if (!query.trim()) { renderSidebar(); return; }
  const lower = query.toLowerCase();
  renderConversationList(conversations.filter(c => c.title.toLowerCase().includes(lower)));
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btn-search-clear');
  if (clearBtn) clearBtn.hidden = true;
  renderSidebar();
}

/* ── Conversation context menu ──────────────────────── */

let _openConvMenuId = null;

function openConvMenu(id, btnEl, event) {
  event.stopPropagation();
  closeAllConvMenus();

  const conv = conversations.find(c => c.id === id);
  if (!conv) return;

  const rect = btnEl.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.id = 'conv-menu-dropdown';
  dropdown.className = 'conv-menu-dropdown';
  dropdown.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left - 56}px;z-index:1000;`;
  dropdown.innerHTML = `
    <button class="conv-menu-item" onclick="event.stopPropagation();pinConversation(${id});closeAllConvMenus()">
      ${conv.pinned ? 'Unpin' : 'Pin'}
    </button>
    <button class="conv-menu-item" onclick="event.stopPropagation();startRenameConversation(${id});closeAllConvMenus()">
      Rename
    </button>
    <button class="conv-menu-item" onclick="event.stopPropagation();archiveConversation(${id});closeAllConvMenus()">
      Archive
    </button>
    <button class="conv-menu-item conv-menu-item--danger" onclick="event.stopPropagation();deleteConversation(${id});closeAllConvMenus()">
      Delete
    </button>`;
  document.body.appendChild(dropdown);
  _openConvMenuId = id;

  // Keep dropdown in viewport
  const dr = dropdown.getBoundingClientRect();
  if (dr.right > window.innerWidth) dropdown.style.left = `${window.innerWidth - dr.width - 8}px`;
  if (dr.bottom > window.innerHeight) dropdown.style.top = `${rect.top - dr.height - 4}px`;

  setTimeout(() => document.addEventListener('click', closeAllConvMenus, { once: true }), 0);
}

function closeAllConvMenus() {
  const el = document.getElementById('conv-menu-dropdown');
  if (el) el.remove();
  _openConvMenuId = null;
}

function pinConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  saveConversations();
  renderSidebar();
}

function startRenameConversation(id) {
  const itemEl = convList.querySelector(`[data-conv-id="${id}"]`);
  if (!itemEl) return;
  const titleEl = itemEl.querySelector('.conv-title');
  const conv = conversations.find(c => c.id === id);
  if (!titleEl || !conv) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'conv-title-input';
  input.value = conv.title;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const confirm = () => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (val && val !== conv.title) {
      conv.title = val;
      if (conv.savedReport) conv.savedReport.title = val;
      saveConversations();
    }
    renderSidebar();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    if (e.key === 'Escape') { done = true; renderSidebar(); }
    e.stopPropagation();
  });
  input.addEventListener('blur', confirm);
  input.addEventListener('click', e => e.stopPropagation());
}

function archiveConversation(id) {
  showConfirmModal(
    'Archive chat?',
    'This will move the chat to your archive. You can restore it from Settings.',
    'Archive',
    () => _performArchiveConversation(id)
  );
}

function _performArchiveConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return;
  const [conv] = conversations.splice(idx, 1);
  const arcs = loadArchivedConversations();
  arcs.unshift(conv);
  saveArchivedConversations(arcs);
  if (activeId === id) { activeId = null; renderMessages(); }
  saveConversations();
  renderSidebar();
}

function deleteConversation(id) {
  showConfirmModal(
    'Delete chat?',
    'Are you sure you want to delete this chat? This cannot be undone.',
    'Delete',
    () => _performDeleteConversation(id)
  );
}

function _performDeleteConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return;
  const [conv] = conversations.splice(idx, 1);
  const dels = loadDeletedConversations();
  dels.unshift({ ...conv, deletedAt: Date.now() });
  saveDeletedConversations(dels);
  if (activeId === id) { activeId = null; renderMessages(); }
  saveConversations();
  renderSidebar();
}

/* ── Archived conversations ─────────────────────────── */

function loadArchivedConversations() {
  try { return JSON.parse(localStorage.getItem(userKey(ARCHIVED_CONVERSATIONS_KEY)) || '[]'); }
  catch (_) { return []; }
}

function saveArchivedConversations(arcs) {
  try { localStorage.setItem(userKey(ARCHIVED_CONVERSATIONS_KEY), JSON.stringify(arcs.slice(0, 100))); }
  catch (_) {}
}

function restoreArchivedConversation(archId) {
  const arcs = loadArchivedConversations();
  const idx = arcs.findIndex(c => c.id === archId);
  if (idx === -1) return;
  const [conv] = arcs.splice(idx, 1);
  saveArchivedConversations(arcs);
  conversations.unshift(conv);
  saveConversations();
  renderSidebar();
  renderSettingsArchived();
}

/* ── Recently deleted conversations ─────────────────── */

function loadDeletedConversations() {
  try { return JSON.parse(localStorage.getItem(userKey(DELETED_CONVERSATIONS_KEY)) || '[]'); }
  catch (_) { return []; }
}

function saveDeletedConversations(dels) {
  try { localStorage.setItem(userKey(DELETED_CONVERSATIONS_KEY), JSON.stringify(dels.slice(0, 100))); }
  catch (_) {}
}

function purgeExpiredDeletedConversations() {
  const cutoff = Date.now() - DELETED_PURGE_DAYS * 24 * 60 * 60 * 1000;
  const dels = loadDeletedConversations().filter(c => c.deletedAt > cutoff);
  saveDeletedConversations(dels);
}

function restoreDeletedConversation(delId) {
  const dels = loadDeletedConversations();
  const idx = dels.findIndex(c => c.id === delId);
  if (idx === -1) return;
  const [conv] = dels.splice(idx, 1);
  delete conv.deletedAt;
  saveDeletedConversations(dels);
  conversations.unshift(conv);
  saveConversations();
  renderSidebar();
  renderSettingsDeleted();
}

function updateCollapseToggleIcon(isCollapsed) {
  const btn = document.getElementById('btn-collapse-toggle');
  if (!btn) return;
  btn.innerHTML = isCollapsed ? ICON_ARROW_RIGHT : ICON_ARROW_LEFT;
  btn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

function _ensureSidebarOpen() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    updateCollapseToggleIcon(false);
  }
  if (window.innerWidth <= 768 && !sidebar.classList.contains('sidebar-open')) {
    sidebar.classList.add('sidebar-open');
  }
}

function handleReportDetailChatBtn() {
  const r = detailLibraryEntry;
  const title = (r && r.title) || 'this report';
  const cid = r && r.conversationId != null ? r.conversationId : null;
  const existingConv = cid !== null ? conversations.find(c => c.id === cid) : null;

  leaveReportDetailShell();
  appView = 'chat';
  exitLibraryLayoutToChat();

  const chatColReveal = document.getElementById('chat-col');
  if (chatColReveal) {
    chatColReveal.classList.add('rd-reveal-from-detail');
    setTimeout(() => chatColReveal.classList.remove('rd-reveal-from-detail'), 450);
  }

  if (existingConv) {
    activeId = cid;
    renderSidebar();
    renderMessages();
    const conv = getActive();
    if (conv && hasCompletedReport(conv)) {
      prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
      if (lastViewedReportId !== null) {
        sqlPanel.classList.add('open');
        lastViewedReportId = activeId;
      } else {
        sqlPanel.classList.remove('open');
      }
      resetCopyBtn();
      persistUiSnapshot();
    } else {
      _hideSQLPanel();
    }
  } else {
    const id = Date.now();
    const openingMsg = `I have full context of ${title} — what would you like to refine?`;
    const cat = (r && r.category) || (r ? inferReportCategory(r.sql || '', r.title || '') : 'Reports');
    conversations.unshift({
      id,
      title,
      messages: [{ role: 'assistant', content: openingMsg }],
      sql: (r && r.sql) || null,
      reasoning: (r && r.reasoning) || null,
      savedReport: r ? {
        sql: r.sql,
        reasoning: r.reasoning || null,
        title: r.title,
        question: r.question || '',
        category: cat,
        completedAt: r.savedAt || new Date().toISOString(),
      } : null,
      reportLibrarySaved: !!r,
    });
    activeId = id;
    renderSidebar();
    renderMessages();
    if (r && r.sql) {
      prepareSQLPanelContent(r.sql, title, cat);
      if (lastViewedReportId !== null) {
        sqlPanel.classList.add('open');
        lastViewedReportId = activeId;
      } else {
        sqlPanel.classList.remove('open');
      }
      resetCopyBtn();
    }
    saveConversations();
  }

  syncSaveReportButtonUI();
  updateViewReportTab();
  updateSidebarNavLabels();
  inputEl.focus();
}

function initSidebar() {
  if (localStorage.getItem(userKey(SIDEBAR_COLLAPSED_KEY)) === '1') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
    updateCollapseToggleIcon(true);
  }
  updateSidebarNavLabels();
  initDragBehavior();
  updateAssistantBadge();
}

/* ── Your Assistant channel ──────────────────────────── */

function _getOrCreateAssistantFeedEl() {
  let el = document.getElementById('assistant-feed-mode');
  if (!el) {
    el = document.createElement('div');
    el.id = 'assistant-feed-mode';
    el.className = 'assistant-feed-mode';
    el.style.display = 'none';
    const sibling = document.getElementById('library-mode');
    if (sibling && sibling.parentNode) {
      sibling.parentNode.insertBefore(el, sibling.nextSibling);
    } else {
      document.body.appendChild(el);
    }
  }
  return el;
}

async function updateAssistantBadge() {
  try {
    const resp = await fetch('/api/insights');
    if (!resp.ok) return;
    const { unreadCount } = await resp.json();
    _assistantUnreadCount = unreadCount || 0;
    renderSidebar();
  } catch (_) {}
}

function openAssistantFeed() {
  if (appView === 'report-detail') {
    leaveReportDetailShell();
    exitLibraryLayoutToChat();
  } else if (appView === 'library') {
    exitLibraryLayoutToChat();
  } else if (appView === 'settings') {
    const page = document.getElementById('settings-page');
    if (page) page.style.display = 'none';
    const chatCol = document.getElementById('chat-col');
    if (chatCol) chatCol.style.display = '';
    sqlPanel.style.display = '';
  }
  appView = 'assistant';
  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.classList.add('main-fade-out');
    chatCol.offsetHeight;
    setTimeout(() => {
      chatCol.style.display = 'none';
      chatCol.classList.remove('main-fade-out');
    }, 220);
  }
  sqlPanel.classList.remove('open');
  sqlPanel.style.display = 'none';
  renderAssistantFeed();
  updateSidebarNavLabels();
}

function exitAssistantFeedToChat() {
  const feedEl = _getOrCreateAssistantFeedEl();
  feedEl.style.display = 'none';
  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.style.display = '';
    chatCol.classList.add('main-fade-out');
    chatCol.offsetHeight;
    requestAnimationFrame(() => chatCol.classList.remove('main-fade-out'));
  }
  sqlPanel.style.display = '';
}

async function renderAssistantFeed() {
  const feedEl = _getOrCreateAssistantFeedEl();
  feedEl.style.display = 'flex';
  feedEl.innerHTML = '<div class="assistant-feed-loading">Loading…</div>';

  let insights = [], maturity = null;
  try {
    const resp = await fetch('/api/insights');
    if (resp.ok) {
      const data = await resp.json();
      insights = data.insights || [];
      maturity = data.maturity || null;
      _assistantUnreadCount = data.unreadCount || 0;
      renderSidebar();
    }
  } catch (_) {}

  _currentFeedInsights = insights;

  const opsLabel = maturity ? `L${maturity.ops.level} ${maturity.ops.levelName}` : '';
  const growthLabel = maturity ? `L${maturity.growth.level} ${maturity.growth.levelName}` : '';
  const subtitle = maturity
    ? `Meridian Consulting · ${opsLabel} Operations · ${growthLabel} Growth`
    : 'Meridian Consulting';

  const visibleInsights = insights.filter(i => !i.dismissed);

  const severityBorder = { high: '#E53E3E', medium: '#F5A623', low: '#4A90D9', positive: '#18B96E' };

  const autonomy = _getAutonomyLevel();
  const isFinancialInsight = i => i.metric === 'overdueInvoices' || i.metric === 'outstandingWIP';

  const cardsHTML = visibleInsights.length
    ? visibleInsights.map(i => {
        const border = severityBorder[i.severity] || '#4A90D9';
        const unreadClass = !i.read ? ' insight-card--unread' : '';
        const iid = escapeAttr(i.id);
        const actionText = escapeAttr(i.action || '');
        const financial = isFinancialInsight(i);
        // Decision-unit fields with safe fallbacks to legacy fields.
        const cardTitle  = escapeHTML(i.situationTitle || i.title || '');
        const cardBridge = escapeHTML(i.decisionBridge || i.body || '');

        let actionBtn;
        if (autonomy === 'notify') {
          actionBtn = `<button class="insight-card-action" onclick="insightActionToChat('${iid}','${actionText}')">Discuss in Chat</button>`;
        } else if (autonomy === 'auto' && !financial) {
          actionBtn = `
            <div class="insight-auto-row">
              <span class="insight-auto-badge">Auto-applying…</span>
              <button class="insight-auto-undo" onclick="insightActionToChat('${iid}','${actionText}')">Undo</button>
            </div>`;
          console.log('[AutoApply] would auto-apply insight:', i.id, i.title);
        } else {
          const usesDrawer = _insightUsesDrawer(i);
          const primaryLabel = escapeHTML(_getInsightPrimaryLabel(i));
          actionBtn = `
            <div class="insight-split-btn">
              <button class="insight-split-primary" onclick="handleInsightPrimaryAction('${iid}','${actionText}',${usesDrawer})">${primaryLabel}</button>
              <button class="insight-split-chevron" onclick="toggleInsightDropdown('${iid}',event)" aria-label="More options" aria-haspopup="true">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="insight-split-dropdown" id="insight-dropdown-${iid}" role="menu">
                ${_renderInsightDropdownItems(i, iid)}
              </div>
            </div>`;
        }
        return `
          <div class="insight-card${unreadClass}" data-insight-id="${iid}" style="border-left-color:${border}">
            <button class="insight-card-dismiss" onclick="dismissInsightCard('${iid}')" title="Dismiss" aria-label="Dismiss insight">×</button>
            <div class="insight-card-title">${cardTitle}</div>
            <div class="insight-card-bridge">${cardBridge}</div>
            ${actionBtn}
          </div>`;
      }).join('')
    : `<div class="assistant-feed-empty">You're all caught up. Check back tomorrow for your next briefing.</div>`;

  feedEl.innerHTML = `
    <div class="assistant-feed-inner">
      <div class="assistant-feed-header">
        <div class="assistant-feed-header-left">
          <div class="assistant-feed-title">Your Assistant</div>
          <div class="assistant-feed-subtitle">${escapeHTML(subtitle)}</div>
        </div>
        <button class="assistant-feed-mark-all" onclick="markAllInsightsRead()">Mark all read</button>
      </div>
      <div class="assistant-feed-cards">${cardsHTML}</div>
    </div>`;
}

async function dismissInsightCard(insightId) {
  try { await fetch(`/api/insights/${encodeURIComponent(insightId)}/dismiss`, { method: 'POST' }); } catch (_) {}
  await renderAssistantFeed();
}

async function markAllInsightsRead() {
  try { await fetch('/api/insights/read-all', { method: 'POST' }); } catch (_) {}
  _assistantUnreadCount = 0;
  renderSidebar();
  await renderAssistantFeed();
}

async function insightActionToChat(insightId, actionText) {
  try { await fetch(`/api/insights/${encodeURIComponent(insightId)}/read`, { method: 'POST' }); } catch (_) {}
  newReport();
  if (actionText && inputEl) {
    inputEl.value = actionText;
    onInput(inputEl);
    inputEl.focus();
  }
}

/* ── Action Drawer + split button ────────────────────── */

function _getInsightPrimaryLabel(insight) {
  if (insight.primaryAction) return insight.primaryAction;
  // Legacy fallbacks for any insight without the decision-unit fields.
  if (insight.type === 'missing_behavior') return 'Submit timesheets';
  if (insight.type === 'at_risk' && insight.metric === 'projectMargin') return 'Apply Changes';
  if (insight.type === 'at_risk' && insight.metric === 'overdueInvoices') return 'Send reminder';
  return insight.action || 'Ask about this';
}

// Renders the dropdown items from insight.secondaryOptions. Falls back to the
// minimum pair (Review in Chat / Dismiss) when the field is missing.
function _renderInsightDropdownItems(insight, iid) {
  const opts = Array.isArray(insight.secondaryOptions) && insight.secondaryOptions.length
    ? insight.secondaryOptions
    : ['Review in Chat', 'Dismiss'];
  return opts.map(opt => {
    if (opt === 'Review in Chat') {
      return `<button class="insight-split-dropdown-item" role="menuitem" onclick="insightReviewInChat('${iid}')">Review in Chat</button>`;
    }
    if (opt === 'Dismiss') {
      return `<button class="insight-split-dropdown-item" role="menuitem" onclick="dismissInsightCard('${iid}')">Dismiss</button>`;
    }
    // Custom option — route to a new chat with the option text as the user message.
    const escOpt = escapeAttr(opt);
    return `<button class="insight-split-dropdown-item" role="menuitem" onclick="insightActionToChat('${iid}','${escOpt}')">${escapeHTML(opt)}</button>`;
  }).join('');
}

function _insightUsesDrawer(insight) {
  if (insight.type === 'missing_behavior') return true;
  if (insight.type === 'at_risk' && insight.metric === 'projectMargin') return true;
  if (insight.type === 'at_risk' && insight.metric === 'overdueInvoices') return true;
  return false;
}

function _getDrawerItems(insight) {
  if (insight.type === 'missing_behavior' && insight.metric === 'timesheetCompletionRate') {
    return [
      { what: 'Submit timesheet for James Wu',  detail: 'Apollo Data Platform / Development · 40hrs · Mon–Fri' },
      { what: 'Submit timesheet for Tom Lawson', detail: 'Genesis CRM / Workshops · 30hrs · Mon–Fri' },
    ];
  }
  if (insight.type === 'at_risk' && insight.metric === 'projectMargin') {
    return [
      { what: 'Flag Nebula Cloud Migration as at-risk', detail: 'Notify PM of budget overrun' },
      { what: 'Generate budget overrun report',         detail: 'For PM review' },
    ];
  }
  if (insight.type === 'at_risk' && insight.metric === 'overdueInvoices') {
    const client = insight.title.replace('Overdue invoice — ', '');
    return [
      { what: `Send payment reminder to ${client}`, detail: insight.body.replace(/\.$/, '') },
    ];
  }
  return [];
}

function _closeAllInsightDropdowns() {
  document.querySelectorAll('.insight-split-dropdown--open').forEach(el => {
    el.classList.remove('insight-split-dropdown--open');
  });
}

function toggleInsightDropdown(insightId, event) {
  event.stopPropagation();
  const dropdown = document.getElementById(`insight-dropdown-${insightId}`);
  if (!dropdown) return;
  const isOpen = dropdown.classList.contains('insight-split-dropdown--open');
  _closeAllInsightDropdowns();
  if (!isOpen) dropdown.classList.add('insight-split-dropdown--open');
}

function handleInsightPrimaryAction(insightId, actionText, usesDrawer) {
  _closeAllInsightDropdowns();
  if (usesDrawer) {
    openInsightActionDrawer(insightId);
  } else {
    insightActionToChat(insightId, actionText);
  }
}

function openInsightActionDrawer(insightId) {
  // Close any open drawers first
  document.querySelectorAll('.insight-drawer').forEach(el => {
    el.classList.remove('insight-drawer--open');
    el.remove();
  });

  const insight = _currentFeedInsights.find(i => i.id === insightId);
  if (!insight) return;
  const items = _getDrawerItems(insight);
  if (!items.length) return;

  const itemsHTML = items.map((item, idx) => `
    <label class="insight-drawer-item">
      <input type="checkbox" class="insight-drawer-checkbox" data-item-idx="${idx}" checked>
      <div class="insight-drawer-item-text">
        <span class="insight-drawer-item-what">${escapeHTML(item.what)}</span>
        <span class="insight-drawer-item-detail">${escapeHTML(item.detail)}</span>
      </div>
    </label>`).join('');

  const drawer = document.createElement('div');
  drawer.className = 'insight-drawer';
  drawer.id = `insight-drawer-${insightId}`;
  drawer.innerHTML = `
    <div class="insight-drawer-header">
      <div class="insight-drawer-title">${escapeHTML(insight.title)}</div>
      <div class="insight-drawer-label">Proposed changes</div>
    </div>
    <div class="insight-drawer-items">${itemsHTML}</div>
    <div class="insight-drawer-footer">
      <button class="insight-drawer-apply" onclick="applySelectedDrawerItems('${escapeAttr(insightId)}')">Apply selected</button>
      <button class="insight-drawer-cancel" onclick="closeInsightActionDrawer('${escapeAttr(insightId)}')">Cancel</button>
    </div>`;

  const cardEl = document.querySelector(`.insight-card[data-insight-id="${insightId}"]`);
  if (!cardEl) return;
  cardEl.parentNode.insertBefore(drawer, cardEl.nextSibling);
  // Tick to allow display:block to apply before adding transition class
  requestAnimationFrame(() => {
    requestAnimationFrame(() => drawer.classList.add('insight-drawer--open'));
  });

  fetch(`/api/insights/${encodeURIComponent(insightId)}/read`, { method: 'POST' }).catch(() => {});
}

function closeInsightActionDrawer(insightId) {
  const drawer = document.getElementById(`insight-drawer-${insightId}`);
  if (!drawer) return;
  drawer.classList.remove('insight-drawer--open');
  drawer.addEventListener('transitionend', () => drawer.remove(), { once: true });
}

function applySelectedDrawerItems(insightId) {
  const drawer = document.getElementById(`insight-drawer-${insightId}`);
  if (!drawer) return;
  const insight = _currentFeedInsights.find(i => i.id === insightId);
  const items = insight ? _getDrawerItems(insight) : [];
  const selected = Array.from(drawer.querySelectorAll('.insight-drawer-checkbox:checked'))
    .map(cb => items[parseInt(cb.dataset.itemIdx, 10)])
    .filter(Boolean);
  console.log('[ActionDrawer] applying selected changes:', selected);
  closeInsightActionDrawer(insightId);
}

async function insightReviewInChat(insightId) {
  _closeAllInsightDropdowns();
  const insight = _currentFeedInsights.find(i => i.id === insightId);
  if (!insight) return;
  try { await fetch(`/api/insights/${encodeURIComponent(insightId)}/read`, { method: 'POST' }); } catch (_) {}
  const openingMsg = `${insight.title} — ${insight.body} What would you like to change before we apply this?`;
  const id = Date.now();
  conversations.unshift({
    id,
    title: insight.title,
    messages: [{ role: 'assistant', content: openingMsg }],
    sql: null,
    savedReport: null,
    reportLibrarySaved: false,
  });
  activeId = id;
  exitAssistantFeedToChat();
  appView = 'chat';
  renderSidebar();
  renderMessages();
  syncChatLayoutState();
  saveConversations();
}

/* ── Empty state — dynamic suggestion chips ──────────── */

const _STATIC_TOP_CHIP_DEFAULTS = [
  'Which projects are tracking over budget this month?',
  'Show me uninvoiced WIP by client',
];
const _SEVERITY_RANK = { high: 0, medium: 1, low: 2, positive: 3 };
const _GHOST_LINE_TEXT = "Based on what's happening in your projects";

let _ghostInputListenerAttached = false;
function _attachGhostInputListener() {
  if (_ghostInputListenerAttached || !inputEl) return;
  _ghostInputListenerAttached = true;
  inputEl.addEventListener('input', () => {
    const ghost = document.getElementById('quick-start-ghost-line');
    if (!ghost) return;
    if (inputEl.value.length > 0) ghost.classList.add('quick-start-ghost-line--fade');
    else                          ghost.classList.remove('quick-start-ghost-line--fade');
  });
}

function _onDynamicChipClick(chipEl) {
  const q = chipEl.dataset.q;
  const insightId = chipEl.dataset.insightId;
  if (insightId) {
    fetch(`/api/insights/${encodeURIComponent(insightId)}/read`, { method: 'POST' }).catch(() => {});
  }
  if (q) submitChip(q);
}

function _onStaticChipClick(chipEl) {
  if (chipEl.dataset.q) submitChip(chipEl.dataset.q);
}

async function populateEmptyStateChips() {
  const wrap = document.getElementById('quick-start-suggestions');
  if (!wrap) return;
  const chips = wrap.querySelectorAll('.suggestion-pill');
  if (chips.length < 2) return;

  let unread = [];
  try {
    const resp = await fetch('/api/insights');
    if (resp.ok) {
      const data = await resp.json();
      unread = (data.insights || []).filter(i => !i.read && !i.dismissed);
    }
  } catch (_) { /* fall back to static defaults */ }

  unread.sort((a, b) => (_SEVERITY_RANK[a.severity] ?? 9) - (_SEVERITY_RANK[b.severity] ?? 9));
  const topInsights = unread.slice(0, 2);

  for (let i = 0; i < 2; i++) {
    const chip = chips[i];
    const insight = topInsights[i];
    // Reset any styling left over from a previous render.
    chip.style.borderLeft = '';
    chip.textContent = '';
    if (insight) {
      const label = insight.action || insight.title;
      chip.dataset.q = label;
      chip.dataset.insightId = insight.id;
      // ✦ icon as a child element so chip text stays text-only.
      const icon = document.createElement('span');
      icon.className = 'suggestion-pill__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✦';
      chip.appendChild(icon);
      chip.appendChild(document.createTextNode(label));
      if (!chip.classList.contains('suggestion-pill--dynamic')) {
        chip.classList.add('suggestion-pill--dynamic');
      }
      chip.onclick = function () { _onDynamicChipClick(this); };
    } else {
      chip.dataset.q = _STATIC_TOP_CHIP_DEFAULTS[i];
      chip.textContent = _STATIC_TOP_CHIP_DEFAULTS[i];
      delete chip.dataset.insightId;
      chip.classList.remove('suggestion-pill--dynamic');
      chip.onclick = function () { _onStaticChipClick(this); };
    }
  }

  // Ghost line — visible only while at least one dynamic chip exists.
  // Inserted as a sibling preceding #quick-start-suggestions so it shares the
  // welcome-state hide rule (see styles.css).
  const showGhost = topInsights.length > 0;
  let ghost = document.getElementById('quick-start-ghost-line');
  if (showGhost) {
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'quick-start-ghost-line';
      ghost.className = 'quick-start-ghost-line';
      ghost.textContent = _GHOST_LINE_TEXT;
      wrap.parentNode.insertBefore(ghost, wrap);
    }
    // (Re-)show; clear any prior fade-on-typing state since we're back to a fresh empty state.
    ghost.style.display = '';
    ghost.classList.remove('quick-start-ghost-line--fade');
    if (inputEl && inputEl.value.length > 0) ghost.classList.add('quick-start-ghost-line--fade');
    _attachGhostInputListener();
  } else if (ghost) {
    ghost.style.display = 'none';
  }
}

/* ── Sidebar drag interactions ──────────────────────── */

const _drag = {
  id: null,
  section: null,
  startX: 0,
  startY: 0,
  active: false,
  ghost: null,
  targetId: null,
};
let _dragConsumeNextClick = false;

function initDragBehavior() {
  convList.addEventListener('mousedown', _onConvMousedown);
  // capture phase: consume click if a drag just finished
  convList.addEventListener('click', _onConvClickCapture, true);
}

function _onConvClickCapture(e) {
  if (_dragConsumeNextClick) {
    _dragConsumeNextClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

function _onConvMousedown(e) {
  if (e.button !== 0) return;
  const item = e.target.closest('.conv-item[data-conv-id]');
  if (!item) return;
  if (e.target.closest('.conv-menu-btn')) return;

  const sectionEl = item.closest('[data-section]');
  const sourceSection = sectionEl ? sectionEl.dataset.section : 'recent';

  _drag.id = parseInt(item.dataset.convId, 10);
  _drag.section = sourceSection;
  _drag.targetId = null;
  _drag.startX = e.clientX;
  _drag.startY = e.clientY;
  _drag.active = false;

  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup', _onDragEnd, { once: true });
}

function _onDragMove(e) {
  const dx = e.clientX - _drag.startX;
  const dy = e.clientY - _drag.startY;
  if (!_drag.active && Math.sqrt(dx * dx + dy * dy) < 5) return;

  if (!_drag.active) {
    _drag.active = true;
    _createDragGhost(e);
    convList.classList.add('dragging');
    document.body.classList.add('sidebar-dragging');
    // Dim the source item
    const srcItem = convList.querySelector(`.conv-item[data-conv-id="${_drag.id}"]`);
    if (srcItem) srcItem.classList.add('conv-item--dragging');
  }

  e.preventDefault();

  if (_drag.ghost) {
    _drag.ghost.style.top  = (e.clientY + 10) + 'px';
    _drag.ghost.style.left = (e.clientX + 14) + 'px';
  }
  _updateDragHighlight(e);
}

function _createDragGhost(e) {
  const conv = conversations.find(c => c.id === _drag.id);
  if (!conv) return;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = conv.title;
  ghost.style.top  = (e.clientY + 10) + 'px';
  ghost.style.left = (e.clientX + 14) + 'px';
  document.body.appendChild(ghost);
  _drag.ghost = ghost;
}

function _updateDragHighlight(e) {
  convList.querySelectorAll('.drop-target-active, .drop-target-item').forEach(el => {
    el.classList.remove('drop-target-active', 'drop-target-item');
  });
  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (!under) return;
  const section = under.closest('[data-section]');
  if (!section) return;
  const targetSection = section.dataset.section;
  if (_drag.section === 'recent') {
    if (targetSection === 'pinned') section.classList.add('drop-target-active');
  } else if (_drag.section === 'pinned') {
    if (targetSection === 'pinned') {
      const item = under.closest('.conv-item[data-conv-id]');
      if (item && parseInt(item.dataset.convId, 10) !== _drag.id) {
        item.classList.add('drop-target-item');
      } else {
        section.classList.add('drop-target-active');
      }
    } else if (targetSection === 'recent') {
      section.classList.add('drop-target-active');
    }
  }
}

function _onDragEnd(e) {
  document.removeEventListener('mousemove', _onDragMove);

  if (!_drag.active) {
    _resetDrag();
    return;
  }

  _dragConsumeNextClick = true;
  convList.classList.remove('dragging');
  convList.querySelectorAll('.drop-target-active, .drop-target-item').forEach(el => {
    el.classList.remove('drop-target-active', 'drop-target-item');
  });

  if (_drag.ghost) { _drag.ghost.remove(); _drag.ghost = null; }

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const targetSectionEl = under && under.closest('[data-section]');
  const targetSection   = targetSectionEl ? targetSectionEl.dataset.section : null;
  const conv = conversations.find(c => c.id === _drag.id);

  if (conv && targetSection === 'pinned' && _drag.section === 'recent') {
    // Recent → Pinned: pin and move to top of pinned
    conv.pinned = true;
    const idx = conversations.indexOf(conv);
    if (idx > -1) conversations.splice(idx, 1);
    conversations.unshift(conv);
    saveConversations();
    renderSidebar();
  } else if (conv && targetSection === 'recent' && _drag.section === 'pinned') {
    // Pinned → Recent: unpin
    conv.pinned = false;
    saveConversations();
    renderSidebar();
  } else if (conv && targetSection === 'pinned' && _drag.section === 'pinned') {
    // Pinned → Pinned: reorder within pinned section
    const targetItem = under && under.closest('.conv-item[data-conv-id]');
    if (targetItem && parseInt(targetItem.dataset.convId, 10) !== _drag.id) {
      const targetId = parseInt(targetItem.dataset.convId, 10);
      const dragIdx = conversations.indexOf(conv);
      if (dragIdx > -1) conversations.splice(dragIdx, 1);
      const newTargetIdx = conversations.findIndex(c => c.id === targetId);
      if (newTargetIdx > -1) conversations.splice(newTargetIdx, 0, conv);
      else conversations.unshift(conv);
      saveConversations();
      renderSidebar();
    }
  }

  _resetDrag();
}

function _resetDrag() {
  if (_drag.id !== null) {
    const srcItem = convList.querySelector(`.conv-item[data-conv-id="${_drag.id}"]`);
    if (srcItem) srcItem.classList.remove('conv-item--dragging');
  }
  _drag.id = null;
  _drag.section = null;
  _drag.targetId = null;
  _drag.active = false;
  if (_drag.ghost) { _drag.ghost.remove(); _drag.ghost = null; }
  convList.classList.remove('dragging');
  document.body.classList.remove('sidebar-dragging');
}

function applyTenantShell() {
  const nameEl = document.getElementById('app-tenant-name');
  const header = document.getElementById('app-tenant-header');
  const brandSlot = document.getElementById('welcome-brand-slot');
  const headline = document.getElementById('welcome-headline');
  const tagline = document.getElementById('welcome-tagline');
  if (nameEl) nameEl.textContent = PW_TENANT_UI.displayName;
  if (header) header.setAttribute('aria-label', `Workspace: ${PW_TENANT_UI.displayName}`);
  if (brandSlot) {
    if (PW_TENANT_UI.brandLogoSrc) {
      brandSlot.classList.add('welcome-brand-slot--custom');
      brandSlot.textContent = '';
      const img = document.createElement('img');
      img.className = 'welcome-brand-logo-img';
      img.alt = '';
      img.width = 48;
      img.height = 48;
      img.src = PW_TENANT_UI.brandLogoSrc;
      brandSlot.appendChild(img);
    } else {
      brandSlot.classList.remove('welcome-brand-slot--custom');
      if (!brandSlot.querySelector('.welcome-mark-svg')) {
        brandSlot.innerHTML =
          '<svg class="welcome-mark-svg" width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<rect x="1.25" y="1.25" width="49.5" height="49.5" rx="15" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.25"/>' +
          '<circle cx="26" cy="26" r="5.5" fill="currentColor" fill-opacity="0.35"/></svg>';
      }
    }
  }
  if (headline && PW_TENANT_UI.welcomeHeadline) headline.textContent = PW_TENANT_UI.welcomeHeadline;
  if (tagline && PW_TENANT_UI.welcomeTagline) tagline.textContent = PW_TENANT_UI.welcomeTagline;
}

/** Toggles centered “new chat” vs bottom-pinned composer from conversation state. */
function syncChatLayoutState() {
  const col = document.getElementById('chat-col');
  if (!col) return;
  const conv = getActive();
  const empty = !conv || !conv.messages.length;
  col.classList.toggle('chat-col--empty', empty);
}

function setAdvisorMode(isAdvisor) {
  // Sent with /api/chat so the server uses the data-advisor route; client hides <pw-options> chips here.
  advisorMode = isAdvisor;
  document.getElementById('btn-mode-report')?.classList.toggle('active', !isAdvisor);
  document.getElementById('btn-mode-advisor')?.classList.toggle('active', isAdvisor);
}

function switchTo(id) {
  if (appView === 'report-detail') {
    leaveReportDetailShell();
    appView = 'chat';
    exitLibraryLayoutToChat();
  } else if (appView === 'library') {
    exitLibraryLayoutToChat();
    appView = 'chat';
  } else if (appView === 'assistant') {
    exitAssistantFeedToChat();
    appView = 'chat';
  }
  activeId = id;
  renderSidebar();
  renderMessages();
  const conv = getActive();
  if (conv && hasCompletedReport(conv)) {
    prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
    if (lastViewedReportId !== null) {
      sqlPanel.classList.add('open');
      lastViewedReportId = id;
    } else {
      sqlPanel.classList.remove('open');
    }
    resetCopyBtn();
    persistUiSnapshot();
  } else {
    _hideSQLPanel();
  }
  syncSaveReportButtonUI();
  updateViewReportTab();
  inputEl.focus();
}

function newReport() {
  if (appView === 'settings') {
    const page = document.getElementById('settings-page');
    if (page) page.style.display = 'none';
    const chatCol = document.getElementById('chat-col');
    if (chatCol) chatCol.style.display = '';
    sqlPanel.style.display = '';
  } else if (appView === 'report-detail') {
    leaveReportDetailShell();
    exitLibraryLayoutToChat();
  } else if (appView === 'library') {
    exitLibraryLayoutToChat();
  } else if (appView === 'assistant') {
    exitAssistantFeedToChat();
  }
  appView = 'chat';
  activeId = null;
  renderSidebar();
  renderMessages();
  closeSQLPanel();
  syncSaveReportButtonUI();
  updateViewReportTab();
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  inputEl.focus();
  populateEmptyStateChips();
  maybeShowGoalPrompt();
}

function submitChip(q) {
  inputEl.value = q;
  onInput(inputEl);
  sendMessage();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('sidebar-open');
    return;
  }
  const isCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem(userKey(SIDEBAR_COLLAPSED_KEY), isCollapsed ? '1' : '0');
  updateCollapseToggleIcon(isCollapsed);
}

/* ── Chat rendering ─────────────────────────────────── */

function getActive() {
  return conversations.find(c => c.id === activeId) || null;
}

function hasCompletedReport(conv) {
  if (!conv) return false;
  if (conv.savedReport && conv.savedReport.sql) return true;
  return !!conv.sql;
}

function getReportSql(conv) {
  if (!conv) return '';
  return (conv.savedReport && conv.savedReport.sql) || conv.sql || '';
}

function getReportReasoning(conv) {
  if (!conv) return null;
  if (conv.savedReport && Object.prototype.hasOwnProperty.call(conv.savedReport, 'reasoning'))
    return conv.savedReport.reasoning || null;
  return conv.reasoning || null;
}

function getReportCategoryForMock(conv) {
  if (!conv) return 'Reports';
  if (conv.savedReport && conv.savedReport.category) return conv.savedReport.category;
  return inferReportCategory(getReportSql(conv), conv.title || '');
}

function renderMessages() {
  chatInner.querySelectorAll('.message, #typing-row').forEach(el => el.remove());
  const conv = getActive();
  if (!conv || !conv.messages.length) {
    welcome.style.display = '';
    syncChatLayoutState();
    return;
  }
  welcome.style.display = 'none';
  conv.messages.forEach(m => chatInner.appendChild(buildMsgEl(m.role, m.content)));
  scrollDown();
  syncChatLayoutState();
}

const PW_AVATAR_SVG = `<svg viewBox="20 15 413 293" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:70%;height:70%;">
  <path d="M66.5723 78.3661H0V322.464H66.5723V78.3661Z" fill="white"/>
  <path d="M257.422 78.3661H195.288V242.578H257.422V78.3661Z" fill="white"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M386.12 45.3766L452.693 0V242.57H386.12V45.3766Z" fill="white"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M288.493 111.913L355.066 66.5366V242.569H288.493V111.913Z" fill="white"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M97.6453 78.3661H164.218V196.636L97.6453 242.012V78.3661Z" fill="white"/>
</svg>`;

function buildMsgEl(role, content) {
  const cssRole = role === 'assistant' ? 'ai' : role;
  const el = document.createElement('div');
  el.className = `message ${cssRole}`;
  const bubbleContent = role === 'assistant' ? processAIContent(content) : escapeHTML(content);
  const avatarInner = role === 'assistant' ? PW_AVATAR_SVG : 'U';
  el.innerHTML = `
    <div class="message-header">
      <div class="avatar ${cssRole}">${avatarInner}</div>
      <span class="message-sender">${role === 'assistant' ? 'ai-assistant-nameless' : 'You'}</span>
    </div>
    <div class="message-body">
      <div class="bubble">${bubbleContent}</div>
    </div>`;
  return el;
}

/* ── Stream preview helper ──────────────────────────── */

// Strips markdown syntax from the streaming preview so asterisks never show raw.
// The fully-rendered version replaces this on onDone via processAIContent.
function stripStreamPreview(text) {
  const stops = [
    text.indexOf('<reasoning>'),
    text.search(/```sql/i),
    text.toLowerCase().indexOf('<pw-options>'),
  ].filter(i => i >= 0);
  const cut = stops.length > 0 ? text.slice(0, Math.min(...stops)).trimEnd() : text;
  return cut
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/* ── AI content processing ──────────────────────────── */

// SQL is stripped and lives in the panel only — never rendered in the bubble.
function processAIContent(raw) {
  const opt = extractPwOptions(raw);
  const { text, sql, reasoning } = extractSQL(opt.text);
  let html = '';
  if (reasoning) html += buildReasoningBlock(reasoning);
  html += marked.parse(text);
  if (sql) html += `<button class="btn-view-sql" onclick="openActiveSQLPanel()">View SQL &rarr;</button>`;
  if (!advisorMode && opt.options && opt.options.length >= 3) {
    html += buildPwClarificationOptions(opt.options);
  }
  return html;
}

/** Renders structured clarification chips (build mode only — caller checks advisorMode). */
function buildPwClarificationOptions(items) {
  const buttons = items
    .filter(o => o && (o.submit || o.label))
    .map(o => {
      const submit = String(o.submit || o.label || '').trim();
      const label = escapeHTML(String(o.label || 'Option').trim());
      const detail = o.detail ? `<span class="pw-option-detail">${escapeHTML(String(o.detail))}</span>` : '';
      const enc = encodeURIComponent(submit);
      return `<button type="button" class="pw-option-btn" data-q="${escapeAttr(enc)}" onclick="pwOptionClick(this)"><span class="pw-option-label">${label}</span>${detail}</button>`;
    })
    .join('');
  if (!buttons) return '';
  return `<div class="pw-clarify-options" role="group" aria-label="Suggested replies">${buttons}</div>`;
}

function pwOptionClick(btn) {
  const enc = btn.getAttribute('data-q');
  if (!enc) return;
  try {
    const q = decodeURIComponent(enc);
    if (q) submitChip(q);
  } catch (_) {}
}

function buildReasoningBlock(reasoning) {
  const prefs = loadPreferences();
  const isOpen = !!prefs.reasoningExpanded;
  const lines = reasoning.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = lines.map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return '';
    const key = escapeHTML(line.slice(0, colonIdx).trim());
    const val = escapeHTML(line.slice(colonIdx + 1).trim());
    return `<div class="reasoning-row"><span class="reasoning-key">${key}</span><span class="reasoning-val">${val}</span></div>`;
  }).join('');
  return `<div class="reasoning-block" data-open="${isOpen}"><button class="reasoning-title" onclick="toggleReasoning(this)">Query Reasoning</button><div class="reasoning-body"><div class="reasoning-body-inner">${rows}</div></div></div>`;
}

function toggleReasoning(btn) {
  const block = btn.closest('.reasoning-block');
  const isOpen = block.getAttribute('data-open') === 'true';
  block.setAttribute('data-open', isOpen ? 'false' : 'true');
}

function openActiveSQLPanel() {
  const conv = getActive();
  if (conv && hasCompletedReport(conv))
    openSQLPanel(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
}

function appendTyping() {
  const el = document.createElement('div');
  el.id = 'typing-row';
  el.className = 'message ai';
  el.innerHTML = `
    <div class="message-header">
      <div class="avatar ai avatar--pulsing">${PW_AVATAR_SVG}</div>
      <span class="message-sender">ai-assistant-nameless</span>
    </div>
    <div class="message-body">
      <div class="bubble typing-placeholder-bubble">
        <div class="typing-pw-stack" aria-hidden="true">
          <div class="ai-thinking">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
        <div class="typing-stream-sink" aria-live="polite"></div>
      </div>
    </div>`;
  chatInner.appendChild(el);
  scrollDown();
}

function clearTypingRowIfDetached(typingRowEl, aiBubbleEl) {
  const tr = typingRowEl || document.getElementById('typing-row');
  if (!tr) return;
  if (aiBubbleEl && tr.contains(aiBubbleEl)) return;
  tr.remove();
}

function clearTypingRowIdFromMessage(aiBubbleEl) {
  if (!aiBubbleEl || typeof aiBubbleEl.closest !== 'function') return;
  const row = aiBubbleEl.closest('.message.ai');
  if (row && row.id === 'typing-row') row.removeAttribute('id');
}

/* ── Abort controller for in-flight requests ────────── */

let _currentAbortController = null;

function stopGeneration() {
  if (_currentAbortController) {
    _currentAbortController.abort();
    _currentAbortController = null;
  }
}

/* ── Send button state ──────────────────────────────── */

const SEND_ARROW_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.47 7.78a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 01-1.06 1.06L8.75 4.81v7.44a.75.75 0 01-1.5 0V4.81L4.53 7.78a.75.75 0 01-1.06 0z"/></svg>`;
const STOP_SQUARE_SVG = `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>`;

const stopBtn = document.getElementById('stop-btn');

function setSendBtnLoading() {
  sendBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'flex';
  inputEl.disabled = true;
}

function setSendBtnIdle() {
  if (stopBtn) stopBtn.style.display = 'none';
  sendBtn.style.display = '';
  sendBtn.innerHTML = SEND_ARROW_SVG;
  inputEl.disabled = false;
  sendBtn.disabled = inputEl.value.trim().length === 0;
}

/* ── Error messages ─────────────────────────────────── */

function friendlyError(raw) {
  if (!raw) return 'Something went wrong. Please try again.';
  const r = String(raw).toLowerCase();
  if (r.includes('overloaded') || r.includes('529'))
    return 'The AI service is busy right now. Please wait a moment and try again.';
  if (r.includes('rate limit') || r.includes('429'))
    return 'Too many requests. Please wait a moment before sending another message.';
  if (r.includes('session') || r.includes('sign in') || r.includes('401') || r.includes('unauthorized'))
    return "We couldn't verify your session. Please sign in again.";
  if (r.includes('network') || r.includes('failed to fetch') || r.includes('econnrefused') || r.includes('connection'))
    return 'Network error — please check your connection and try again.';
  if (r.includes("ai service") || r.includes("configured") || r.includes("administrator"))
    return raw;
  return 'Something went wrong on our end. Please try again in a moment.';
}

/* ── Conversation persistence ───────────────────────── */

function saveConversations() {
  try {
    const toSave = conversations.slice(0, 20).map(c => ({
      id: c.id,
      title: c.title,
      messages: c.messages,
      sql: c.sql || null,
      reasoning: c.reasoning || null,
      savedReport: c.savedReport || null,
      reportLibrarySaved: !!c.reportLibrarySaved,
      pinned: !!c.pinned,
    }));
    localStorage.setItem(userKey('pw_conversations'), JSON.stringify(toSave));
    localStorage.setItem(userKey('pw_active_id'), String(activeId));
  } catch (_) {}
  persistUiSnapshot();
}

function persistUiSnapshot() {
  try {
    let libraryFilter = 'All';
    const chip = document.querySelector('.filter-chip.active');
    if (chip && chip.dataset.filter) libraryFilter = chip.dataset.filter;
    localStorage.setItem(
      userKey(UI_SNAPSHOT_KEY),
      JSON.stringify({
        v: 1,
        appView,
        activeId,
        detailLibraryId:
          detailLibraryEntry && detailLibraryEntry.id != null ? detailLibraryEntry.id : null,
        sqlPanelOpen: sqlPanel.classList.contains('open'),
        libraryFilter,
        rdWorkspace: appView === 'report-detail' ? reportDetailWorkspace : null,
      })
    );
  } catch (_) {}
}

function resetShellToFreshChatLayout() {
  const lib = document.getElementById('library-mode');
  if (lib) {
    lib.classList.remove('lib-visible');
    lib.style.display = 'none';
  }
  const detail = document.getElementById('report-detail-mode');
  if (detail) {
    detail.classList.remove('rd-visible');
    detail.style.display = 'none';
  }
  const feed = document.getElementById('assistant-feed-mode');
  if (feed) feed.style.display = 'none';
  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.style.display = '';
    chatCol.classList.remove('main-fade-out');
  }
  sqlPanel.style.display = '';
}

function hydrateConversation(c) {
  if (!c.sql && (!c.savedReport || !c.savedReport.sql)) return c;
  if (!c.savedReport || !c.savedReport.sql) {
    const question = (c.messages || []).find(m => m.role === 'user')?.content || '';
    c.savedReport = {
      sql: c.sql,
      reasoning: c.reasoning || null,
      title: c.title,
      question,
      category: inferReportCategory(c.sql, c.title || ''),
      completedAt: null,
    };
  }
  if (c.sql == null && c.savedReport && c.savedReport.sql) {
    c.sql = c.savedReport.sql;
    c.reasoning = c.savedReport.reasoning ?? c.reasoning ?? null;
  }
  return c;
}

function restoreUiFromSnapshot(snap) {
  const lib = document.getElementById('library-mode');
  const chatCol = document.getElementById('chat-col');
  const detailEl = document.getElementById('report-detail-mode');

  appView = ['chat', 'library', 'report-detail'].includes(snap.appView) ? snap.appView : 'chat';
  if (snap.activeId != null && conversations.some(c => c.id === snap.activeId)) {
    activeId = snap.activeId;
  } else {
    activeId = null;
  }
  detailLibraryEntry = null;
  reportDetailWorkspace = snap.rdWorkspace === 'sql' ? 'sql' : 'results';

  if (appView === 'report-detail') {
    const reports = loadReports();
    const r = reports.find(x => x.id === snap.detailLibraryId);
    if (!r) {
      appView = 'chat';
      resetShellToFreshChatLayout();
      sqlPanel.classList.remove('open');
      resetCopyBtn();
      const conv = getActive();
      if (conv && hasCompletedReport(conv)) {
        prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
        if (snap.sqlPanelOpen) {
          sqlPanel.classList.add('open');
          lastViewedReportId = activeId;
        }
      }
      return;
    }
    detailLibraryEntry = r;
    lib.classList.remove('lib-visible');
    lib.style.display = 'none';
    chatCol.style.display = 'none';
    chatCol.classList.remove('main-fade-out');
    sqlPanel.style.display = 'none';
    sqlPanel.classList.remove('open');
    resetCopyBtn();
    detailEl.style.display = 'flex';
    detailEl.offsetHeight;
    detailEl.classList.add('rd-visible');
    _ensureSidebarOpen();
    populateReportDetailContent(r);
    switchReportDetailWorkspace(reportDetailWorkspace, false);
    return;
  }

  if (appView === 'library') {
    detailEl.classList.remove('rd-visible');
    detailEl.style.display = 'none';
    chatCol.style.display = 'none';
    chatCol.classList.remove('main-fade-out');
    sqlPanel.classList.remove('open');
    resetCopyBtn();
    sqlPanel.style.display = 'none';
    lib.style.display = 'flex';
    lib.offsetHeight;
    lib.classList.add('lib-visible');
    const filter = snap.libraryFilter && typeof snap.libraryFilter === 'string' ? snap.libraryFilter : 'All';
    filterLibrary(filter);
    return;
  }

  resetShellToFreshChatLayout();
  sqlPanel.classList.remove('open');
  resetCopyBtn();
  const conv = getActive();
  if (conv && hasCompletedReport(conv)) {
    prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
    if (snap.sqlPanelOpen) {
      sqlPanel.classList.add('open');
      lastViewedReportId = activeId;
    }
  }
}

function loadConversations() {
  purgeExpiredDeletedConversations();

  try {
    const raw = localStorage.getItem(userKey('pw_conversations'));
    if (raw) conversations = JSON.parse(raw);
  } catch (_) {
    conversations = [];
  }
  conversations.forEach(c => {
    hydrateConversation(c);
    if (c.pinned === undefined) c.pinned = false;
  });

  // Two signals can indicate a fresh login (vs a page refresh):
  //   1. Login page clears pw_tab_session_started* from sessionStorage before redirect (primary)
  //   2. Server appends ?fresh=1 to the post-login redirect URL (belt-and-suspenders)
  // Either signal alone is sufficient — both are checked here.
  const isFreshLogin = new URLSearchParams(location.search).get('fresh') === '1';
  if (isFreshLogin) {
    history.replaceState(null, '', location.pathname + location.hash);
    // Remove all variants of the tab-session key regardless of user-ID suffix.
    for (let _i = sessionStorage.length - 1; _i >= 0; _i--) {
      const _k = sessionStorage.key(_i);
      if (_k && _k.startsWith(TAB_SESSION_KEY)) sessionStorage.removeItem(_k);
    }
  }

  const tabSessionActive = !isFreshLogin && sessionStorage.getItem(userKey(TAB_SESSION_KEY)) === '1';

  if (!tabSessionActive) {
    activeId = null;
    appView = 'chat';
    detailLibraryEntry = null;
    reportDetailWorkspace = 'results';
    resetShellToFreshChatLayout();
    sqlPanel.classList.remove('open');
    resetCopyBtn();
    renderSidebar();
    renderMessages();
    syncSaveReportButtonUI();
    updateViewReportTab();
    updateSidebarNavLabels();
    sessionStorage.setItem(userKey(TAB_SESSION_KEY), '1');
    persistUiSnapshot();
    return;
  }

  let snap = null;
  try {
    snap = JSON.parse(localStorage.getItem(userKey(UI_SNAPSHOT_KEY)) || 'null');
  } catch (_) {
    snap = null;
  }

  if (snap && typeof snap === 'object' && snap.v === 1) {
    restoreUiFromSnapshot(snap);
  } else {
    const savedId = Number(localStorage.getItem(userKey('pw_active_id')));
    if (savedId && conversations.find(c => c.id === savedId)) activeId = savedId;
    else activeId = null;
    appView = 'chat';
    detailLibraryEntry = null;
    reportDetailWorkspace = 'results';
    resetShellToFreshChatLayout();
    sqlPanel.classList.remove('open');
    resetCopyBtn();
    const conv = getActive();
    if (conv && hasCompletedReport(conv)) {
      prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
    }
  }

  renderSidebar();
  renderMessages();
  syncSaveReportButtonUI();
  updateViewReportTab();
  updateSidebarNavLabels();
  persistUiSnapshot();
}

/* ── Report library ──────────────────────────────────── */

function inferReportCategory(sql, title) {
  const t = (sql + ' ' + title).toLowerCase();
  if (/utilisation|utilization|capacity/.test(t))              return 'Utilisation';
  if (/revenue|invoice|invoiced|billing/.test(t))              return 'Revenue';
  if (/margin|profit|profitability/.test(t))                   return 'Margin';
  if (/expense/.test(t))                                       return 'Expenses';
  if (/timesheet|time\s*entry|hours\s*worked|minutes/.test(t)) return 'Time';
  if (/person|people|staff|consultant|team/.test(t))           return 'People';
  if (/project|budget|burn|phase/.test(t))                     return 'Projects';
  return 'Reports';
}

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(userKey(MANUAL_REPORTS_KEY)) || '[]');
  } catch (_) {
    return [];
  }
}

function saveReportToLibraryManual() {
  if (appView === 'report-detail') return;
  const conv = getActive();
  if (!conv || !hasCompletedReport(conv) || conv.reportLibrarySaved) return;

  const sql = getReportSql(conv);
  const reasoning = getReportReasoning(conv);
  const question =
    (conv.savedReport && conv.savedReport.question) ||
    (conv.messages || []).find(m => m.role === 'user')?.content ||
    '';
  const category = getReportCategoryForMock(conv);
  const libraryId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record = {
    id: libraryId,
    conversationId: conv.id,
    title: conv.title,
    question,
    sql,
    reasoning,
    category,
    savedAt: new Date().toISOString(),
  };

  try {
    const reports = loadReports();
    reports.unshift(record);
    localStorage.setItem(userKey(MANUAL_REPORTS_KEY), JSON.stringify(reports.slice(0, 50)));
  } catch (_) {
    return;
  }

  conv.reportLibrarySaved = true;
  saveConversations();
  syncSaveReportButtonUI();
}

function syncSaveReportButtonUI() {
  const btn = document.getElementById('btn-save-report');
  const msg = document.getElementById('save-report-confirm');
  if (!btn) return;

  const conv = getActive();
  const eligible = conv && hasCompletedReport(conv);

  if (!eligible) {
    btn.disabled = true;
    btn.textContent = 'Save Report';
    btn.classList.remove('saved');
    if (msg) {
      msg.hidden = true;
    }
    return;
  }

  if (conv.reportLibrarySaved) {
    btn.disabled = true;
    btn.textContent = 'Saved ✓';
    btn.classList.add('saved');
    if (msg) msg.hidden = false;
  } else {
    btn.disabled = false;
    btn.textContent = 'Save Report';
    btn.classList.remove('saved');
    if (msg) msg.hidden = true;
  }
}

function updateViewReportTab() {
  const tab = document.getElementById('view-report-tab');
  if (!tab) return;

  const lib = document.getElementById('library-mode');
  const inLibrary =
    lib &&
    lib.style.display !== 'none' &&
    lib.classList.contains('lib-visible');

  const inReportDetail = appView === 'report-detail';

  const conv = getActive();
  const panelOpen = sqlPanel.classList.contains('open');
  const show = !inLibrary && !inReportDetail && conv && hasCompletedReport(conv) && !panelOpen;

  tab.hidden = !show;
  tab.style.display = show ? 'flex' : 'none';
}

function reopenResultsPanel() {
  const conv = getActive();
  if (!hasCompletedReport(conv)) return;
  openSQLPanel(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
}

function viewReportPage() {
  const conv = getActive();
  if (!hasCompletedReport(conv)) return;

  const r = {
    id: null,
    conversationId: conv ? conv.id : null,
    title: conv.title || 'Report',
    sql: getReportSql(conv),
    reasoning: getReportReasoning(conv),
    category: getReportCategoryForMock(conv),
  };

  detailLibraryEntry = r;
  appView = 'report-detail';
  reportDetailWorkspace = 'results';

  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.classList.add('main-fade-out');
    chatCol.offsetHeight;
    setTimeout(() => {
      chatCol.style.display = 'none';
      chatCol.classList.remove('main-fade-out');
    }, 220);
  }

  const lib = document.getElementById('library-mode');
  if (lib && lib.style.display !== 'none') {
    lib.classList.remove('lib-visible');
    setTimeout(() => { lib.style.display = 'none'; }, 220);
  }

  sqlPanel.classList.remove('open');
  sqlPanel.style.display = 'none';

  const detail = document.getElementById('report-detail-mode');
  detail.style.display = 'flex';
  detail.offsetHeight;
  detail.classList.add('rd-visible');

  _ensureSidebarOpen();
  populateReportDetailContent(r);
  switchReportDetailWorkspace('results', false);
  updateSidebarNavLabels();
  updateViewReportTab();
  persistUiSnapshot();
}

function exitLibraryLayoutToChat() {
  const lib = document.getElementById('library-mode');
  lib.classList.remove('lib-visible');
  setTimeout(() => {
    lib.style.display = 'none';
  }, 220);

  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.style.display = '';
    chatCol.classList.add('main-fade-out');
    chatCol.offsetHeight;
    requestAnimationFrame(() => {
      chatCol.classList.remove('main-fade-out');
    });
  }

  sqlPanel.style.display = '';
}

function switchToLibrary() {
  if (appView === 'report-detail') {
    leaveReportDetailShell();
  }
  appView = 'library';

  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.classList.add('main-fade-out');
    chatCol.offsetHeight;
    setTimeout(() => {
      chatCol.style.display = 'none';
      chatCol.classList.remove('main-fade-out');
    }, 220);
  }
  lastViewedReportId = null;
  sqlPanel.classList.remove('open');
  sqlPanel.style.display = 'none';
  const lib = document.getElementById('library-mode');
  lib.style.display = 'flex';
  lib.offsetHeight;
  lib.classList.add('lib-visible');
  filterLibrary('All');
  updateViewReportTab();
  updateSidebarNavLabels();
}

function switchToChat() {
  if (appView === 'report-detail') {
    leaveReportDetailShell();
  }
  appView = 'chat';
  exitLibraryLayoutToChat();
  const conv = getActive();
  if (conv && hasCompletedReport(conv)) {
    prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
    if (lastViewedReportId !== null) {
      sqlPanel.classList.add('open');
      lastViewedReportId = activeId;
    } else {
      sqlPanel.classList.remove('open');
    }
    resetCopyBtn();
    persistUiSnapshot();
  } else {
    _hideSQLPanel();
  }
  syncSaveReportButtonUI();
  updateViewReportTab();
  updateSidebarNavLabels();
  inputEl.focus();
}

function filterLibrary(filter) {
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === filter);
  });
  const all = loadReports();
  const filtered = filter === 'All' ? all : all.filter(r => r.category === filter);
  renderReportList(filtered, filter);
  persistUiSnapshot();
}

function renderReportList(reports, filter) {
  const listEl = document.getElementById('library-list');
  if (!listEl) return;
  if (!reports.length) {
    listEl.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <path d="M0 2.5A1.5 1.5 0 011.5 1h8.75a.75.75 0 010 1.5H1.5a.5.5 0 00-.5.5v10a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V8.75a.75.75 0 011.5 0V13.5a2 2 0 01-2 2h-10a2 2 0 01-2-2V2.5z"/>
            <path d="M5 7.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 015 7.5zm0 3a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 015 10.5zM12.5 2.5a2 2 0 114 0 2 2 0 01-4 0z"/>
          </svg>
        </div>
        <p class="library-empty-title">No reports${filter !== 'All' ? ` in ${filter}` : ''} yet</p>
        <p class="library-empty-sub">Start a conversation to build your first report.</p>
        <button class="btn-empty-new" onclick="switchToChat(); newReport();">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>
          New Chat
        </button>
      </div>`;
    return;
  }
  listEl.innerHTML = reports.map(r => {
    const date = new Date(r.savedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <div class="report-card" onclick='openReportFromLibrary(${JSON.stringify(r.id)})'>
        <div class="report-card-icon">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2.5A1.5 1.5 0 011.5 1h8.75a.75.75 0 010 1.5H1.5a.5.5 0 00-.5.5v10a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V8.75a.75.75 0 011.5 0V13.5a2 2 0 01-2 2h-10a2 2 0 01-2-2V2.5zm5.75 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z"/>
          </svg>
        </div>
        <div class="report-card-body">
          <div class="report-card-title">${escapeHTML(r.title)}</div>
          <div class="report-card-meta">${escapeHTML(date)}</div>
        </div>
        <div class="report-card-tag">${escapeHTML(r.category)}</div>
      </div>`;
  }).join('');
}

function leaveReportDetailShell() {
  const detail = document.getElementById('report-detail-mode');
  if (detail) {
    detail.classList.remove('rd-visible');
    detail.style.display = 'none';
  }
  detailLibraryEntry = null;
  reportDetailWorkspace = 'results';
}

function updateSidebarNavLabels() {
  const label = document.getElementById('sidebar-main-nav-label');
  const btn = document.getElementById('btn-sidebar-main-nav');
  if (!label || !btn) return;
  if (appView === 'chat') {
    label.textContent = 'View All Reports';
    btn.title = 'All reports';
  } else {
    label.textContent = 'Return to Chat';
    btn.title = 'Return to chat';
  }
}

function handleSidebarMainNav() {
  if (appView === 'chat') switchToLibrary();
  else if (appView === 'settings') closeSettingsView();
  else returnToChatFromSidebar();
}

function returnToChatFromSidebar() {
  if (appView === 'report-detail') {
    returnToChatFromReportDetail();
    return;
  }
  if (appView === 'library') {
    switchToChat();
    return;
  }
  if (appView === 'assistant') {
    exitAssistantFeedToChat();
    appView = 'chat';
    updateSidebarNavLabels();
  }
}

function switchReportDetailWorkspace(mode, doPersist = true) {
  reportDetailWorkspace = mode === 'sql' ? 'sql' : 'results';
  const resultsView = document.getElementById('rd-panel-results');
  const sqlView = document.getElementById('rd-panel-sql');
  const btnRes = document.getElementById('rd-ws-results');
  const btnSql = document.getElementById('rd-ws-sql');
  if (!resultsView || !sqlView) return;
  if (reportDetailWorkspace === 'results') {
    resultsView.style.display = '';
    sqlView.style.display = 'none';
    btnRes?.classList.add('active');
    btnSql?.classList.remove('active');
    btnRes?.setAttribute('aria-selected', 'true');
    btnSql?.setAttribute('aria-selected', 'false');
  } else {
    resultsView.style.display = 'none';
    sqlView.style.display = '';
    btnRes?.classList.remove('active');
    btnSql?.classList.add('active');
    btnRes?.setAttribute('aria-selected', 'false');
    btnSql?.setAttribute('aria-selected', 'true');
  }
  if (doPersist) persistUiSnapshot();
}

function syncDetailReportSaveUI() {
  const btn = document.getElementById('rd-btn-save-report');
  const msg = document.getElementById('rd-save-report-confirm');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Saved ✓';
  btn.classList.add('saved');
  if (msg) msg.hidden = false;
}

function buildSeededReportAssistantRaw(r, question) {
  const title = r.title || 'this report';
  let reasoningBlock;
  if (r.reasoning && String(r.reasoning).trim()) {
    reasoningBlock = `<reasoning>\n${String(r.reasoning).trim()}\n</reasoning>\n\n`;
  } else {
    const qLine = question || 'Saved report from My Reports';
    reasoningBlock = `<reasoning>\nQuestion interpreted as: ${qLine}\nTables being queried: (see SQL)\nFilters applied: —\nDate logic used: —\nPotential data gotchas: —\n</reasoning>\n\n`;
  }
  const intro = `Would you like to continue working on ${escapeHTML(title)}?\n\nI've pulled in your saved report from My Reports so you can refine it here.`;
  return `${reasoningBlock}${intro}\n\n\`\`\`sql\n${r.sql}\n\`\`\``;
}

function returnToChatFromReportDetail() {
  const r = detailLibraryEntry;
  leaveReportDetailShell();
  appView = 'chat';

  exitLibraryLayoutToChat();
  const chatColReveal = document.getElementById('chat-col');
  if (chatColReveal) {
    chatColReveal.classList.add('rd-reveal-from-detail');
    setTimeout(() => chatColReveal.classList.remove('rd-reveal-from-detail'), 450);
  }

  if (r) {
    const cid = r.conversationId;
    const existing = cid != null && conversations.some(c => c.id === cid);

    if (existing) {
      activeId = cid;
      renderSidebar();
      renderMessages();
      saveConversations();
    } else {
      const id = Date.now();
      const cat = r.category || inferReportCategory(r.sql, r.title || '');
      const question = r.question || '';
      const raw = buildSeededReportAssistantRaw(r, question);
      const extracted = extractSQL(raw);
      conversations.unshift({
        id,
        title: r.title || generateTitle(question || 'Report'),
        messages: [{ role: 'assistant', content: raw }],
        sql: extracted.sql || r.sql,
        reasoning: extracted.reasoning ?? (r.reasoning || null),
        savedReport: {
          sql: r.sql,
          reasoning: r.reasoning || null,
          title: r.title,
          question,
          category: cat,
          completedAt: r.savedAt || new Date().toISOString(),
        },
        reportLibrarySaved: true,
      });
      activeId = id;
      renderSidebar();
      renderMessages();
      saveConversations();
    }
  }

  const conv = getActive();
  if (conv && hasCompletedReport(conv)) {
    prepareSQLPanelContent(getReportSql(conv), conv.title, getReportCategoryForMock(conv));
    if (lastViewedReportId !== null) {
      sqlPanel.classList.add('open');
      lastViewedReportId = activeId;
    } else {
      sqlPanel.classList.remove('open');
    }
    resetCopyBtn();
    persistUiSnapshot();
  } else {
    _hideSQLPanel();
  }
  syncSaveReportButtonUI();
  updateViewReportTab();
  updateSidebarNavLabels();
  inputEl.focus();
}

function switchFromReportDetailToLibrary() {
  leaveReportDetailShell();
  appView = 'library';
  lastViewedReportId = null;

  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.style.display = 'none';
    chatCol.classList.remove('main-fade-out');
  }

  sqlPanel.classList.remove('open');
  sqlPanel.style.display = 'none';

  const lib = document.getElementById('library-mode');
  lib.style.display = 'flex';
  lib.offsetHeight;
  lib.classList.add('lib-visible');

  const activeChip = document.querySelector('.filter-chip.active');
  const filter = activeChip && activeChip.dataset.filter ? activeChip.dataset.filter : 'All';
  filterLibrary(filter);

  updateSidebarNavLabels();
  updateViewReportTab();
}

function populateReportDetailContent(r) {
  document.getElementById('rd-title').textContent = r.title || 'Report';

  // Set dynamic chat button label
  const chatBtn = document.getElementById('rd-chat-btn');
  if (chatBtn) {
    const cid = r && r.conversationId != null ? r.conversationId : null;
    const hasConv = cid !== null && conversations.some(c => c.id === cid);
    chatBtn.textContent = hasConv ? 'Continue in Chat →' : 'Open in Chat →';
  }

  const kicker = document.getElementById('rd-category-line');
  if (kicker) {
    const cat = r.category || inferReportCategory(r.sql, r.title || '');
    kicker.textContent = cat;
  }
  const cat = r.category || inferReportCategory(r.sql, r.title || '');
  const data = generateMockData(r.sql, cat);
  renderResultsTable(data, document.getElementById('rd-thead-row'), document.getElementById('rd-tbody'));

  const rdPre = document.getElementById('rd-sql-output');
  rdPre.innerHTML = highlightSQL(r.sql);
  rdPre._rawSQL = r.sql;

  resetRdCopyBtn();
  syncDetailReportSaveUI();
}

function openReportFromLibrary(libraryId) {
  const reports = loadReports();
  const r = reports.find(x => x.id === libraryId);
  if (!r) return;

  detailLibraryEntry = r;
  appView = 'report-detail';
  reportDetailWorkspace = 'results';

  const lib = document.getElementById('library-mode');
  lib.classList.remove('lib-visible');
  setTimeout(() => {
    lib.style.display = 'none';
  }, 220);

  const chatCol = document.getElementById('chat-col');
  if (chatCol) {
    chatCol.style.display = 'none';
    chatCol.classList.remove('main-fade-out');
  }

  sqlPanel.classList.remove('open');
  sqlPanel.style.display = 'none';

  const detail = document.getElementById('report-detail-mode');
  detail.style.display = 'flex';
  detail.offsetHeight;
  detail.classList.add('rd-visible');

  _ensureSidebarOpen();
  populateReportDetailContent(r);
  switchReportDetailWorkspace('results', false);
  updateSidebarNavLabels();
  updateViewReportTab();
  persistUiSnapshot();
}

function copyReportDetailSql() {
  const rdPre = document.getElementById('rd-sql-output');
  const btn = document.getElementById('rd-btn-copy-sql');
  const raw = (rdPre && rdPre._rawSQL) || (rdPre && rdPre.textContent) || '';
  if (!raw) return;
  navigator.clipboard.writeText(raw).then(() => {
    if (btn) showCopyTooltip(btn, 'Copied!');
  });
}

function resetRdCopyBtn() {
  const btn = document.getElementById('rd-btn-copy-sql');
  if (btn) btn.setAttribute('data-tooltip', 'Copy');
}

function downloadReportFromDetail() {
  const r = detailLibraryEntry;
  if (!r || !r.sql) return;

  const title = r.title || 'Report';
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const dateSlug = now.toISOString().slice(0, 10);
  const fileSlug = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  const filename = `${fileSlug}-${dateSlug}.sql.txt`;

  const reasoningText = r.reasoning || null;
  const hr = '-'.repeat(48);
  let out = `ai-assistant-nameless — Report Export\n${hr}\nReport:    ${title}\nGenerated: ${timestamp}\n`;
  if (reasoningText) {
    out += `\n${hr}\nQUERY REASONING\n${hr}\n`;
    reasoningText.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => { out += `${l}\n`; });
  }
  out += `\n${hr}\nSQL QUERY\n${hr}\n${r.sql}\n`;

  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Send ───────────────────────────────────────────── */

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  const isFirst = activeId === null;

  if (isFirst) {
    const id = Date.now();
    conversations.unshift({
      id,
      title: generateTitle(text),
      messages: [],
      sql: null,
      savedReport: null,
      reportLibrarySaved: false,
    });
    activeId = id;
    renderSidebar();
  }

  const conv = getActive();
  conv.messages.push({ role: 'user', content: text });
  saveConversations();

  inputEl.value = '';
  inputEl.style.height = 'auto';
  setSendBtnLoading();

  welcome.style.display = 'none';
  syncChatLayoutState();
  chatInner.appendChild(buildMsgEl('user', text));
  scrollDown();
  appendTyping();

  if (isFirst) {
    generateTitleWithAI(text).then(aiTitle => {
      const title = aiTitle || generateTitle(text);
      if (title) {
        conv.title = title;
        if (conv.savedReport) conv.savedReport.title = title;
        renderSidebar();
        saveConversations();
        if (sqlPanel.classList.contains('open') && activeId === conv.id)
          document.getElementById('sql-panel-name').textContent = title;
      }
    }).catch(() => {
      // AI title failed — local title from generateTitle() already set at creation time
    });
  }

  let aiBubble = null;
  let streamAccumulated = '';

  _currentAbortController = new AbortController();

  sendToAI(conv.messages, {
    advisorMode,
    signal: _currentAbortController.signal,
    onChunk(chunk) {
      if (!aiBubble) {
        const typingRow = document.getElementById('typing-row');
        const bubble = typingRow && typingRow.querySelector('.bubble.typing-placeholder-bubble');
        if (bubble) {
          aiBubble = bubble;
          // Stop avatar pulsing when first chunk arrives
          const avatarEl = typingRow && typingRow.querySelector('.avatar--pulsing');
          if (avatarEl) avatarEl.classList.remove('avatar--pulsing');
          const stack = bubble.querySelector('.typing-pw-stack');
          const sink = bubble.querySelector('.typing-stream-sink');
          if (stack) stack.classList.add('typing-pw-stack--exit');
          if (sink) { sink.classList.add('typing-stream-sink--visible'); sink.classList.add('typing-cursor'); }
          let stackRemoved = false;
          const removeStack = () => {
            if (stackRemoved || !stack || !stack.parentNode) return;
            stackRemoved = true;
            stack.remove();
          };
          if (stack) {
            stack.addEventListener('transitionend', removeStack, { once: true });
            setTimeout(removeStack, 280);
          }
        } else {
          clearTypingRowIfDetached(typingRow, null);
          const msgEl = buildMsgEl('assistant', '');
          aiBubble = msgEl.querySelector('.bubble');
          aiBubble.classList.add('typing-cursor');
          chatInner.appendChild(msgEl);
        }
      }
      streamAccumulated += chunk;
      // Show only plain text before <reasoning> or ```sql — never show raw SQL or markdown tags
      const stops = [
        streamAccumulated.indexOf('<reasoning>'),
        streamAccumulated.search(/```sql/i),
        streamAccumulated.toLowerCase().indexOf('<pw-options>'),
      ].filter(i => i >= 0);
      const rawPreview = stops.length > 0
        ? streamAccumulated.slice(0, Math.min(...stops)).trimEnd()
        : streamAccumulated;
      const preview = stripStreamPreview(rawPreview);
      const sink = aiBubble && aiBubble.querySelector('.typing-stream-sink');
      if (sink && sink.classList.contains('typing-stream-sink--visible')) {
        sink.textContent = preview;
      } else {
        aiBubble.textContent = preview;
      }
      scrollDown();
    },

    onDone({ sql, reasoning, raw }) {
      _currentAbortController = null;
      clearTypingRowIfDetached(null, aiBubble);

      if (!raw.trim()) {
        const emptyRow = aiBubble && aiBubble.closest ? aiBubble.closest('.message.ai') : null;
        if (emptyRow) emptyRow.remove();
        else document.getElementById('typing-row')?.remove();
        chatInner.appendChild(buildMsgEl('assistant', `<span class="empty-state-hint">No response received. Please try rephrasing your question.</span>`));
        setSendBtnIdle(); scrollDown(); return;
      }

      if (aiBubble) {
        aiBubble.classList.remove('typing-cursor');
        const streamSink = aiBubble.querySelector('.typing-stream-sink');
        if (streamSink) streamSink.classList.remove('typing-cursor');
        aiBubble.innerHTML = processAIContent(raw);
      } else {
        chatInner.appendChild(buildMsgEl('assistant', raw));
      }
      clearTypingRowIdFromMessage(aiBubble);

      conv.messages.push({ role: 'assistant', content: raw });

      if (sql) {
        conv.reportLibrarySaved = false;
        const question = (conv.messages || []).find(m => m.role === 'user')?.content || '';
        const category = inferReportCategory(sql, conv.title);
        conv.savedReport = {
          sql,
          reasoning: reasoning || null,
          title: conv.title,
          question,
          category,
          completedAt: new Date().toISOString(),
        };
        conv.sql = sql;
        conv.reasoning = reasoning || null;
        openSQLPanel(sql, conv.title, category);
      }

      saveConversations();
      setSendBtnIdle();
      scrollDown();

      // Auto-extract memorable facts from this turn (fire-and-forget)
      const userTurn = conv.messages.slice(-2).find(m => m.role === 'user');
      if (userTurn && raw) {
        extractMemoryFromTurn(userTurn.content, raw).catch(() => {});
      }
    },

    onError(errMsg) {
      _currentAbortController = null;
      const errRow = aiBubble && aiBubble.closest ? aiBubble.closest('.message.ai') : null;
      if (errRow) errRow.remove();
      else document.getElementById('typing-row')?.remove();
      chatInner.appendChild(buildMsgEl('assistant', `<span class="error-bubble">${escapeHTML(friendlyError(errMsg))}</span>`));
      setSendBtnIdle(); scrollDown();
    },

    onAborted() {
      _currentAbortController = null;
      // Clean up the in-progress bubble
      const typingRow = document.getElementById('typing-row');
      if (typingRow) typingRow.remove();
      if (aiBubble) {
        aiBubble.classList.remove('typing-cursor');
        const row = aiBubble.closest ? aiBubble.closest('.message.ai') : null;
        if (streamAccumulated.trim()) {
          // Keep whatever was streamed, mark it as stopped
          if (row) row.id && row.removeAttribute('id');
          aiBubble.innerHTML = processAIContent(streamAccumulated) +
            '<span class="stopped-indicator"> ···  <span class="stopped-label">Stopped</span></span>';
        } else {
          // Nothing streamed — remove the whole row
          if (row) row.remove();
        }
      }
      setSendBtnIdle(); scrollDown();
    },
  });
}

/* ── SQL Panel ──────────────────────────────────────── */

function prepareSQLPanelContent(sql, title, categoryOpt) {
  document.getElementById('sql-panel-name').textContent = title || 'SQL Output';
  sqlOutput.innerHTML = highlightSQL(sql);
  sqlOutput._rawSQL = sql;
  const category = categoryOpt || inferReportCategory(sql, title || '');
  renderResultsTable(generateMockData(sql, category));
  switchPanelTab('results');
  syncSaveReportButtonUI();
}

function openSQLPanel(sql, title, categoryOpt) {
  prepareSQLPanelContent(sql, title, categoryOpt);
  sqlPanel.classList.add('open');
  lastViewedReportId = activeId;
  updateViewReportTab();
  persistUiSnapshot();
}

function _hideSQLPanel() {
  sqlPanel.classList.remove('open');
  resetCopyBtn();
  updateViewReportTab();
  persistUiSnapshot();
}

function closeSQLPanel() {
  lastViewedReportId = null;
  _hideSQLPanel();
}

function switchPanelTab(tabName) {
  const resultsView = document.getElementById('panel-results-view');
  const sqlView     = document.getElementById('panel-sql-view');
  const tabResults  = document.getElementById('tab-results');
  const tabSQL      = document.getElementById('tab-sql');
  if (!resultsView || !sqlView) return;
  if (tabName === 'results') {
    resultsView.style.display = ''; sqlView.style.display     = 'none';
    tabResults?.classList.add('active'); tabSQL?.classList.remove('active');
  } else {
    resultsView.style.display = 'none'; sqlView.style.display     = '';
    tabResults?.classList.remove('active'); tabSQL?.classList.add('active');
  }
}

function showCopyTooltip(btn, text) {
  const existing = document.getElementById('_copy-tooltip');
  if (existing) existing.remove();
  const tooltip = document.createElement('div');
  tooltip.id = '_copy-tooltip';
  tooltip.className = 'copy-tooltip-body';
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  const rect = btn.getBoundingClientRect();
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  let top = rect.top - th - 6;
  let left = rect.left + rect.width / 2 - tw / 2;
  if (top < 4) top = rect.top + 4;
  if (left < 4) left = 4;
  if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
  tooltip.style.cssText = `position:fixed;top:${top}px;left:${left}px;z-index:9999;`;
  const dismiss = () => {
    tooltip.remove();
    document.removeEventListener('click', dismiss);
    document.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e) => { if (e.key === 'Escape') dismiss(); };
  setTimeout(() => dismiss(), 2000);
  setTimeout(() => document.addEventListener('click', dismiss, { once: true }), 10);
  document.addEventListener('keydown', onEsc);
}

const _COPY_PANEL_ICON_DEFAULT = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z" /></svg>`;

function copySQLPanel() {
  const raw = sqlOutput._rawSQL || sqlOutput.textContent;
  navigator.clipboard.writeText(raw).catch(() => {});
}

function resetCopyBtn() {
  const btn = document.getElementById('btn-copy-panel');
  if (!btn) return;
  btn.innerHTML = _COPY_PANEL_ICON_DEFAULT;
  btn.style.color = '';
}

/* ── Mock results data ───────────────────────────────── */

// Placeholder results preview — not real query output.
// TODO: Replace with live SQL execution once DB_HOST is configured in .env
// and the /api/execute endpoint is implemented in server.js.

const MOCK = {
  months:   ['Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026'],
  clients:  ['Apex Financial Group','Meridian Health','BlueStar Financial Services','TechCore Solutions','Nexus Property Group','Pacific Infrastructure Partners'],
  projects: ['Orion Digital Transformation','Nebula Cloud Migration','Apollo Data Platform','Voyager ERP Consolidation','Eclipse Risk & Compliance Uplift','Genesis CRM Implementation'],
  persons:  ['Leonardo DiCaprio','Scarlett Johansson','Natalie Portman','Benedict Cumberbatch','Brad Pitt','Tessa Thompson'],
  teams:    ['Delivery','Data & Analytics','Strategy & Advisory','Sales','Operations','Leadership'],
  statuses: ['Active','Active','Completed','In Progress','Active','On Hold'],
  pms:      ['Leonardo DiCaprio','Benedict Cumberbatch','Scarlett Johansson','Natalie Portman','Brad Pitt','Emma Stone'],
};

function generateMockData(sql, category) {
  if (!sql) return null;
  const columns = parseSelectColumns(sql);
  const rows = Array.from({ length: 6 }, (_, i) =>
    columns.map(col => mockValue(col.toLowerCase(), i, category || 'Reports'))
  );
  return { columns, rows };
}

function parseSelectColumns(sql) {
  const match = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i);
  if (!match) return ['Column 1','Column 2','Column 3'];
  return splitOnCommas(match[1]).map(def => {
    def = def.trim();
    const asMatch = def.match(/\bAS\s+\[?([^\]\s,]+)\]?\s*$/i);
    if (asMatch) return asMatch[1].replace(/[[\]]/g, '');
    const lastIdent = def.match(/\b([A-Za-z][A-Za-z0-9_]*)\s*$/);
    return lastIdent ? lastIdent[1].replace(/[[\]]/g, '') : 'Value';
  }).slice(0, 9);
}

function splitOnCommas(str) {
  const result = []; let depth = 0, start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    else if (str[i] === ',' && depth === 0) { result.push(str.slice(start, i)); start = i + 1; }
  }
  result.push(str.slice(start));
  return result;
}

function fmtCurrency(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mockValue(col, i, category) {
  // Revenue amounts vary by category
  const revAmounts  = [187500, 94200, 243800, 68400, 156900, 211400];
  const costAmounts = [112500, 56520, 146280, 41040, 94140, 126840];
  const budgetAmts  = [215000, 108000, 280000, 78500, 180000, 243000];
  const hours       = [152.5, 98.0, 176.5, 63.0, 144.0, 118.5];
  const capacity    = [168.0, 168.0, 152.0, 176.0, 160.0, 168.0];
  const utilPct     = ['90.8%','58.3%','116.1%','35.8%','90.0%','70.5%'];

  if (/month|period|monthstart|weekstart/.test(col)) return MOCK.months[i % 6];
  if (/client|company|account/.test(col))            return MOCK.clients[i % 6];
  if (/project|job|engagement/.test(col))            return MOCK.projects[i % 6];
  if (/team/.test(col))                              return MOCK.teams[i % 6];
  if (/status/.test(col))                            return MOCK.statuses[i % 6];
  if (/manager|pm|accountmanager/.test(col))         return MOCK.pms[i % 6];
  if (/person|name|consultant|staff|engineer/.test(col) && !/company|project/.test(col)) return MOCK.persons[i % 6];
  if (/util|pct|percent/.test(col))                  return utilPct[i % 6];
  if (/revenue|invoiced|beforetax/.test(col))        return fmtCurrency(revAmounts[i % 6]);
  if (/fee(?!budget)|billed/.test(col))              return fmtCurrency(revAmounts[i % 6]);
  if (/budgetfee|feebudget/.test(col))               return fmtCurrency(budgetAmts[i % 6]);
  if (/budget(?!fee)/.test(col))                     return fmtCurrency(budgetAmts[i % 6]);
  if (/cost/.test(col) && !/timecode/.test(col))     return fmtCurrency(costAmounts[i % 6]);
  if (/margin|profit/.test(col))                     return fmtCurrency(revAmounts[i % 6] - costAmounts[i % 6]);
  if (/capacit|workhour|avail/.test(col))            return capacity[i % 6].toFixed(1);
  if (/hour|minute|time|worked|logged/.test(col))    return hours[i % 6].toFixed(1);
  if (/rate/.test(col))                              return fmtCurrency(150 + i * 25);
  if (/count|num|qty|invoice(?!d)/.test(col))        return 2 + i;
  if (/date|invoicedate/.test(col))                  return MOCK.months[i % 6];
  if (/remaining|unspent/.test(col))                 return fmtCurrency(budgetAmts[i % 6] - revAmounts[i % 6]);
  return '—';
}

function isRightAlignCol(colName) {
  const c = colName.toLowerCase().replace(/[^a-z]/g, '');
  return /revenue|invoiced|fee|amount|cost|margin|profit|budget|rate|hour|minute|time|util|pct|percent|count|num|qty|remaining|capacity|worked|logged/.test(c);
}

function renderResultsTable(data, theadEl, tbodyEl) {
  currentMockData = data; // store for full screen view and CSV export
  const thead = theadEl || document.getElementById('results-thead-row');
  const tbody = tbodyEl || document.getElementById('results-tbody');
  if (!thead || !tbody || !data) return;

  thead.innerHTML = data.columns.map(c =>
    `<th class="${isRightAlignCol(c) ? 'num' : ''}">${escapeHTML(c)}</th>`
  ).join('');

  tbody.innerHTML = data.rows.map((row, ri) =>
    `<tr>${row.map((cell, ci) =>
      `<td class="${isRightAlignCol(data.columns[ci]) ? 'num' : ''}">${escapeHTML(String(cell))}</td>`
    ).join('')}</tr>`
  ).join('');
}

/* ── Metabase modal ──────────────────────────────────── */

// TODO: Replace openMetabaseModal's "Open Metabase" action with an actual
// deep-link to the target Metabase collection/dashboard once the DB
// connection and Metabase API integration are live.

function openMetabaseModal() {
  const modal = document.getElementById('metabase-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('modal-visible'));
}

function closeMetabaseModal() {
  const modal = document.getElementById('metabase-modal');
  if (!modal) return;
  modal.classList.remove('modal-visible');
  setTimeout(() => { modal.style.display = 'none'; }, 220);
}

/* ── Full screen report modal ───────────────────────── */

function openFullScreenReport() {
  const modal = document.getElementById('fullscreen-report-modal');
  if (!modal) return;

  document.getElementById('fs-report-title').textContent =
    document.getElementById('sql-panel-name').textContent || 'Report';

  const fsThead = document.getElementById('fs-thead-row');
  const fsTbody = document.getElementById('fs-tbody');
  if (currentMockData && fsThead && fsTbody) {
    fsThead.innerHTML = currentMockData.columns.map(c =>
      `<th class="${isRightAlignCol(c) ? 'num' : ''}">${escapeHTML(c)}</th>`
    ).join('');
    fsTbody.innerHTML = currentMockData.rows.map(row =>
      `<tr>${row.map((cell, ci) =>
        `<td class="${isRightAlignCol(currentMockData.columns[ci]) ? 'num' : ''}">${escapeHTML(String(cell))}</td>`
      ).join('')}</tr>`
    ).join('');
  }

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('fs-visible'));
}

function closeFullScreenReport() {
  const modal = document.getElementById('fullscreen-report-modal');
  if (!modal) return;
  modal.classList.remove('fs-visible');
  setTimeout(() => { modal.style.display = 'none'; }, 220);
}

// TODO: When live-connected, this exports real query results
function exportCSV() {
  if (!currentMockData) return;
  let title = 'Report';
  if (appView === 'report-detail' && detailLibraryEntry) {
    title = detailLibraryEntry.title || title;
  } else {
    const conv = getActive();
    title = (conv && conv.title) || document.getElementById('sql-panel-name').textContent || 'Report';
  }
  const dateSlug = new Date().toISOString().slice(0, 10);
  const fileSlug = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  const filename = `${fileSlug}-${dateSlug}.csv`;

  const { columns, rows } = currentMockData;
  const csvContent = [columns, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Download report ────────────────────────────────── */

function downloadReport() {
  const conv = getActive();
  const sql = getReportSql(conv);
  if (!conv || !sql) return;

  const title     = conv.title || 'Report';
  const now       = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const dateSlug  = now.toISOString().slice(0, 10);
  const fileSlug  = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  const filename  = `${fileSlug}-${dateSlug}.sql.txt`;

  const reasoningText = getReportReasoning(conv);
  const hr = '-'.repeat(48);
  let out  = `ai-assistant-nameless — Report Export\n${hr}\nReport:    ${title}\nGenerated: ${timestamp}\n`;
  if (reasoningText) {
    out += `\n${hr}\nQUERY REASONING\n${hr}\n`;
    reasoningText.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => { out += `${l}\n`; });
  }
  out += `\n${hr}\nSQL QUERY\n${hr}\n${sql}\n`;

  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function iconCopy() {
  return COPY_BTN_SVG;
}

function copyCodeBlock(btn) {
  const wrap = btn.closest('.chat-code-wrap') || btn.closest('.sql-code-block');
  const pre = wrap && wrap.querySelector('pre');
  const text = (pre && pre._rawSQL) || (pre && pre.textContent) || '';
  if (!text) return;
  navigator.clipboard.writeText(text.trim()).then(() => {
    btn.setAttribute('data-tooltip', 'Copied!');
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => btn.setAttribute('data-tooltip', 'Copy'), 2000);
  }).catch(() => {
    btn.setAttribute('data-tooltip', 'Failed');
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => btn.setAttribute('data-tooltip', 'Copy'), 2000);
  });
}

function iconCheck() {
  return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`;
}

/* ── SQL syntax highlighter ─────────────────────────── */

function highlightSQL(sql) {
  const KEYWORDS = new Set([
    'SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS',
    'ON','AS','AND','OR','NOT','IN','IS','NULL','LIKE','BETWEEN','EXISTS',
    'GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','DISTINCT','TOP','WITH',
    'UNION','ALL','EXCEPT','INTERSECT','CASE','WHEN','THEN','ELSE','END',
    'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP',
    'TABLE','VIEW','INDEX','IF','BEGIN','COMMIT','ROLLBACK','DECLARE',
    'CAST','CONVERT','OVER','PARTITION','ROW_NUMBER','RANK','DENSE_RANK',
    'NTILE','LAG','LEAD','FIRST_VALUE','LAST_VALUE','ROWS','RANGE',
    'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW','ASC','DESC',
    'CTE','RECURSIVE','PIVOT','UNPIVOT','APPLY','NOLOCK','ISNULL','COALESCE','NULLIF','IIF'
  ]);
  const FUNCTIONS = new Set([
    'SUM','COUNT','AVG','MIN','MAX','ROUND','ABS','CEILING','FLOOR',
    'ISNULL','COALESCE','NULLIF','IIF','CAST','CONVERT','LEN','LEFT',
    'RIGHT','SUBSTRING','REPLACE','TRIM','LTRIM','RTRIM','UPPER','LOWER',
    'DATEDIFF','DATEADD','DATENAME','DATEPART','GETDATE','FORMAT',
    'ROW_NUMBER','RANK','DENSE_RANK','NTILE','LAG','LEAD',
    'FIRST_VALUE','LAST_VALUE','STDEV','VAR','STRING_AGG','STUFF','CONCAT'
  ]);
  const tokens = []; let i = 0; const s = sql;
  while (i < s.length) {
    if (s.startsWith('--', i)) {
      const end = s.indexOf('\n', i);
      const t = end === -1 ? s.slice(i) : s.slice(i, end);
      tokens.push(`<span class="sql-comment">${esc(t)}</span>`); i += t.length; continue;
    }
    if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2);
      const t = end === -1 ? s.slice(i) : s.slice(i, end + 2);
      tokens.push(`<span class="sql-comment">${esc(t)}</span>`); i += t.length; continue;
    }
    if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'" && s[j+1] === "'") { j += 2; continue; }
        if (s[j] === "'") { j++; break; }
        j++;
      }
      tokens.push(`<span class="sql-string">${esc(s.slice(i, j))}</span>`); i = j; continue;
    }
    if (/[0-9]/.test(s[i]) || (s[i] === '.' && /[0-9]/.test(s[i+1] || ''))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push(`<span class="sql-number">${esc(s.slice(i, j))}</span>`); i = j; continue;
    }
    if (/[A-Za-z_@#]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_@#]/.test(s[j])) j++;
      const word = s.slice(i, j), upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) tokens.push(`<span class="sql-keyword">${esc(word)}</span>`);
      else if (FUNCTIONS.has(upper)) tokens.push(`<span class="sql-function">${esc(word)}</span>`);
      else tokens.push(esc(word));
      i = j; continue;
    }
    tokens.push(esc(s[i])); i++;
  }
  return tokens.join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Title generation ───────────────────────────────── */

function generateTitle(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/\b(i'?m)\b/g, 'i am')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'New Chat';

  const words = normalized.split(' ');
  const has = (...terms) => terms.some(term => words.includes(term));
  const hasPhrase = phrase => normalized.includes(phrase);

  const titleCase = phrase => phrase
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  if (has('testing', 'test') && has('chat', 'chats')) {
    if (has('summarize', 'summarizes', 'summary', 'summaries', 'asking'))
      return 'Testing Chat Summaries';
    if (has('look', 'looks', 'appearance', 'visual', 'style', 'design'))
      return 'Testing Chat Appearance';
    return 'Testing Chat Experience';
  }

  if (has('project', 'projects') && (hasPhrase('over budget') || (has('over') && has('budget'))))
    return 'Over Budget Projects';

  const groupedMetrics = [
    'revenue', 'margin', 'profitability', 'utilisation', 'utilization',
    'capacity', 'wip', 'invoices', 'expenses', 'forecast'
  ];
  const groupables = ['client', 'project', 'person', 'team', 'manager', 'month', 'quarter'];
  const metric = groupedMetrics.find(w => words.includes(w));
  const byIdx = words.indexOf('by');
  if (metric && byIdx !== -1) {
    const group = words.slice(byIdx + 1).find(w => groupables.includes(w));
    if (group) return titleCase(`${metric} by ${group}`);
  }

  const replacements = new Map([
    ['summarize', 'summaries'],
    ['summarizes', 'summaries'],
    ['summary', 'summaries'],
    ['looks', 'appearance'],
    ['look', 'appearance'],
    ['visual', 'appearance'],
    ['chats', 'chat'],
  ]);
  const stop = new Set([
    'show','me','a','an','the','of','for','with','and','or','in','on','at','to','if',
    'i','am','want','need','can','get','give','please','what','how','is','are','was','were',
    'list','all','some','each','every','build','create','make','write','report',
    'query','sql','data','table','from','where','select','see','now','last','this','that'
  ]);
  const kept = [];
  words.forEach(word => {
    const mapped = replacements.get(word) || word;
    if (mapped.length <= 1 || stop.has(mapped) || kept.includes(mapped)) return;
    kept.push(mapped);
  });

  if (!kept.length) return titleCase(words.filter(w => w.length > 1).slice(0, 5).join(' ') || 'New Chat');
  return titleCase(kept.slice(0, 5).join(' '));
}

/* ── File attach ────────────────────────────────────── */

function handleAttachFile(input) {
  if (!input.files || !input.files.length) return;
  input.value = '';
}

/* ── Input ──────────────────────────────────────────── */

function onInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  sendBtn.disabled = el.value.trim().length === 0;
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
}

/* ── Util ───────────────────────────────────────────── */

function scrollDown() { chatArea.scrollTop = chatArea.scrollHeight; }

function escapeHTML(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function escapeAttr(s) { return escapeHTML(s); }

/* ── Keyboard shortcuts ──────────────────────────────── */

document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'k') { e.preventDefault(); newReport(); return; }
  if (e.key === 'Escape' && document.activeElement !== inputEl) {
    const fsModal = document.getElementById('fullscreen-report-modal');
    if (fsModal && fsModal.style.display !== 'none') { closeFullScreenReport(); return; }
    const modal = document.getElementById('metabase-modal');
    if (modal && modal.style.display !== 'none') closeMetabaseModal();
    else if (appView === 'report-detail') switchFromReportDetailToLibrary();
    else closeSQLPanel();
    return;
  }
  if (mod && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    if (appView === 'report-detail') {
      copyReportDetailSql();
      return;
    }
    const conv = getActive();
    if (conv && hasCompletedReport(conv)) copySQLPanel();
    return;
  }
});

/* ── Confirm modal (delete / archive) ───────────────── */

let _pendingConfirmAction = null;

function showConfirmModal(title, body, actionLabel, onConfirm) {
  _pendingConfirmAction = onConfirm;
  const titleEl  = document.getElementById('confirm-modal-title');
  const bodyEl   = document.getElementById('confirm-modal-body');
  const actionEl = document.getElementById('confirm-modal-action-btn');
  if (titleEl)  titleEl.textContent  = title;
  if (bodyEl)   bodyEl.textContent   = body;
  if (actionEl) actionEl.textContent = actionLabel;
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'flex';
}

function closeConfirmModal() {
  _pendingConfirmAction = null;
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'none';
}

function executeConfirmModal() {
  const fn = _pendingConfirmAction;
  closeConfirmModal();
  if (fn) fn();
}

/* ── Settings panel ─────────────────────────────────── */

function openSettings() { openSettingsView(); }
function closeSettings() { closeSettingsView(); }

function getInitials(str) {
  if (!str) return '?';
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

function updateSettingsProfileUI() {
  _updateSettingsPageProfile();
}

function renderSettingsArchived() {
  const listEl = document.getElementById('settings-archived-list');
  if (!listEl) return;
  const arcs = loadArchivedConversations();
  if (!arcs.length) {
    listEl.innerHTML = `<p class="settings-empty">No archived conversations</p>`;
    return;
  }
  listEl.innerHTML = arcs.map(c => `
    <div class="settings-conv-card">
      <div class="settings-conv-title">${escapeHTML(c.title)}</div>
      <button type="button" class="btn-settings-restore" onclick="restoreArchivedConversation(${c.id})">Restore</button>
    </div>`).join('');
}

function renderSettingsDeleted() {
  const listEl = document.getElementById('settings-deleted-list');
  if (!listEl) return;
  const dels = loadDeletedConversations();
  if (!dels.length) {
    listEl.innerHTML = `<p class="settings-empty">No recently deleted conversations</p>`;
    return;
  }
  const now = Date.now();
  listEl.innerHTML = dels.map(c => {
    const msLeft = (c.deletedAt + DELETED_PURGE_DAYS * 24 * 60 * 60 * 1000) - now;
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    const deletedDate = new Date(c.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    return `
      <div class="settings-conv-card">
        <div class="settings-conv-title">${escapeHTML(c.title)}</div>
        <div class="settings-conv-meta">Deleted ${deletedDate} · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</div>
        <button type="button" class="btn-settings-restore" onclick="restoreDeletedConversation(${c.id})">Restore</button>
      </div>`;
  }).join('');
}

/* ── Connections card ───────────────────────────────── */

async function loadAndRenderConnections() {
  const listEl = document.getElementById('settings-connections-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="settings-empty">Loading…</p>';
  try {
    const res = await fetch('/api/integrations/status');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    renderConnectionsCard(listEl, data.integrations || []);
  } catch {
    listEl.innerHTML = '<p class="settings-empty">Could not load connection status.</p>';
  }
}

function renderConnectionsCard(listEl, integrations) {
  if (!integrations.length) {
    listEl.innerHTML = '<p class="settings-empty">No integrations configured.</p>';
    return;
  }

  const statusDotClass = {
    connected:     'settings-conn-dot--connected',
    disconnected:  'settings-conn-dot--disconnected',
    not_configured:'settings-conn-dot--unconfigured',
    coming_soon:   'settings-conn-dot--soon',
  };

  listEl.innerHTML = integrations.map(intg => {
    const dotClass = statusDotClass[intg.status] || 'settings-conn-dot--soon';
    const metaLine = intg.lastCheckedAt
      ? `<div class="settings-conn-meta">Checked ${new Date(intg.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`
      : '';
    const ctaHtml = intg.status === 'coming_soon'
      ? `<span class="settings-conn-badge">Coming soon</span>`
      : `<button type="button" class="btn-settings-conn-action">${escapeHTML(intg.actionLabel)}</button>`;
    return `
      <div class="settings-conn-row">
        <div class="settings-conn-dot ${dotClass}"></div>
        <div class="settings-conn-info">
          <div class="settings-conn-label">${escapeHTML(intg.label)}</div>
          <div class="settings-conn-desc">${escapeHTML(intg.description)}</div>
          ${metaLine}
        </div>
        <div class="settings-conn-cta">${ctaHtml}</div>
      </div>`;
  }).join('');
}

/* ── Preferences (localStorage) ─────────────────────── */
// NOTE: pw_preferences values will be injected into the system prompt in a future update.

function loadPreferences() {
  try { return JSON.parse(localStorage.getItem(userKey(PREFERENCES_KEY)) || '{}'); }
  catch (_) { return {}; }
}

function savePreferences() {
  const dateRange       = document.getElementById('pref-date-range')?.value || '3m';
  const revenueDef      = document.getElementById('pref-revenue-def')?.value || 'both';
  const reasoningToggle = document.getElementById('pref-reasoning-toggle');
  const reasoningExpanded = reasoningToggle?.getAttribute('aria-checked') === 'true';
  const prefs = { defaultDateRange: dateRange, revenueDefinition: revenueDef, reasoningExpanded };
  try { localStorage.setItem(userKey(PREFERENCES_KEY), JSON.stringify(prefs)); }
  catch (_) {}
}

function applyPreferencesUI(prefs) {
  const dateRangeEl      = document.getElementById('pref-date-range');
  const revenueDefEl     = document.getElementById('pref-revenue-def');
  const reasoningToggle  = document.getElementById('pref-reasoning-toggle');
  if (dateRangeEl && prefs.defaultDateRange)  dateRangeEl.value  = prefs.defaultDateRange;
  if (revenueDefEl && prefs.revenueDefinition) revenueDefEl.value = prefs.revenueDefinition;
  if (reasoningToggle) reasoningToggle.setAttribute('aria-checked', String(!!prefs.reasoningExpanded));
}

function toggleReasoningPref() {
  const toggle = document.getElementById('pref-reasoning-toggle');
  if (!toggle) return;
  const current = toggle.getAttribute('aria-checked') === 'true';
  toggle.setAttribute('aria-checked', String(!current));
  savePreferences();
}

/* ── Memory (server-side, per user) ─────────────────── */

let _memoryItems = [];

async function loadMemoryFromServer() {
  try {
    const r = await fetch('/api/memory', { credentials: 'same-origin' });
    if (!r.ok) return;
    const data = await r.json();
    _memoryItems = Array.isArray(data.items) ? data.items : [];
  } catch (_) {}
}

async function saveMemoryToServer(items) {
  try {
    await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items }),
    });
  } catch (_) {}
}

async function clearAllMemory() {
  try {
    await fetch('/api/memory', { method: 'DELETE', credentials: 'same-origin' });
    _memoryItems = [];
    renderMemoryItems();
  } catch (_) {}
}

async function deleteMemoryItem(index) {
  _memoryItems = _memoryItems.filter((_, i) => i !== index);
  await saveMemoryToServer(_memoryItems);
  renderMemoryItems();
}

function renderMemoryItems() {
  const container = document.getElementById('memory-items-list');
  if (!container) return;
  if (!_memoryItems.length) {
    container.innerHTML = '<p class="settings-empty">No memory saved yet. Add something below.</p>';
    return;
  }
  container.innerHTML = _memoryItems.map((item, i) => `
    <div class="memory-item">
      <span class="memory-item-text">${escapeHTML(item)}</span>
      <button type="button" class="btn-memory-delete" onclick="deleteMemoryItem(${i})" aria-label="Delete this memory item" title="Delete">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>
      </button>
    </div>`).join('');
}

/* Keep legacy localStorage helpers for migration path */
function loadMemory() {
  return localStorage.getItem(userKey(USER_MEMORY_KEY)) || '';
}

function updateMemoryCounter() {
  const counter = document.getElementById('settings-memory-counter');
  if (counter) counter.textContent = `${_memoryItems.length} item${_memoryItems.length !== 1 ? 's' : ''}`;
}

async function extractMemoryFromTurn(userMessage, assistantMessage) {
  if (!userMessage || !assistantMessage) return;
  try {
    await fetch('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userMessage, assistantMessage }),
    });
  } catch (_) {}
}

/* ── Auth session + preferences (server) ─────────────── */

async function loadAuthSession() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    pwCurrentUser = data.user || null;
    pwPreferences = data.preferences || null;
    const emailEl = document.getElementById('sidebar-user-email');
    if (emailEl && pwCurrentUser?.email) {
      emailEl.textContent = pwCurrentUser.email;
    }
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl && pwCurrentUser) {
      const displayStr = (pwPreferences && pwPreferences.name) || pwCurrentUser.name || pwCurrentUser.email.split('@')[0] || '';
      nameEl.textContent = displayStr;
    }
    const avatarEl = document.getElementById('sidebar-user-avatar');
    if (avatarEl && pwCurrentUser) {
      const displayStr = (pwPreferences && pwPreferences.name) || pwCurrentUser.name || pwCurrentUser.email || '';
      avatarEl.textContent = getInitials(displayStr);
    }
  } catch (_) {
    /* offline — leave UI usable until next request fails */
  }
}

/**
 * PATCH a subset of user preferences. Returns false on error.
 * FUTURE: call from a settings panel; wire to AI context.
 */
async function updatePwPreferences(patch) {
  try {
    const r = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(patch || {}),
    });
    if (!r.ok) return false;
    const data = await r.json();
    pwPreferences = data.preferences || pwPreferences;
    return true;
  } catch (_) {
    return false;
  }
}

/* ── loadGreeting ────────────────────────────────────── */
// Fetches the tenant's pre-written opening message and displays it on the
// welcome screen. Only runs when no prior conversations exist.

async function loadGreeting() {
  if (conversations.length > 0) return;
  try {
    const r = await fetch('/api/greeting', { credentials: 'same-origin' });
    if (!r.ok) return;
    const { greeting } = await r.json();
    if (!greeting) return;
    const greetingEl = document.getElementById('welcome-greeting');
    if (!greetingEl) return;
    greetingEl.appendChild(buildMsgEl('assistant', greeting));
  } catch (_) {}
}

/* ── Init ────────────────────────────────────────────── */

function initSQLPanelExtras() {
  const footer = document.querySelector('#sql-panel .results-panel-actions');
  if (footer && !footer.querySelector('.btn-panel-export-csv')) {
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn-panel-export-csv';
    exportBtn.onclick = exportCSV;
    exportBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"/></svg> Export CSV`;
    footer.appendChild(exportBtn);
  }
}

applyTenantShell();
initSQLPanelExtras();
// Close insight split-button dropdowns when clicking outside them.
document.addEventListener('click', () => _closeAllInsightDropdowns());
// Auth must resolve before loading any user-scoped storage. loadConversations()
// and initSidebar() read localStorage keys namespaced by pwCurrentUser.id, so
// they must run after the user is known.
(async () => {
  await loadAuthSession();
  loadConversations();
  initSidebar();
  loadGreeting();
  populateEmptyStateChips();
  maybeShowGoalPrompt();
})();

/* ── Profile popover ─────────────────────────────────── */

let _profilePopoverOpen = false;

function openProfilePopover(triggerEl) {
  const popover = document.getElementById('profile-popover');
  if (!popover) return;

  if (_profilePopoverOpen) {
    closeProfilePopover();
    return;
  }

  const emailEl = document.getElementById('profile-popover-email');
  if (emailEl) emailEl.textContent = pwCurrentUser?.email || '';

  popover.removeAttribute('hidden');

  const rect = triggerEl.getBoundingClientRect();
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;

  let top = rect.top - ph - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.left;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;

  popover.style.top  = top  + 'px';
  popover.style.left = left + 'px';

  _profilePopoverOpen = true;
  setTimeout(() => {
    document.addEventListener('click', _closePopoverOnOutside, { once: true });
  }, 0);
}

function _closePopoverOnOutside(e) {
  const popover = document.getElementById('profile-popover');
  if (popover && !popover.contains(e.target)) closeProfilePopover();
}

function closeProfilePopover() {
  const popover = document.getElementById('profile-popover');
  if (popover) popover.setAttribute('hidden', '');
  _profilePopoverOpen = false;
}

/* ── Settings view (appView === 'settings') ──────────── */

function openSettingsView() {
  closeProfilePopover();
  appView = 'settings';

  // Hide other main-area views
  const chatCol = document.getElementById('chat-col');
  const lib     = document.getElementById('library-mode');
  const detail  = document.getElementById('report-detail-mode');
  if (chatCol) chatCol.style.display = 'none';
  if (lib) { lib.classList.remove('lib-visible'); lib.style.display = 'none'; }
  if (detail) { detail.classList.remove('rd-visible'); detail.style.display = 'none'; }
  sqlPanel.style.display = 'none';

  const page = document.getElementById('settings-page');
  if (!page) return;
  page.style.display = 'flex';

  _updateSettingsPageProfile();
  switchSettingsTab('general');
  updateSidebarNavLabels();
}

function closeSettingsView() {
  appView = 'chat';

  const page = document.getElementById('settings-page');
  if (page) page.style.display = 'none';

  const chatCol = document.getElementById('chat-col');
  if (chatCol) chatCol.style.display = '';
  sqlPanel.style.display = '';

  renderMessages();
  syncSaveReportButtonUI();
  updateViewReportTab();
  updateSidebarNavLabels();
  inputEl.focus();
}

function openSettingsPage() { openSettingsView(); }
function closeSettingsPage() { closeSettingsView(); }

function _updateSettingsPageProfile() {
  const name        = (pwPreferences && pwPreferences.name) || (pwCurrentUser && (pwCurrentUser.name || pwCurrentUser.email.split('@')[0])) || '';
  const displayName = (pwPreferences && pwPreferences.displayName) || '';
  const email       = (pwCurrentUser && pwCurrentUser.email) || '';

  const avEl  = document.getElementById('settings-page-avatar');
  const emEl  = document.getElementById('settings-page-email-display');
  const fnEl  = document.getElementById('sp-full-name');
  const dnEl  = document.getElementById('sp-display-name');

  if (avEl) avEl.textContent = getInitials(name || email);
  if (emEl) emEl.textContent = email || '—';
  if (fnEl) fnEl.value = name;
  if (dnEl) dnEl.value = displayName;
}

function switchSettingsTab(tab) {
  ['general', 'capabilities', 'data', 'faq'].forEach(t => {
    const pane = document.getElementById('settings-tab-' + t);
    const nav  = document.getElementById('settings-nav-' + t);
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
    if (nav)  nav.classList.toggle('active', t === tab);
  });
  if (tab === 'capabilities') {
    loadMemoryFromServer().then(() => { renderMemoryItems(); updateMemoryCounter(); });
    loadAndRenderConnections();
    renderAutonomySelector();
    renderCoachingSelector();
    renderGoalSelector();
  }
  if (tab === 'data') {
    renderSettingsArchived();
    renderSettingsDeleted();
  }
}

/* ── Assistant Autonomy setting ──────────────────────── */

function _getAutonomyLevel() {
  return (pwPreferences && pwPreferences.assistantAutonomy) || 'propose';
}

function renderAutonomySelector() {
  const level = _getAutonomyLevel();
  document.querySelectorAll('.autonomy-option').forEach(btn => {
    const active = btn.dataset.level === level;
    btn.classList.toggle('autonomy-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

async function setAutonomyLevel(level) {
  const allowed = ['notify', 'propose', 'auto'];
  if (!allowed.includes(level)) return;
  renderAutonomySelectorOptimistic(level);
  const ok = await updatePwPreferences({ assistantAutonomy: level });
  if (!ok) renderAutonomySelector();
}

function renderAutonomySelectorOptimistic(level) {
  if (pwPreferences) pwPreferences.assistantAutonomy = level;
  document.querySelectorAll('.autonomy-option').forEach(btn => {
    const active = btn.dataset.level === level;
    btn.classList.toggle('autonomy-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

/* ── Coaching Style setting ──────────────────────────── */

function _getCoachingStyle() {
  return (pwPreferences && pwPreferences.coachingStyle) || 'supportive';
}

function renderCoachingSelector() {
  const style = _getCoachingStyle();
  document.querySelectorAll('.coaching-option').forEach(btn => {
    const active = btn.dataset.style === style;
    btn.classList.toggle('coaching-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

async function setCoachingStyle(style) {
  const allowed = ['supportive', 'direct', 'data'];
  if (!allowed.includes(style)) return;
  if (pwPreferences) pwPreferences.coachingStyle = style;
  document.querySelectorAll('.coaching-option').forEach(btn => {
    const active = btn.dataset.style === style;
    btn.classList.toggle('coaching-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
  const ok = await updatePwPreferences({ coachingStyle: style });
  if (!ok) renderCoachingSelector();
}

/* ── Performance Goal setting ────────────────────────── */

function _getFirmGoal() {
  return (pwPreferences && pwPreferences.firmGoal) || 'steady';
}

function renderGoalSelector() {
  const goal = _getFirmGoal();
  document.querySelectorAll('.goal-option').forEach(btn => {
    const active = btn.dataset.goal === goal;
    btn.classList.toggle('goal-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

async function setFirmGoal(goal) {
  const allowed = ['stable', 'steady', 'significant', 'top'];
  if (!allowed.includes(goal)) return;
  if (pwPreferences) pwPreferences.firmGoal = goal;
  document.querySelectorAll('.goal-option').forEach(btn => {
    const active = btn.dataset.goal === goal;
    btn.classList.toggle('goal-option--active', active);
    btn.setAttribute('aria-checked', String(active));
  });
  const ok = await updatePwPreferences({ firmGoal: goal });
  if (!ok) renderGoalSelector();
}

/* ── First-run goal prompt ────────────────────────────── */

const _GOAL_PROMPT_KEY = 'pw_goal_prompt_shown';

function _buildGoalPromptCard() {
  const card = document.createElement('div');
  card.className = 'goal-prompt-card';
  card.id = 'goal-prompt-card';

  const title = document.createElement('p');
  title.className = 'goal-prompt-title';
  title.textContent = 'Before we start — what’s your goal?';
  card.appendChild(title);

  const body = document.createElement('p');
  body.className = 'goal-prompt-body';
  body.textContent = 'Your assistant adjusts how urgently it coaches based on your ambition level. Pick the one that fits where your firm is right now.';
  card.appendChild(body);

  const pills = document.createElement('div');
  pills.className = 'goal-prompt-pills';

  const options = [
    { goal: 'stable',      label: 'Keep things stable' },
    { goal: 'steady',      label: 'Steady improvement' },
    { goal: 'significant', label: 'Significant growth' },
    { goal: 'top',         label: 'Hit top-performer numbers' },
  ];
  for (const { goal, label } of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'goal-prompt-pill';
    btn.textContent = label;
    btn.onclick = async () => {
      localStorage.setItem(_GOAL_PROMPT_KEY, '1');
      await setFirmGoal(goal);
      card.remove();
    };
    pills.appendChild(btn);
  }
  card.appendChild(pills);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'goal-prompt-skip';
  skip.textContent = 'Skip for now';
  skip.onclick = async () => {
    localStorage.setItem(_GOAL_PROMPT_KEY, '1');
    await setFirmGoal('steady');
    card.remove();
  };
  card.appendChild(skip);

  return card;
}

function maybeShowGoalPrompt() {
  if (localStorage.getItem(_GOAL_PROMPT_KEY)) return;
  const wrap = document.getElementById('quick-start-suggestions');
  if (!wrap) return;
  const existing = document.getElementById('goal-prompt-card');
  if (existing) return;
  const card = _buildGoalPromptCard();
  wrap.parentNode.insertBefore(card, wrap);
}

async function saveProfileSettings() {
  const fnEl = document.getElementById('sp-full-name');
  const dnEl = document.getElementById('sp-display-name');
  const name = fnEl ? fnEl.value.trim() : '';
  const displayName = dnEl ? dnEl.value.trim() : '';

  const ok = await updatePwPreferences({ name, displayName });
  if (ok && pwPreferences) {
    pwPreferences.name = name;
    pwPreferences.displayName = displayName;
  }

  const avEl = document.getElementById('settings-page-avatar');
  const email = (pwCurrentUser && pwCurrentUser.email) || '';
  if (avEl) avEl.textContent = getInitials(name || email);

  const nameEl = document.getElementById('sidebar-user-name');
  if (nameEl) nameEl.textContent = name || (pwCurrentUser && pwCurrentUser.email.split('@')[0]) || '';

  const confirm = document.getElementById('sp-save-confirm');
  if (confirm) {
    confirm.hidden = !ok;
    if (ok) setTimeout(() => { confirm.hidden = true; }, 3000);
  }
}

async function changePassword() {
  const curEl  = document.getElementById('sp-current-pw');
  const newEl  = document.getElementById('sp-new-pw');
  const conEl  = document.getElementById('sp-confirm-pw');
  const fbEl   = document.getElementById('sp-pw-feedback');

  const currentPassword  = curEl  ? curEl.value  : '';
  const newPassword      = newEl  ? newEl.value  : '';
  const confirmPassword  = conEl  ? conEl.value  : '';

  if (fbEl) { fbEl.textContent = ''; fbEl.className = 'sp-pw-feedback'; }

  if (!currentPassword || !newPassword || !confirmPassword) {
    if (fbEl) { fbEl.textContent = 'All fields are required.'; fbEl.classList.add('sp-pw-feedback--error'); }
    return;
  }
  if (newPassword !== confirmPassword) {
    if (fbEl) { fbEl.textContent = 'New passwords do not match.'; fbEl.classList.add('sp-pw-feedback--error'); }
    return;
  }

  try {
    const r = await fetch('/api/auth/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (fbEl) { fbEl.textContent = data.error || 'Could not update password.'; fbEl.classList.add('sp-pw-feedback--error'); }
      return;
    }
    if (fbEl) { fbEl.textContent = 'Password updated ✓'; fbEl.classList.add('sp-pw-feedback--ok'); }
    if (curEl) curEl.value = '';
    if (newEl) newEl.value = '';
    if (conEl) conEl.value = '';
    setTimeout(() => {
      if (fbEl) { fbEl.textContent = ''; fbEl.className = 'sp-pw-feedback'; }
    }, 4000);
  } catch {
    if (fbEl) { fbEl.textContent = 'Network error — please try again.'; fbEl.classList.add('sp-pw-feedback--error'); }
  }
}

async function addMemoryItem() {
  const input = document.getElementById('memory-add-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  _memoryItems.push(val);
  await saveMemoryToServer(_memoryItems);
  renderMemoryItems();
  updateMemoryCounter();
  input.value = '';
}
