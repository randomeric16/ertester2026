require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { runTest } = require('./lib/test-runner');
const sheets = require('./lib/sheets');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Initialize Google Sheets (if configured)
sheets.initialize();

// ─── Data File ──────────────────────────────────────────────────────

const DATA_PATH = path.join(__dirname, 'data', 'test-cases.json');

function loadData() {
  try {
    const data = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { pageTypes: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Page Types & Rules API ─────────────────────────────────────────

// GET all page types with their rules
app.get('/api/config', (req, res) => {
  const data = loadData();
  res.json(data);
});

// PUT update a page type URL
app.put('/api/config/page/:pageId/url', (req, res) => {
  const data = loadData();
  const page = data.pageTypes.find(p => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page type not found' });

  page.url = req.body.url || '';
  saveData(data);
  res.json(page);
});

// PUT toggle a rule on/off
app.put('/api/config/page/:pageId/rule/:ruleId', (req, res) => {
  const data = loadData();
  const page = data.pageTypes.find(p => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page type not found' });

  const rule = page.rules.find(r => r.id === req.params.ruleId);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  if (req.body.enabled !== undefined) rule.enabled = req.body.enabled;
  saveData(data);
  res.json(rule);
});

// ─── Test Runner ────────────────────────────────────────────────────

// POST run a single rule test
app.post('/api/test/run', async (req, res) => {
  const { url, jsCode, expectedResult, name } = req.body;

  if (!url || !jsCode || expectedResult === undefined) {
    return res.status(400).json({ error: 'Missing required fields: url, jsCode, expectedResult' });
  }

  try {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Running test: ${name || 'Unnamed'}`);
    console.log(`URL: ${url}`);
    console.log(`JS: ${jsCode}`);
    console.log(`Expected: ${expectedResult}`);
    console.log('═'.repeat(60));

    const result = await runTest({ url, jsCode, expectedResult, name });

    console.log(`Result: ${result.pass ? '✅ PASS' : '❌ FAIL'} (${result.duration}ms)`);
    console.log('═'.repeat(60) + '\n');

    res.json(result);
  } catch (error) {
    console.error('Test execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST run all enabled rules for a page type
app.post('/api/test/run-page/:pageId', async (req, res) => {
  const data = loadData();
  const page = data.pageTypes.find(p => p.id === req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Page type not found' });

  const url = req.body.url || page.url;
  if (!url) return res.status(400).json({ error: 'No URL provided for this page type' });

  const enabledRules = page.rules.filter(r => r.enabled);
  if (enabledRules.length === 0) return res.json({ results: [], summary: { total: 0, passed: 0, failed: 0 } });

  const results = [];
  for (const rule of enabledRules) {
    const result = await runTest({
      url,
      jsCode: rule.jsCode,
      expectedResult: rule.expectedResult,
      name: `${page.name} — ${rule.name}`
    });
    result.ruleId = rule.id;
    result.url = url;
    result.jsCode = rule.jsCode;
    results.push(result);
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length
  };

  res.json({ results, summary });
});

// POST run all enabled rules for all page types
app.post('/api/test/run-all', async (req, res) => {
  const data = loadData();
  const results = [];

  for (const page of data.pageTypes) {
    const url = page.url;
    if (!url) continue;

    const enabledRules = page.rules.filter(r => r.enabled);
    for (const rule of enabledRules) {
      const result = await runTest({
        url,
        jsCode: rule.jsCode,
        expectedResult: rule.expectedResult,
        name: `${page.name} — ${rule.name}`
      });
      result.ruleId = rule.id;
      result.pageId = page.id;
      result.url = url;
      result.jsCode = rule.jsCode;
      results.push(result);
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length
  };

  res.json({ results, summary });
});

// ─── Google Sheets ──────────────────────────────────────────────────

app.post('/api/sheets/log', async (req, res) => {
  const result = await sheets.logResult(req.body);
  res.json(result);
});

app.get('/api/sheets/status', (req, res) => {
  res.json({
    configured: sheets.isConfigured(),
    sheetId: process.env.GOOGLE_SHEETS_ID || null
  });
});

// ─── Start Server ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 erTester running at http://localhost:${PORT}\n`);
  sheets.ensureHeaders();
});
