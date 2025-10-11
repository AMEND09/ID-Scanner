// Load configuration
import { CONFIG } from './config.js';

// Google API Configuration
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';

// State
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;
let selectedSheetId = localStorage.getItem('selectedSheetId');
let selectedSheetName = localStorage.getItem('selectedSheetName');
let selectedSheetTab = localStorage.getItem('selectedSheetTab') || null;
let isScanning = false;
let recentScans = [];
// Load recent scans from localStorage so scans persist across sign-ins
try {
    const stored = localStorage.getItem('recentScans');
    if (stored) recentScans = JSON.parse(stored) || [];
} catch (e) {
    console.warn('Failed to parse recentScans from localStorage', e);
}
// QR scanning state
let overlayTimeout;
let lastDetectedCode = '';
let lastDetectedTime = 0;
let qrLoopInterval = null;
let qrStartRetryTimeout = null;

// DOM Elements
const authSection = document.getElementById('authSection');
const sheetSelectionSection = document.getElementById('sheetSelectionSection');
const scannerSection = document.getElementById('scannerSection');
const authorizeBtn = document.getElementById('authorizeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const sheetsList = document.getElementById('sheetsList');
const refreshSheetsBtn = document.getElementById('refreshSheetsBtn');
const backToSheetsBtn = document.getElementById('backToSheetsBtn');
const changeSheetBtn = document.getElementById('changeSheetBtn');
const selectedSheetNameEl = document.getElementById('selectedSheetName');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const scannerStatus = document.getElementById('scannerStatus');
const manualInput = document.getElementById('manualInput');
const submitManualBtn = document.getElementById('submitManualBtn');
const recentScansEl = document.getElementById('recentScans');
const statusMessage = document.getElementById('statusMessage');
const detectionOverlay = document.getElementById('detectionOverlay');
const liveReadContent = document.getElementById('liveReadContent');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // Wait for Google APIs to load
    waitForGoogleAPIs();
});

function waitForGoogleAPIs() {
    // Check if both gapi and google are loaded
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
        gapiLoaded();
        gisLoaded();
    } else {
        // Check again in 100ms
        setTimeout(waitForGoogleAPIs, 100);
    }
}

function setupEventListeners() {
    authorizeBtn.addEventListener('click', handleAuthClick);
    logoutBtn.addEventListener('click', handleSignoutClick);
    refreshSheetsBtn.addEventListener('click', loadGoogleSheets);
    changeSheetBtn.addEventListener('click', showSheetSelection);
    backToSheetsBtn.addEventListener('click', () => { showSheetSelection(); });
    submitManualBtn.addEventListener('click', handleManualSubmit);
    manualInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleManualSubmit();
        }
    });

    // Export modal wiring (if present)
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const exportCloseBtn = document.getElementById('exportCloseBtn');
    const exportSheetsBtn = document.getElementById('exportSheetsBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportXlsxBtn = document.getElementById('exportXlsxBtn');
    const exportSheetsOptions = document.getElementById('exportSheetsOptions');
    const exportSheetsConfirm = document.getElementById('exportSheetsConfirm');
    const exportSheetsCancel = document.getElementById('exportSheetsCancel');

    if (exportBtn) exportBtn.addEventListener('click', () => { if (exportModal) exportModal.style.display = 'flex'; });
    if (exportCloseBtn) exportCloseBtn.addEventListener('click', () => { if (exportModal) exportModal.style.display = 'none'; });
    if (exportSheetsBtn) exportSheetsBtn.addEventListener('click', () => { if (exportSheetsOptions) exportSheetsOptions.style.display = 'block'; });
    if (exportSheetsCancel) exportSheetsCancel.addEventListener('click', () => { if (exportSheetsOptions) exportSheetsOptions.style.display = 'none'; });
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportRecentScansAsJson);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportRecentScansAsCsv);
    if (exportXlsxBtn) exportXlsxBtn.addEventListener('click', exportRecentScansAsXlsx);
    if (exportSheetsConfirm) exportSheetsConfirm.addEventListener('click', () => {
        const tab = document.getElementById('exportSheetTab').value || (selectedSheetTab || 'Sheet1');
        batchAppendToSheet(tab).then(success => {
            if (success) showStatus('Exported to Google Sheets', 'success');
            else showStatus('Failed to export to Google Sheets', 'error');
        });
        if (exportModal) exportModal.style.display = 'none';
    });
}

// Google API Initialization
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        // Initialize without discovery docs - we'll load APIs directly
        const initConfig = {};
        
        // API Key is optional - only add if provided
        if (CONFIG.GOOGLE_API_KEY) {
            initConfig.apiKey = CONFIG.GOOGLE_API_KEY;
        }
        
        await gapi.client.init(initConfig);
        
        // Load APIs directly by name and version
        await Promise.all([
            gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4'),
            gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest')
        ]);
        
        console.log('Google APIs loaded successfully');
        gapiInited = true;
        maybeEnableButtons();
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
        showStatus('Error initializing Google API', 'error');
    }
}

function gisLoaded() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined later
        });
        gisInited = true;
        maybeEnableButtons();
    } catch (error) {
        console.error('Error initializing Google Identity Services:', error);
        showStatus('Error loading Google Sign-In', 'error');
    }
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        authorizeBtn.disabled = false;
        // Check if user is already authorized
        const token = localStorage.getItem('googleAccessToken');
        if (token) {
            accessToken = token;
            gapi.client.setToken({ access_token: token });
            checkTokenValidity();
        }
    }
}

async function checkTokenValidity() {
    try {
        // Try to make a simple API call to check if token is valid
        await gapi.client.drive.files.list({ pageSize: 1 });
        onAuthSuccess();
    } catch (error) {
        // Token is invalid, clear it
        localStorage.removeItem('googleAccessToken');
        accessToken = null;
        showAuthSection();
    }
}

function handleAuthClick() {
    if (!tokenClient) {
        showStatus('Google Sign-In not ready. Please refresh the page.', 'error');
        return;
    }
    
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            showStatus('Authorization failed', 'error');
            console.error('Auth error:', resp);
            return;
        }
        accessToken = resp.access_token;
        localStorage.setItem('googleAccessToken', accessToken);
        onAuthSuccess();
    };

    if (accessToken === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            gapi.client.setToken(null);
        });
        accessToken = null;
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('selectedSheetId');
        localStorage.removeItem('selectedSheetName');
        selectedSheetId = null;
        selectedSheetName = null;
        stopScanner();
        showAuthSection();
        showStatus('Signed out successfully', 'success');
    }
}

function onAuthSuccess() {
    authSection.style.display = 'none';
    logoutBtn.style.display = 'block';
    
    if (selectedSheetId && selectedSheetName) {
        showScannerSection();
    } else {
        showSheetSelection();
    }
}

function showAuthSection() {
    authSection.style.display = 'block';
    sheetSelectionSection.style.display = 'none';
    scannerSection.style.display = 'none';
    logoutBtn.style.display = 'none';
}

function showSheetSelection() {
    authSection.style.display = 'none';
    sheetSelectionSection.style.display = 'block';
    scannerSection.style.display = 'none';
    stopScanner();
    // Hide any previously shown tabs list when returning to sheets
    const tabsList = document.getElementById('tabsList');
    if (tabsList) tabsList.style.display = 'none';
    loadGoogleSheets();
}

function showScannerSection() {
    authSection.style.display = 'none';
    sheetSelectionSection.style.display = 'none';
    scannerSection.style.display = 'block';
    selectedSheetNameEl.textContent = `Logging to: ${selectedSheetName}${selectedSheetTab ? ' / ' + selectedSheetTab : ''}`;
    startScanner();
}

// Google Sheets Functions
async function loadGoogleSheets() {
    sheetsList.innerHTML = '<p>Loading your spreadsheets...</p>';
    refreshSheetsBtn.disabled = true;

    try {
        // Ensure Drive API is loaded
        if (!gapi.client.drive) {
            await gapi.client.load('drive', 'v3');
        }
        
        const response = await gapi.client.drive.files.list({
            pageSize: 50,
            fields: 'files(id, name)',
            q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            orderBy: 'modifiedTime desc'
        });

        const files = response.result.files;
        sheetsList.innerHTML = '';

        if (!files || files.length === 0) {
            sheetsList.innerHTML = '<p>No spreadsheets found. Create one in Google Sheets first.</p>';
            return;
        }

        files.forEach(file => {
            const btn = document.createElement('button');
            btn.className = 'btn-sheet';
            btn.innerHTML = `<span>📊 ${file.name}</span><span>→</span>`;
            btn.onclick = () => selectSheet(file.id, file.name);
            sheetsList.appendChild(btn);
        });
    } catch (error) {
        console.error('Error loading sheets:', error);
        sheetsList.innerHTML = '<p>Error loading spreadsheets. Please try again.</p>';
        showStatus('Error loading spreadsheets', 'error');
    } finally {
        refreshSheetsBtn.disabled = false;
    }
}

function selectSheet(sheetId, sheetName) {
    // When a sheet (file) is selected, fetch its tabs and prompt for a tab if multiple
    selectedSheetId = sheetId;
    selectedSheetName = sheetName;
    localStorage.setItem('selectedSheetId', sheetId);
    localStorage.setItem('selectedSheetName', sheetName);
    
    fetchSpreadsheetTabs(sheetId).then(tabs => {
        if (!tabs || tabs.length === 0) {
            // fallback to scanner
            showScannerSection();
            showStatus(`Selected: ${sheetName}`, 'success');
            return;
        }

        if (tabs.length === 1) {
            // auto-select single tab
            selectedSheetTab = tabs[0].properties.title;
            localStorage.setItem('selectedSheetTab', selectedSheetTab);
            showScannerSection();
            showStatus(`Selected: ${sheetName} / ${selectedSheetTab}`, 'success');
            return;
        }

        // multiple tabs - show tab chooser
        showTabChooser(sheetName, tabs);
    }).catch(err => {
        console.error('Error fetching tabs:', err);
        // Inform the user and allow manual tab entry as a fallback
        showStatus('Unable to read sheet tabs (permissions or network). Please enter tab name manually.', 'error');
        // Ask user for a tab name; default to Sheet1
        const manualTab = window.prompt(`Could not read tabs for "${sheetName}". Enter the sheet (tab) name to use:`, localStorage.getItem('selectedSheetTab') || 'Sheet1');
        if (manualTab) {
            selectedSheetTab = manualTab;
            localStorage.setItem('selectedSheetTab', selectedSheetTab);
            showScannerSection();
            showStatus(`Selected: ${selectedSheetName} / ${selectedSheetTab}`, 'success');
        } else {
            // If user cancels, fall back to scanner without setting tab
            showScannerSection();
        }
    });
}

async function fetchSpreadsheetTabs(spreadsheetId) {
    try {
        const resp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
        return resp.result.sheets || [];
    } catch (e) {
        console.error('Error fetching spreadsheet tabs:', e);
        throw e;
    }
}

function showTabChooser(sheetName, tabs) {
    // Populate the existing #tabsList inside the sheet selection section so we don't
    // replace the whole section (which would remove event listeners and controls).
    let tabsList = document.getElementById('tabsList');
    // If the placeholder isn't present (older markup), create and append it.
    if (!tabsList) {
        tabsList = document.createElement('div');
        tabsList.id = 'tabsList';
        tabsList.style.marginTop = '12px';
        sheetSelectionSection.appendChild(tabsList);
    }

    // Optionally show a header so users know what to pick
    let header = sheetSelectionSection.querySelector('.tabs-header');
    if (!header) {
        header = document.createElement('h2');
        header.className = 'tabs-header';
        sheetSelectionSection.insertBefore(header, sheetSelectionSection.firstChild);
    }
    header.textContent = `Select a tab in ${sheetName}`;

    // Clear any existing tabs then populate
    tabsList.innerHTML = '';
    // Ensure the tabs container is visible and hide the sheets list to avoid confusion
    tabsList.style.display = 'block';
    const sheetsListEl = document.getElementById('sheetsList');
    if (sheetsListEl) sheetsListEl.style.display = 'none';
    tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'btn-sheet';
        btn.textContent = t.properties.title;
        btn.onclick = () => selectTab(t.properties.title);
        tabsList.appendChild(btn);
    });

    // show back button and hide refresh while choosing a tab
    backToSheetsBtn.style.display = 'inline-block';
    refreshSheetsBtn.style.display = 'none';
    sheetSelectionSection.style.display = 'block';
}

function selectTab(tabName) {
    selectedSheetTab = tabName;
    localStorage.setItem('selectedSheetTab', tabName);
    backToSheetsBtn.style.display = 'none';
    refreshSheetsBtn.style.display = 'inline-block';
    showScannerSection();
    showStatus(`Selected: ${selectedSheetName} / ${selectedSheetTab}`, 'success');
}

async function appendToSheet(code) {
    if (!selectedSheetId) {
        showStatus('No sheet selected', 'error');
        return false;
    }

    // If 'code' is an object with structured fields, append Full Name, Grade, ID, Date, Time
    let values;
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    if (code && typeof code === 'object' && (code.id || code.fn || code.ln || code.gr)) {
        const id = (code.id || '').toString().trim();
        const fn = (code.fn || '').toString();
        const ln = (code.ln || '').toString();
        const fullName = (fn + ' ' + ln).replace(/\s+/g, ' ').trim();
        const grade = (code.gr || '').toString().trim();
        values = [[fullName, grade, id, dateStr, timeStr]]; // A:FullName B:Grade C:ID D:Date E:Time
    } else {
        // Legacy behavior: append raw code + date + time
        values = [[code, '', '', dateStr, timeStr]]; // keep columns consistent
    }

    try {
        const sheetRange = `${selectedSheetTab || 'Sheet1'}!A:E`;
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: selectedSheetId,
            range: sheetRange,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values
            }
        });

        // For display purposes, pick a label for recent scans
    const displayLabel = (values[0][0] || values[0][0] === 0 ? values[0][0] : '').toString();
        addRecentScan(displayLabel, true);
        showStatus(`✓ Logged: ${displayLabel}`, 'success');
        return true;
    } catch (error) {
        console.error('Error appending to sheet:', error);
        addRecentScan((values && values[0] && values[0][0]) || code, false);
        showStatus('Error logging to sheet', 'error');
        return false;
    }
}

// Modal handling for when only ID scanned and we need name/grade
const promptModal = document.getElementById('promptModal');
const modalIdDisplay = document.getElementById('modalIdDisplay');
const modalFullName = document.getElementById('modalFullName');
const modalGrade = document.getElementById('modalGrade');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

let pendingIdForModal = null;

function showPromptForId(id) {
    pendingIdForModal = id;
    modalIdDisplay.textContent = `ID: ${id}`;
    modalFullName.value = '';
    modalGrade.value = '';
    // Make sure modal is visible and on top
    try {
        promptModal.style.display = 'flex';
        promptModal.style.zIndex = '9999';
        // prevent background scrolling while modal is open
        document.body.style.overflow = 'hidden';
        // focus the first input so keyboard appears on mobile
        setTimeout(() => {
            try { modalFullName.focus(); } catch(e){}
        }, 50);
    } catch (e) {
        console.warn('Could not show prompt modal:', e);
    }

    // pause scanning (safely)
    if (isScanning) {
        try {
            Quagga.pause();
            console.log('Scanner paused for modal input');
        } catch (e) {
            console.warn('Error pausing Quagga:', e);
        }
    }
}

function hidePrompt() {
    try {
        promptModal.style.display = 'none';
        promptModal.style.zIndex = '';
        document.body.style.overflow = '';
    } catch(e) {}
    pendingIdForModal = null;
    // resume scanning if it was active before
    if (isScanning) {
        try {
            Quagga.start();
            console.log('Scanner resumed after modal');
        } catch(e) {
            console.warn('Error resuming Quagga:', e);
        }
    }
}

modalCancelBtn.addEventListener('click', () => {
    hidePrompt();
});

modalSaveBtn.addEventListener('click', async () => {
    const fullName = modalFullName.value.trim();
    const grade = modalGrade.value.trim();
    const id = pendingIdForModal;
    if (!id) return hidePrompt();
    if (!fullName) {
        alert('Please enter full name');
        return;
    }
    // Build structured object and append (includes date/time in appendToSheet)
    const payload = { fn: fullName, ln: '', id: id.toString(), gr: grade };
    await appendToSheet(payload);
    hidePrompt();
});

// Scanner Functions
function startScanner() {
    if (isScanning) return;

    // Request camera permissions first
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(function(stream) {
            // Stop the test stream
            stream.getTracks().forEach(track => track.stop());
            
            // Now initialize Quagga
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: document.querySelector('#video'),
                    constraints: {
                        width: { ideal: 1280, min: 640 },
                        height: { ideal: 720, min: 480 },
                        facingMode: "environment"
                    }
                },
                decoder: {
                    readers: [
                        "code_128_reader",
                        "ean_reader",
                        "ean_8_reader",
                        "code_39_reader",
                        "code_39_vin_reader",
                        "codabar_reader",
                        "upc_reader",
                        "upc_e_reader",
                        "i2of5_reader"
                    ],
                    debug: {
                        drawBoundingBox: true,
                        showFrequency: false,
                        drawScanline: true,
                        showPattern: false
                    }
                },
                locate: true,
                numOfWorkers: 0,
                frequency: 10
            }, function (err) {
                if (err) {
                    console.error('Error starting scanner:', err);
                    scannerStatus.textContent = 'Camera initialization failed: ' + err.message;
                    scannerStatus.style.background = '#f8d7da';
                    scannerStatus.style.color = '#721c24';
                    return;
                }
                
                console.log('Quagga initialized, starting...');
                Quagga.start();
                isScanning = true;
                scannerStatus.textContent = 'Scanner active - Position barcode in view';
                scannerStatus.style.background = '#d4edda';
                scannerStatus.style.color = '#155724';

                // Start QR polling loop
                startQRLoop();
            });
        })
        .catch(function(err) {
            console.error('Camera access error:', err);
            scannerStatus.textContent = 'Camera access denied. Please enable camera permissions.';
            scannerStatus.style.background = '#f8d7da';
            scannerStatus.style.color = '#721c24';
        });

    Quagga.onDetected(async function (result) {
        const code = result.codeResult.code;
        const now = Date.now();
        const valid = /^\d{9,10}$/.test(code);

        // Try parsing structured JSON payloads
        let parsed = code;
        try {
            if (typeof code === 'string' && (code.trim().startsWith('{') || code.trim().startsWith('['))) {
                parsed = JSON.parse(code);
            }
        } catch (e) {
            // leave parsed as raw string
        }

        // Determine validity for display when parsed is a string
        const displayValue = (typeof parsed === 'object' ? (parsed.fn || parsed.ln ? (parsed.fn + ' ' + parsed.ln).trim() : JSON.stringify(parsed)) : parsed);
        const isValidNumeric = (/^\d{9,10}$/.test(parsed));
        const isStructured = (typeof parsed === 'object' && parsed !== null && (parsed.id || parsed.fn || parsed.ln || parsed.gr));

        // Always show detection overlay and update live read with validity
        showDetection(displayValue, isValidNumeric || isStructured);
        updateLiveRead('barcode', displayValue, isValidNumeric || isStructured);

        // If neither numeric nor structured, show and return
        if (!(isValidNumeric || isStructured)) {
            console.log('Invalid code format:', code);
            return;
        }

        // Prevent duplicate scans within 3 seconds
        if (displayValue === lastDetectedCode && now - lastDetectedTime < 3000) {
            return;
        }

        lastDetectedCode = displayValue;
        lastDetectedTime = now;

        // Provide haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

        scannerStatus.textContent = `✓ Detected: ${displayValue}`;
        scannerStatus.style.background = '#d4edda';
        scannerStatus.style.color = '#155724';

        // If structured, append immediately
        if (isStructured) {
            await appendToSheet(parsed);
            return;
        }

        // If numeric-only ID, prompt the user for name/grade
        if (isValidNumeric) {
            showPromptForId(displayValue);
            return;
        }
    });
    
    // Also show processing feedback
    Quagga.onProcessed(function (result) {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                result.boxes.filter(function (box) {
                    return box !== result.box;
                }).forEach(function (box) {
                    Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
                });
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
            }

            if (result.codeResult && result.codeResult.code) {
                Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
            }
        }
    });
}

function stopScanner() {
    if (isScanning) {
        Quagga.stop();
        isScanning = false;
    }
    // Stop QR loop if running
    if (qrLoopInterval) {
        clearInterval(qrLoopInterval);
        qrLoopInterval = null;
    }
    if (qrStartRetryTimeout) {
        clearTimeout(qrStartRetryTimeout);
        qrStartRetryTimeout = null;
    }
}

// QR scanning using jsQR (reads directly from Quagga's video/canvas)
function startQRLoop() {
    // Find Quagga's video element
    const qVideo = document.querySelector('#video video');
    if (!qVideo) {
        // Try again shortly
        qrStartRetryTimeout = setTimeout(startQRLoop, 500);
        return;
    }

    const qrCanvas = document.getElementById('canvas');
    const qrCtx = qrCanvas.getContext('2d');

    qrLoopInterval = setInterval(() => {
        try {
            // Match canvas size to video
            qrCanvas.width = qVideo.videoWidth;
            qrCanvas.height = qVideo.videoHeight;
            qrCtx.drawImage(qVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const imageData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) {
                const text = code.data.trim();
                // Try to parse JSON
                let parsed = text;
                let isStructured = false;
                try {
                    if (text.startsWith('{') || text.startsWith('[')) {
                        parsed = JSON.parse(text);
                        isStructured = (typeof parsed === 'object' && parsed !== null && (parsed.id || parsed.fn || parsed.ln || parsed.gr));
                    }
                } catch (e) {}

                const displayText = (typeof parsed === 'object') ? (parsed.fn || parsed.ln ? (parsed.fn + ' ' + parsed.ln).trim() : JSON.stringify(parsed)) : parsed;
                const isNumeric = (/^\d{9,10}$/.test(displayText));
                const valid = (isNumeric || isStructured);
                showDetection(displayText, valid);
                updateLiveRead('qr', displayText, valid);

                const now = Date.now();
                if (isStructured) {
                    if (displayText === lastDetectedCode && now - lastDetectedTime < 3000) return;
                    lastDetectedCode = displayText;
                    lastDetectedTime = now;
                    if (navigator.vibrate) navigator.vibrate(200);
                    appendToSheet(parsed);
                } else if (isNumeric) {
                    if (displayText === lastDetectedCode && now - lastDetectedTime < 3000) return;
                    lastDetectedCode = displayText;
                    lastDetectedTime = now;
                    if (navigator.vibrate) navigator.vibrate(200);
                    // Prompt for name/grade for numeric-only IDs
                    showPromptForId(displayText);
                }
            }
        } catch (e) {
            // swallow
        }
    }, 300);
}

function showDetection(code, isValid = true) {
    clearTimeout(overlayTimeout);
    // Use inline styles to ensure visibility even if external CSS is not applied correctly.
    try {
        detectionOverlay.style.display = 'block';
        detectionOverlay.style.position = 'absolute';
        detectionOverlay.style.top = '50%';
        detectionOverlay.style.left = '50%';
        detectionOverlay.style.transform = 'translate(-50%,-50%)';
        detectionOverlay.style.zIndex = '2147483647'; // very high
        detectionOverlay.style.pointerEvents = 'none';
        detectionOverlay.style.padding = '12px 18px';
        detectionOverlay.style.borderRadius = '10px';
        detectionOverlay.style.textAlign = 'center';
        detectionOverlay.style.fontWeight = '700';
        detectionOverlay.style.fontSize = '18px';
        detectionOverlay.style.color = isValid ? '#fff' : '#111';

        // Ensure overlay is placed after the camera/video nodes so it renders on top
        try {
            const cam = document.querySelector('.camera-container');
            if (cam) cam.appendChild(detectionOverlay);
        } catch(e) {}

        if (isValid) {
            // green for success
            detectionOverlay.style.background = '#28a745';
            detectionOverlay.innerHTML = `✓ Scanned<br><span style="font-size: 32px;">${code}</span>`;
        } else {
            // yellow for warning/invalid
            detectionOverlay.style.background = '#ffc107';
            detectionOverlay.innerHTML = `⚠ Detected<br><span style="font-size: 20px;">${code}</span><br><small style="font-size: 14px;">(Need 9-10 digits)</small>`;
        }
    } catch (e) {
        console.warn('Failed to style detection overlay inline:', e);
    }

    overlayTimeout = setTimeout(() => {
        try { detectionOverlay.style.display = 'none'; } catch(e){}
    }, isValid ? 2000 : 3000);
}

function updateLiveRead(type, value, isValid) {
    const ts = new Date().toLocaleTimeString();
    const prefix = type === 'qr' ? 'QR' : 'Barcode';
    const validity = isValid ? 'VALID' : 'INVALID';
    liveReadContent.innerHTML = `${prefix} | ${validity} | ${ts}<br><span style="font-size:18px;">${value}</span>`;
}

// Manual Entry
function handleManualSubmit() {
    const code = manualInput.value.trim();
    
    if (!/^\d{9,10}$/.test(code)) {
        showStatus('Please enter 9-10 digits', 'error');
        return;
    }
    // Append as a structured object so ID goes into column C and date/time into D/E
    appendToSheet({ id: code });
    manualInput.value = '';
}

// Recent Scans
function addRecentScan(code, success) {
    const scan = {
        code,
        timestamp: new Date().toLocaleString(),
        success
    };

    recentScans.unshift(scan);
    // keep a reasonable local history (200 items)
    if (recentScans.length > 200) recentScans.length = 200;
    try { localStorage.setItem('recentScans', JSON.stringify(recentScans)); } catch (e) { console.warn('Failed to save recentScans', e); }
    updateRecentScansDisplay();
}

function updateRecentScansDisplay() {
    if (recentScans.length === 0) {
        recentScansEl.innerHTML = '<p style="color: #999;">No scans yet</p>';
        return;
    }

    recentScansEl.innerHTML = recentScans.slice(0,50).map(scan => `
        <div class="scan-item ${scan.success ? 'success' : 'error'}">
            <div>
                <div class="scan-code">${scan.code}</div>
                <div class="scan-time">${scan.timestamp}</div>
            </div>
            <div>${scan.success ? '✓' : '✗'}</div>
        </div>
    `).join('');
}

// Export helpers
function exportRecentScansAsJson() {
    if (!recentScans || recentScans.length === 0) { showStatus('No scans to export', 'error'); return; }
    const data = JSON.stringify(recentScans, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scans-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('JSON exported', 'success');
}

function exportRecentScansAsCsv() {
    if (!recentScans || recentScans.length === 0) { showStatus('No scans to export', 'error'); return; }
    const rows = recentScans.map(s => [s.code, s.timestamp, s.success ? 'true' : 'false']);
    const header = ['code', 'timestamp', 'success'];
    const csv = [header, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scans-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('CSV exported', 'success');
}

function exportRecentScansAsXlsx() {
    if (!recentScans || recentScans.length === 0) { showStatus('No scans to export', 'error'); return; }
    try {
        const ws_data = [["code","timestamp","success"], ...recentScans.map(s => [s.code, s.timestamp, s.success ? 'true' : 'false'])];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, 'Scans');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scans-${new Date().toISOString()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showStatus('XLSX exported', 'success');
    } catch (e) {
        console.error('XLSX export failed', e);
        showStatus('XLSX export failed', 'error');
    }
}

// Batch append recent scans to Google Sheets (all at once)
async function batchAppendToSheet(tabName) {
    if (!recentScans || recentScans.length === 0) return false;
    if (!selectedSheetId) {
        showStatus('No Google Sheet selected. Please sign in and choose a sheet.', 'error');
        return false;
    }

    // Convert recentScans into rows matching A:E (FullName/Grade/ID/Date/Time) best-effort
    const rows = recentScans.map(s => {
        let parsed = s.code;
        try { if (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('['))) parsed = JSON.parse(parsed); } catch(e) {}
        if (parsed && typeof parsed === 'object' && (parsed.id || parsed.fn || parsed.ln || parsed.gr)) {
            const fullName = ((parsed.fn || '') + ' ' + (parsed.ln || '')).trim();
            return [fullName || '', parsed.gr || '', parsed.id || '', new Date(s.timestamp).toLocaleDateString(), new Date(s.timestamp).toLocaleTimeString()];
        }
        try {
            const dt = new Date(s.timestamp);
            return [s.code, '', '', dt.toLocaleDateString(), dt.toLocaleTimeString()];
        } catch (e) {
            return [s.code, '', '', '', ''];
        }
    });

    const sheetRange = `${tabName || (selectedSheetTab || 'Sheet1')}!A:E`;

    try {
        const resp = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: selectedSheetId,
            range: sheetRange,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: rows }
        });
        // mark appended scans as success locally
        recentScans = recentScans.map(s => ({ ...s, success: true }));
        try { localStorage.setItem('recentScans', JSON.stringify(recentScans)); } catch(e){}
        updateRecentScansDisplay();
        return true;
    } catch (e) {
        console.error('Batch append failed', e);
        return false;
    }
}

// Status Messages
function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message show ${type}`;
    
    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopScanner();
});
