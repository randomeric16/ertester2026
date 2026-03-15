/* ═══════════════════════════════════════════════════════════
   erTester — Frontend Application Logic
   ═══════════════════════════════════════════════════════════ */

const API = '';

// ─── State ────────────────────────────────────────────────
let config = { pageTypes: [] };
let ruleResults = {}; // keyed by `${pageId}_${ruleId}`

// Page type icons
const PAGE_ICONS = {
  homepage: '🏠',
  product: '🛍️',
  category: '📂',
  cart: '🛒',
  search: '🔍',
  checkout: '💳',
  default: '📄'
};

// ─── DOM Elements ─────────────────────────────────────────
const pageTypesGrid = document.getElementById('page-types-grid');
const summaryBar = document.getElementById('summary-bar');
const screenshotModal = document.getElementById('screenshot-modal');

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  bindEvents();
});

function bindEvents() {
  document.getElementById('btn-run-all').addEventListener('click', runAllTests);
  document.getElementById('screenshot-modal-close').addEventListener('click', closeScreenshotModal);

  screenshotModal.addEventListener('click', (e) => {
    if (e.target === screenshotModal) closeScreenshotModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeScreenshotModal();
  });
}

// ─── API ──────────────────────────────────────────────────

async function loadConfig() {
  try {
    const res = await fetch(`${API}/api/config`);
    config = await res.json();
    renderPageTypes();
  } catch (error) {
    showToast('Failed to load configuration', 'error');
    console.error(error);
  }
}

async function saveUrl(pageId, url) {
  try {
    await fetch(`${API}/api/config/page/${pageId}/url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
  } catch (error) {
    console.error('Failed to save URL:', error);
  }
}

async function toggleRule(pageId, ruleId, enabled) {
  try {
    await fetch(`${API}/api/config/page/${pageId}/rule/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
  } catch (error) {
    showToast('Failed to toggle rule', 'error');
  }
}

async function runTestForRule(pageId, rule, url) {
  const res = await fetch(`${API}/api/test/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      jsCode: rule.jsCode,
      expectedResult: rule.expectedResult,
      name: rule.name
    })
  });

  if (!res.ok) throw new Error('Test execution failed');
  return res.json();
}

// ─── Rendering ────────────────────────────────────────────

function renderPageTypes() {
  pageTypesGrid.innerHTML = '';

  config.pageTypes.forEach(page => {
    const card = createPageTypeCard(page);
    pageTypesGrid.appendChild(card);
  });

  updateSteps();
}

function createPageTypeCard(page) {
  const card = document.createElement('div');
  card.className = 'page-type-card';
  card.id = `page-${page.id}`;

  const icon = PAGE_ICONS[page.id] || PAGE_ICONS.default;

  // Count enabled rules
  const enabledCount = page.rules.filter(r => r.enabled).length;

  card.innerHTML = `
    <div class="page-type-header">
      <div class="page-type-title">
        <div class="page-type-icon">${icon}</div>
        <h3>${escapeHtml(page.name)}</h3>
      </div>
      <div class="page-type-actions">
        <button class="btn btn-run btn-sm" onclick="handleRunPage('${page.id}')" id="btn-run-page-${page.id}"
          ${!page.url ? 'disabled title="Enter a URL first"' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Run ${enabledCount} Rule${enabledCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>

    <div class="page-type-url">
      <label>URL</label>
      <input type="url" class="url-input ${page.url ? 'has-value' : ''}"
        id="url-${page.id}"
        placeholder="https://www.example.com/${page.id === 'homepage' ? '' : page.id + '/...'}"
        value="${escapeHtml(page.url || '')}"
        onchange="handleUrlChange('${page.id}', this)"
        oninput="handleUrlInput('${page.id}', this)">
    </div>

    <div class="page-type-rules">
      <div class="rules-header">Rules to Test (${enabledCount}/${page.rules.length} enabled)</div>
      <div id="rules-list-${page.id}">
        ${page.rules.map(rule => createRuleItem(page.id, rule)).join('')}
      </div>
    </div>
  `;

  return card;
}

function createRuleItem(pageId, rule) {
  const key = `${pageId}_${rule.id}`;
  const result = ruleResults[key];

  let statusClass = '';
  let badgeHtml = '';
  let resultDetailsHtml = '';

  if (result) {
    statusClass = result.pass ? 'rule-pass' : 'rule-fail';
    badgeHtml = result.pass
      ? '<span class="rule-badge badge-pass">✓ Pass</span>'
      : '<span class="rule-badge badge-fail">✗ Fail</span>';

    resultDetailsHtml = `
      <div class="rule-result-details">
        <div class="result-row">
          <span class="result-label">Expected</span>
          <span class="result-value">${escapeHtml(result.expected)}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Actual</span>
          <span class="result-value ${result.pass ? 'pass' : 'fail'}">${escapeHtml(result.actual || 'N/A')}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Duration</span>
          <span class="result-value">${formatDuration(result.duration)}</span>
        </div>
        ${result.error ? `
          <div class="result-row">
            <span class="result-label">Error</span>
            <span class="result-value fail">${escapeHtml(result.error)}</span>
          </div>
        ` : ''}
      </div>
      ${result.screenshotUrl ? `
        <div class="rule-screenshot-thumb" onclick="openScreenshot('${result.screenshotUrl}', '${escapeHtml(rule.name)}')">
          <img src="${result.screenshotUrl}" alt="Screenshot" loading="lazy">
        </div>
      ` : ''}
    `;
  }

  return `
    <div class="rule-item ${statusClass}" id="rule-${pageId}-${rule.id}">
      <label class="rule-checkbox">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''}
          onchange="handleToggleRule('${pageId}', '${rule.id}', this.checked)">
        <span class="toggle"></span>
      </label>
      <div class="rule-info">
        <div class="rule-name">${escapeHtml(rule.name)}</div>
        <div class="rule-code">${escapeHtml(rule.jsCode)}</div>
      </div>
      <div class="rule-result">
        ${badgeHtml}
      </div>
    </div>
    ${resultDetailsHtml}
  `;
}

function updateSteps() {
  const hasUrls = config.pageTypes.some(p => p.url);
  const hasResults = Object.keys(ruleResults).length > 0;

  const s1 = document.getElementById('step-1-indicator');
  const s2 = document.getElementById('step-2-indicator');
  const s3 = document.getElementById('step-3-indicator');

  s1.className = hasUrls ? 'step completed' : 'step active';
  s2.className = hasUrls ? (hasResults ? 'step completed' : 'step active') : 'step';
  s3.className = hasResults ? 'step active' : 'step';
}

function updateSummary() {
  const results = Object.values(ruleResults);
  if (results.length === 0) {
    summaryBar.style.display = 'none';
    return;
  }

  summaryBar.style.display = 'block';
  document.getElementById('stat-total').textContent = results.length;
  document.getElementById('stat-passed').textContent = results.filter(r => r.pass).length;
  document.getElementById('stat-failed').textContent = results.filter(r => !r.pass).length;

  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  document.getElementById('stat-duration').textContent = formatDuration(totalDuration);
}

// ─── Handlers ─────────────────────────────────────────────

function handleUrlChange(pageId, input) {
  const url = input.value.trim();
  const page = config.pageTypes.find(p => p.id === pageId);
  if (page) page.url = url;

  input.className = `url-input ${url ? 'has-value' : ''}`;
  saveUrl(pageId, url);

  // Enable/disable run button
  const btn = document.getElementById(`btn-run-page-${pageId}`);
  if (btn) btn.disabled = !url;

  updateSteps();
}

function handleUrlInput(pageId, input) {
  const url = input.value.trim();
  input.className = `url-input ${url ? 'has-value' : ''}`;
  const btn = document.getElementById(`btn-run-page-${pageId}`);
  if (btn) btn.disabled = !url;
}

function handleToggleRule(pageId, ruleId, enabled) {
  const page = config.pageTypes.find(p => p.id === pageId);
  if (page) {
    const rule = page.rules.find(r => r.id === ruleId);
    if (rule) rule.enabled = enabled;
  }
  toggleRule(pageId, ruleId, enabled);

  // Re-render just the card to update counts
  const card = document.getElementById(`page-${pageId}`);
  if (card && page) {
    const newCard = createPageTypeCard(page);
    card.replaceWith(newCard);
  }
}

async function handleRunPage(pageId) {
  const page = config.pageTypes.find(p => p.id === pageId);
  if (!page) return;

  // Get URL from input (live value)
  const urlInput = document.getElementById(`url-${pageId}`);
  const url = urlInput ? urlInput.value.trim() : page.url;

  if (!url) {
    showToast('Please enter a URL first', 'error');
    return;
  }

  // Save URL
  page.url = url;
  saveUrl(pageId, url);

  const enabledRules = page.rules.filter(r => r.enabled);
  if (enabledRules.length === 0) {
    showToast('No rules enabled for this page type', 'error');
    return;
  }

  const btn = document.getElementById(`btn-run-page-${pageId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Running...';
  }

  showToast(`Running ${enabledRules.length} rule(s) on ${page.name}...`, 'info');

  for (const rule of enabledRules) {
    const key = `${pageId}_${rule.id}`;

    // Mark as running
    const ruleEl = document.getElementById(`rule-${pageId}-${rule.id}`);
    if (ruleEl) ruleEl.className = 'rule-item rule-running';

    try {
      const result = await runTestForRule(pageId, rule, url);
      ruleResults[key] = result;

      if (result.pass) {
        showToast(`✅ ${rule.name}: PASSED`, 'success');
      } else {
        showToast(`❌ ${rule.name}: FAILED — ${result.actual || result.error}`, 'error');
      }
    } catch (error) {
      ruleResults[key] = {
        pass: false,
        actual: null,
        expected: rule.expectedResult,
        error: error.message,
        duration: 0
      };
      showToast(`❌ ${rule.name}: ERROR — ${error.message}`, 'error');
    }
  }

  // Re-render card with results
  const card = document.getElementById(`page-${pageId}`);
  if (card) {
    const newCard = createPageTypeCard(page);
    card.replaceWith(newCard);
  }

  updateSummary();
  updateSteps();
}

async function runAllTests() {
  const btn = document.getElementById('btn-run-all');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span> Running All...';

  const pagesWithUrls = config.pageTypes.filter(p => p.url);
  if (pagesWithUrls.length === 0) {
    showToast('Please enter URLs for at least one page type first', 'error');
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run All Tests`;
    return;
  }

  showToast(`Running tests for ${pagesWithUrls.length} page type(s)...`, 'info');

  for (const page of pagesWithUrls) {
    await handleRunPage(page.id);
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run All Tests`;

  const results = Object.values(ruleResults);
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  if (failed > 0) {
    showToast(`⚠️ ${failed} rule(s) failed out of ${results.length}`, 'error');
  } else {
    showToast(`🎉 All ${passed} rule(s) passed!`, 'success');
  }
}

// ─── Screenshot Modal ─────────────────────────────────────

function openScreenshot(url, title) {
  document.getElementById('screenshot-img').src = url;
  document.getElementById('screenshot-modal-title').textContent = `Screenshot: ${title}`;
  screenshotModal.style.display = 'flex';
}

function closeScreenshotModal() {
  screenshotModal.style.display = 'none';
}

// ─── Toasts ───────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '🚨', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
