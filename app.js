// app.js — UI logic, conversation state, and message rendering
// Depends on api.js being loaded first (sendToAI, extractSQL).

/* ── State ─────────────────────────────────────────── */

// conversations: Array<{ id: number, title: string, messages: Array<{role, content}>, sql: string|null }>
let conversations = [];
let activeId = null;   // null = welcome screen / new conversation pending

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

function renderSidebar() {
  if (!conversations.length) {
    convList.innerHTML = '';
    return;
  }
  convList.innerHTML = conversations.map(c => `
    <div class="conv-item ${c.id === activeId ? 'active' : ''}"
         onclick="switchTo(${c.id})"
         title="${escapeAttr(c.title)}">
      <span class="conv-item-icon">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.75 2.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h1.5a.75.75 0 01.75.75v1.19l1.72-1.72a.75.75 0 01.53-.22h5.25a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H8.56l-2.34 2.34a.75.75 0 01-1.28-.53V12h-.19A1.75 1.75 0 013 10.25v-7.5z"/>
        </svg>
      </span>
      <span class="conv-title">${escapeHTML(c.title)}</span>
    </div>
  `).join('');
}

function switchTo(id) {
  activeId = id;
  renderSidebar();
  renderMessages();
  const conv = getActive();
  if (conv && conv.sql) {
    openSQLPanel(conv.sql, conv.title);
  } else {
    closeSQLPanel();
  }
  inputEl.focus();
}

function newReport() {
  activeId = null;
  renderSidebar();
  renderMessages();
  closeSQLPanel();
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  inputEl.focus();
}

/* ── Chat rendering ─────────────────────────────────── */

function getActive() {
  return conversations.find(c => c.id === activeId) || null;
}

function renderMessages() {
  chatInner.querySelectorAll('.message, #typing-row').forEach(el => el.remove());
  const conv = getActive();
  if (!conv || !conv.messages.length) {
    welcome.style.display = '';
    return;
  }
  welcome.style.display = 'none';
  conv.messages.forEach(m => chatInner.appendChild(buildMsgEl(m.role, m.content)));
  scrollDown();
}

function buildMsgEl(role, content) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.innerHTML = `
    <div class="message-header">
      <div class="avatar ${role}">${role === 'ai' ? 'AI' : 'U'}</div>
      <span class="message-sender">${role === 'ai' ? 'PW Report Builder' : 'You'}</span>
    </div>
    <div class="message-body">
      <div class="bubble">${role === 'ai' ? content : escapeHTML(content)}</div>
    </div>`;
  return el;
}

function appendTyping() {
  const el = document.createElement('div');
  el.id = 'typing-row';
  el.className = 'message ai';
  el.innerHTML = `
    <div class="message-header">
      <div class="avatar ai">AI</div>
      <span class="message-sender">PW Report Builder</span>
    </div>
    <div class="message-body">
      <div class="bubble">
        <div class="typing">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  chatInner.appendChild(el);
  scrollDown();
}

/* ── Send ───────────────────────────────────────────── */

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  const isFirst = activeId === null;

  // Create a new conversation on the first message
  if (isFirst) {
    const id = Date.now();
    conversations.unshift({ id, title: generateTitle(text), messages: [], sql: null });
    activeId = id;
    renderSidebar();
  }

  const conv = getActive();
  conv.messages.push({ role: 'user', content: text });

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  welcome.style.display = 'none';
  chatInner.appendChild(buildMsgEl('user', text));
  scrollDown();

  appendTyping();

  // Generate a better title via AI after the first message (fire-and-forget)
  if (isFirst) {
    generateTitleWithAI(text).then(title => {
      if (title && activeId === conv.id) {
        conv.title = title;
        renderSidebar();
        if (sqlPanel.classList.contains('open')) {
          document.getElementById('sql-panel-name').textContent = title;
        }
      }
    }).catch(() => {});
  }

  // Streaming state
  let aiBubble = null;

  sendToAI(conv.messages, {
    onChunk(chunk) {
      // On the first chunk, swap typing indicator for a live bubble
      if (!aiBubble) {
        document.getElementById('typing-row')?.remove();
        const msgEl = buildMsgEl('ai', '');
        aiBubble = msgEl.querySelector('.bubble');
        chatInner.appendChild(msgEl);
      }
      aiBubble.textContent = (aiBubble.textContent || '') + chunk;
      scrollDown();
    },

    onDone({ text, sql, raw }) {
      // Remove typing indicator if no chunks arrived (e.g. very fast response)
      document.getElementById('typing-row')?.remove();

      if (aiBubble) {
        // Replace streamed plain text with final formatted HTML
        aiBubble.innerHTML = text;
      } else {
        chatInner.appendChild(buildMsgEl('ai', text));
      }

      // Store the full raw response so the model sees its own SQL in future turns
      conv.messages.push({ role: 'ai', content: raw });

      if (sql) {
        conv.sql = sql;
        openSQLPanel(sql, conv.title);
      }

      // Re-enable input
      sendBtn.disabled = inputEl.value.trim().length === 0;
      scrollDown();
    },

    onError(errMsg) {
      document.getElementById('typing-row')?.remove();
      const msgEl = buildMsgEl('ai',
        `<span style="color:#A31515">Something went wrong: ${escapeHTML(errMsg)}</span>`
      );
      chatInner.appendChild(msgEl);
      sendBtn.disabled = inputEl.value.trim().length === 0;
      scrollDown();
    },
  });
}

/* ── SQL Panel ──────────────────────────────────────── */

function openSQLPanel(sql, title) {
  document.getElementById('sql-panel-name').textContent = title || 'SQL Output';
  sqlOutput.innerHTML = highlightSQL(sql);
  sqlOutput._rawSQL = sql;
  sqlPanel.classList.add('open');
}

function closeSQLPanel() {
  sqlPanel.classList.remove('open');
  resetCopyBtn();
  document.getElementById('metabase-guide').style.display = 'none';
}

function copySQLPanel() {
  const btn = document.getElementById('btn-copy-panel');
  const raw = sqlOutput._rawSQL || sqlOutput.textContent;
  navigator.clipboard.writeText(raw).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = iconCheck() + ' Copied!';
    setTimeout(() => { btn.classList.remove('copied'); resetCopyBtn(); }, 2000);
  });
}

function resetCopyBtn() {
  const btn = document.getElementById('btn-copy-panel');
  if (btn) btn.innerHTML = iconCopy() + ' Copy SQL';
}

function toggleMetabaseGuide() {
  const guide = document.getElementById('metabase-guide');
  guide.style.display = guide.style.display === 'none' ? 'flex' : 'none';
}

function iconCopy() {
  return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg>`;
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
    'CTE','RECURSIVE','PIVOT','UNPIVOT','APPLY','CROSS APPLY','OUTER APPLY',
    'NOLOCK','WITH','NOLOCK','ISNULL','COALESCE','NULLIF','IIF'
  ]);

  const FUNCTIONS = new Set([
    'SUM','COUNT','AVG','MIN','MAX','ROUND','ABS','CEILING','FLOOR',
    'ISNULL','COALESCE','NULLIF','IIF','CAST','CONVERT','LEN','LEFT',
    'RIGHT','SUBSTRING','REPLACE','TRIM','LTRIM','RTRIM','UPPER','LOWER',
    'DATEDIFF','DATEADD','DATENAME','DATEPART','GETDATE','FORMAT',
    'ROW_NUMBER','RANK','DENSE_RANK','NTILE','LAG','LEAD',
    'FIRST_VALUE','LAST_VALUE','STDEV','VAR','STRING_AGG','STUFF','CONCAT'
  ]);

  // Tokenize with sticky regex — processes the string left-to-right without backtracking
  const tokens = [];
  let i = 0;
  const s = sql;

  while (i < s.length) {
    let m;

    // Single-line comment
    if (s.startsWith('--', i)) {
      const end = s.indexOf('\n', i);
      const t = end === -1 ? s.slice(i) : s.slice(i, end);
      tokens.push(`<span class="sql-comment">${esc(t)}</span>`);
      i += t.length;
      continue;
    }

    // Block comment
    if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2);
      const t = end === -1 ? s.slice(i) : s.slice(i, end + 2);
      tokens.push(`<span class="sql-comment">${esc(t)}</span>`);
      i += t.length;
      continue;
    }

    // String literal (single-quoted)
    if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'" && s[j+1] === "'") { j += 2; continue; }
        if (s[j] === "'") { j++; break; }
        j++;
      }
      tokens.push(`<span class="sql-string">${esc(s.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(s[i]) || (s[i] === '.' && /[0-9]/.test(s[i+1] || ''))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push(`<span class="sql-number">${esc(s.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // Word (keyword or function or identifier)
    if (/[A-Za-z_@#]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_@#]/.test(s[j])) j++;
      const word = s.slice(i, j);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push(`<span class="sql-keyword">${esc(word)}</span>`);
      } else if (FUNCTIONS.has(upper)) {
        tokens.push(`<span class="sql-function">${esc(word)}</span>`);
      } else {
        tokens.push(esc(word));
      }
      i = j;
      continue;
    }

    // Anything else — pass through escaped
    tokens.push(esc(s[i]));
    i++;
  }

  return tokens.join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Title generation ───────────────────────────────── */

function generateTitle(text) {
  const stop = new Set([
    'show','me','a','an','the','of','for','by','with','and','or','in','on','at','to',
    'i','want','need','can','get','give','please','what','how','is','are','was','were',
    'list','all','some','each','every','build','create','make','write','give','report',
    'query','sql','data','table','from','where','select'
  ]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const kept  = words.filter(w => w.length > 1 && !stop.has(w)).slice(0, 5);
  if (!kept.length) return text.trim().split(/\s+/).slice(0, 5).join(' ');
  const out = kept.join(' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
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
