const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Google Sheets integration for logging QA test results.
 * 
 * Setup instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project (or use existing)
 * 3. Enable "Google Sheets API" and "Google Drive API"
 * 4. Go to Credentials → Create Service Account
 * 5. Download the JSON key file → save as credentials.json in project root
 * 6. Create a Google Sheet and share it with the service account email
 * 7. Copy the Sheet ID from the URL and put it in .env as GOOGLE_SHEETS_ID
 */

let sheetsClient = null;
let isConfigured = false;

function initialize() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const sheetId = process.env.GOOGLE_SHEETS_ID;

  if (!sheetId || !fs.existsSync(credPath)) {
    console.log('[Sheets] Google Sheets not configured. Logging will be skipped.');
    console.log('[Sheets] To enable: set GOOGLE_SHEETS_ID in .env and provide credentials.json');
    isConfigured = false;
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    isConfigured = true;
    console.log('[Sheets] Google Sheets integration configured successfully.');
  } catch (error) {
    console.error('[Sheets] Failed to initialize:', error.message);
    isConfigured = false;
  }
}

/**
 * Log a test result to Google Sheets
 * @param {Object} result - test result object
 * @returns {Object} - { success, message }
 */
async function logResult(result) {
  if (!isConfigured) {
    return {
      success: false,
      message: 'Google Sheets not configured. Set GOOGLE_SHEETS_ID and provide credentials.json'
    };
  }

  const sheetId = process.env.GOOGLE_SHEETS_ID;

  try {
    const row = [
      result.timestamp || new Date().toISOString(),
      result.testName || 'Unnamed Test',
      result.url || '',
      result.jsCode || '',
      result.expected || '',
      result.actual || '',
      result.pass ? 'PASS' : 'FAIL',
      result.screenshotUrl || '',
      result.error || '',
      `${result.duration || 0}ms`
    ];

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    return { success: true, message: 'Result logged to Google Sheets' };
  } catch (error) {
    console.error('[Sheets] Error logging result:', error.message);
    return { success: false, message: `Failed to log: ${error.message}` };
  }
}

/**
 * Create the header row if the sheet is empty
 */
async function ensureHeaders() {
  if (!isConfigured) return;

  const sheetId = process.env.GOOGLE_SHEETS_ID;

  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:J1'
    });

    if (!response.data.values || response.data.values.length === 0) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1:J1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'Timestamp', 'Test Name', 'URL', 'JS Rule',
            'Expected', 'Actual', 'Status', 'Screenshot Link',
            'Error', 'Duration'
          ]]
        }
      });
      console.log('[Sheets] Header row created.');
    }
  } catch (error) {
    console.error('[Sheets] Error ensuring headers:', error.message);
  }
}

module.exports = { initialize, logResult, ensureHeaders, isConfigured: () => isConfigured };
