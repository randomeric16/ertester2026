const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Run a JS test on a target URL using Puppeteer.
 * The final screenshot includes the website AND an overlay banner
 * showing the rule tested, expected vs actual result, and pass/fail status.
 *
 * @param {Object} testCase - { url, jsCode, expectedResult, name }
 * @returns {Object} - { pass, actual, expected, screenshotPath, screenshotUrl, error, duration }
 */
async function runTest(testCase) {
  const { url, jsCode, expectedResult, name } = testCase;
  const startTime = Date.now();
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    console.log(`[Test Runner] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    // Wait for async scripts (like Insider) to fully initialize
    // On slow cloud servers, we wait a bit more (10s instead of 8s)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Try to dismiss common popups, cookie banners, and modals
    await page.evaluate(() => {
      try {
        // Close common cookie consent banners
        const cookieSelectors = [
          '[class*="cookie"] button[class*="accept"]',
          '[class*="cookie"] button[class*="Accept"]',
          '[id*="cookie"] button',
          'button[class*="accept-cookies"]',
          '.cookie-banner button',
          '#onetrust-accept-btn-handler',
          '.cc-btn.cc-dismiss',
        ];
        for (const sel of cookieSelectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); break; }
        }

        // Close common popup modals (X buttons)
        const closeSelectors = [
          '.modal .close', '.modal-close', '[class*="popup"] .close',
          '[class*="popup"] button[class*="close"]',
          '[class*="modal"] button[class*="close"]',
          '.overlay .close', '[aria-label="Close"]',
          'button.close-button', '.popup-close',
        ];
        for (const sel of closeSelectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); break; }
        }
      } catch (e) { /* ignore */ }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Execute the JS rule with retry logic (some third-party scripts load async)
    console.log(`[Test Runner] Executing JS: ${jsCode}`);
    let actual;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        actual = await page.evaluate((code) => {
          try {
            const result = eval(code);
            return String(result);
          } catch (e) {
            return `ERROR: ${e.message}`;
          }
        }, jsCode);
      } catch (evalError) {
        actual = `ERROR: ${evalError.message}`;
      }

      // If we got a valid result (not an error), stop retrying
      if (!actual.startsWith('ERROR:')) {
        console.log(`[Test Runner] Attempt ${attempt}: Got result: ${actual}`);
        break;
      }

      // If it's an error and we have retries left, wait and try again
      if (attempt < MAX_RETRIES) {
        console.log(`[Test Runner] Attempt ${attempt}: ${actual} — retrying in ${RETRY_DELAY/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.log(`[Test Runner] Attempt ${attempt}: ${actual} — no more retries`);
      }
    }

    const pass = actual === expectedResult;
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[Test Runner] Result: ${actual} | Expected: ${expectedResult} | ${status}`);

    // ─── Inject overlay banner showing the test rule & result ──────
    await page.evaluate(({ testName, ruleCode, expected, actualVal, passed }) => {
      // Remove any existing overlay
      const existing = document.getElementById('qa-test-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'qa-test-overlay';
      overlay.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        padding: 0;
        pointer-events: none;
      `;

      const bgColor = passed
        ? 'rgba(5, 46, 22, 0.92)'
        : 'rgba(69, 10, 10, 0.92)';
      const accentColor = passed ? '#22c55e' : '#ef4444';
      const statusIcon = passed ? '✅' : '❌';
      const statusText = passed ? 'PASS' : 'FAIL';

      overlay.innerHTML = `
        <div style="
          background: ${bgColor};
          backdrop-filter: blur(12px);
          border-top: 3px solid ${accentColor};
          padding: 16px 28px;
          display: flex;
          align-items: center;
          gap: 20px;
          color: white;
          font-size: 14px;
        ">
          <div style="
            font-size: 28px;
            flex-shrink: 0;
          ">${statusIcon}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="
              font-weight: 700;
              font-size: 15px;
              margin-bottom: 6px;
              color: ${accentColor};
              letter-spacing: 0.5px;
            ">QA TEST: ${statusText} — ${testName || 'Unnamed Test'}</div>
            <div style="display: flex; gap: 24px; flex-wrap: wrap; font-size: 13px;">
              <div>
                <span style="color: #94a3b8;">Rule: </span>
                <span style="
                  font-family: 'Courier New', monospace;
                  background: rgba(255,255,255,0.1);
                  padding: 2px 8px;
                  border-radius: 4px;
                  color: #e2e8f0;
                ">${ruleCode}</span>
              </div>
              <div>
                <span style="color: #94a3b8;">Expected: </span>
                <span style="color: #e2e8f0; font-family: 'Courier New', monospace;">${expected}</span>
              </div>
              <div>
                <span style="color: #94a3b8;">Actual: </span>
                <span style="color: ${passed ? '#22c55e' : '#ef4444'}; font-weight: 700; font-family: 'Courier New', monospace;">${actualVal}</span>
              </div>
            </div>
          </div>
          <div style="
            background: ${accentColor};
            color: white;
            padding: 6px 18px;
            border-radius: 6px;
            font-weight: 800;
            font-size: 16px;
            letter-spacing: 1px;
            flex-shrink: 0;
          ">${statusText}</div>
        </div>
      `;

      document.body.appendChild(overlay);
    }, {
      testName: name,
      ruleCode: jsCode,
      expected: expectedResult,
      actualVal: actual,
      passed: pass
    });

    // Small delay to let the overlay render
    await new Promise(resolve => setTimeout(resolve, 300));

    // Take screenshot (includes the website + overlay)
    const screenshotId = uuidv4();
    const screenshotFilename = `${screenshotId}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

    await page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    const duration = Date.now() - startTime;

    return {
      pass,
      actual,
      expected: expectedResult,
      screenshotPath: screenshotPath,
      screenshotUrl: `/screenshots/${screenshotFilename}`,
      error: null,
      duration,
      timestamp: new Date().toISOString(),
      testName: name
    };

  } catch (error) {
    console.error(`[Test Runner] Error: ${error.message}`);
    const duration = Date.now() - startTime;

    return {
      pass: false,
      actual: null,
      expected: expectedResult,
      screenshotPath: null,
      screenshotUrl: null,
      error: error.message,
      duration,
      timestamp: new Date().toISOString(),
      testName: name
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { runTest };
