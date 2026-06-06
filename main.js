const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://api.sms-virtuals.net/v1';
let tray = null;
let mainWindow = null;
let isQuitting = false;

const historyFile = path.join(app.getPath('userData'), 'history.json');
const keyFile = path.join(app.getPath('userData'), 'api_key_enc.bin');

async function requestApi(endpoint, method = 'GET', apiKey, data = null) {
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        };
        if (data) config.data = data;
        const response = await axios(config);
        console.log(`[API SUCCESS] ${endpoint}`);
        return { success: true, data: response.data.data || response.data };
    } catch (error) {
        console.log(`[API ERROR] ${endpoint}: ${error.message}`);
        return { success: false, error: error.response?.data?.message || error.message };
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'SMS Virtuals Desktop',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.loadFile('index.html');
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png'); // fallback
    tray = new Tray(nativeImage.createEmpty()); 
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Buka Aplikasi', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Keluar', click: () => {
            isQuitting = true;
            app.quit();
        }}
    ]);
    tray.setToolTip('SMS Virtuals OTP Desktop');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow.show());
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    // Empty on purpose: we handle close manually to minimize to tray
});

// History & SafeStorage IPC
ipcMain.handle('sms:save-key', (event, key) => {
    try {
        if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(key);
            fs.writeFileSync(keyFile, encrypted);
            return true;
        }
        fs.writeFileSync(keyFile, key, 'utf8'); // fallback
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('sms:get-key', (event) => {
    try {
        if (fs.existsSync(keyFile)) {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = fs.readFileSync(keyFile);
                return safeStorage.decryptString(encrypted);
            }
            return fs.readFileSync(keyFile, 'utf8');
        }
    } catch (e) { }
    return null;
});

ipcMain.handle('sms:get-history', (event) => {
    try {
        if (fs.existsSync(historyFile)) {
            return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        }
    } catch (e) { }
    return [];
});

ipcMain.handle('sms:save-history', (event, item) => {
    try {
        let history = [];
        if (fs.existsSync(historyFile)) {
            history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        }
        history.unshift(item); // Add to top
        if (history.length > 500) history = history.slice(0, 500); // keep max 500
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
        return true;
    } catch (e) {
        return false;
    }
});

// SMS API Handlers
ipcMain.handle('sms:get-profile', async (event, apiKey) => requestApi('/public/profile', 'GET', apiKey));
ipcMain.handle('sms:get-balance', async (event, apiKey) => requestApi('/public/balance', 'GET', apiKey));
ipcMain.handle('sms:get-countries', async (event, apiKey, query = {}) => {
    const params = new URLSearchParams(query).toString();
    return requestApi(`/public/countries${params ? '?' + params : ''}`, 'GET', apiKey);
});
ipcMain.handle('sms:get-services', async (event, apiKey, query = {}) => {
    const params = new URLSearchParams(query).toString();
    return requestApi(`/public/services${params ? '?' + params : ''}`, 'GET', apiKey);
});
ipcMain.handle('sms:request-number', async (event, apiKey, serviceId, countryId) => {
    const listRes = await requestApi(`/public/services/list?countryId=${countryId}&pageSize=1000`, 'GET', apiKey);
    if (!listRes.success) return listRes;

    const svc = listRes.data.find(s => s.id === serviceId);
    if (!svc || !svc.prices || svc.prices.length === 0) {
        return { success: false, error: 'Layanan tidak tersedia di negara tersebut / Kosong.' };
    }

    const sortedPrices = svc.prices.sort((a, b) => {
        const priceA = a.promoPrice > 0 ? a.promoPrice : a.sellPrice;
        const priceB = b.promoPrice > 0 ? b.promoPrice : b.sellPrice;
        return priceA - priceB;
    });

    const priceId = sortedPrices[0].id;
    return requestApi('/public/orders/request-single-service', 'POST', apiKey, {
        serviceCountryPriceId: priceId,
        autoSearchServer: true
    });
});
ipcMain.handle('sms:get-ongoing', async (event, apiKey) => requestApi('/public/orders/ongoing-activation', 'GET', apiKey));
ipcMain.handle('sms:get-status', async (event, apiKey, id) => requestApi(`/public/orders/getStatus/${id}`, 'GET', apiKey));
ipcMain.handle('sms:set-ready', async (event, apiKey, id) => requestApi(`/public/orders/ready/${id}`, 'PUT', apiKey));
ipcMain.handle('sms:resend', async (event, apiKey, id) => requestApi(`/public/orders/resend/${id}`, 'PUT', apiKey));
ipcMain.handle('sms:cancel', async (event, apiKey, id) => requestApi(`/public/orders/cancel/${id}`, 'PUT', apiKey));
ipcMain.handle('sms:complete', async (event, apiKey, id) => requestApi(`/public/orders/complete/${id}`, 'PUT', apiKey));

// Deposit Endpoints
ipcMain.handle('sms:get-deposit-methods', async (event, apiKey) => requestApi('/public/deposits', 'GET', apiKey));
ipcMain.handle('sms:request-deposit', async (event, apiKey, depositMethodId, amount) => {
    return requestApi('/public/deposits/request', 'POST', apiKey, { depositMethodId, amount });
});
ipcMain.handle('sms:get-deposit-history', async (event, apiKey) => requestApi('/public/deposits/history?pageSize=100', 'GET', apiKey));
ipcMain.handle('sms:cancel-deposit', async (event, apiKey, id) => requestApi(`/public/deposits/cancel/${id}`, 'PUT', apiKey));
