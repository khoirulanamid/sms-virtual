const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    smsVirtualGetProfile: (apiKey) => ipcRenderer.invoke('sms:get-profile', apiKey),
    smsVirtualGetBalance: (apiKey) => ipcRenderer.invoke('sms:get-balance', apiKey),
    smsVirtualGetCountries: (apiKey, query) => ipcRenderer.invoke('sms:get-countries', apiKey, query),
    smsVirtualGetServices: (apiKey, query) => ipcRenderer.invoke('sms:get-services', apiKey, query),
    smsVirtualRequestNumber: (apiKey, serviceId, countryId) => ipcRenderer.invoke('sms:request-number', apiKey, serviceId, countryId),
    smsVirtualGetOngoing: (apiKey) => ipcRenderer.invoke('sms:get-ongoing', apiKey),
    smsVirtualGetStatus: (apiKey, id) => ipcRenderer.invoke('sms:get-status', apiKey, id),
    smsVirtualSetReady: (apiKey, id) => ipcRenderer.invoke('sms:set-ready', apiKey, id),
    smsVirtualResend: (apiKey, id) => ipcRenderer.invoke('sms:resend', apiKey, id),
    smsVirtualCancel: (apiKey, id) => ipcRenderer.invoke('sms:cancel', apiKey, id),
    smsVirtualComplete: (apiKey, id) => ipcRenderer.invoke('sms:complete', apiKey, id),

    smsVirtualSaveKey: (key) => ipcRenderer.invoke('sms:save-key', key),
    smsVirtualGetKey: () => ipcRenderer.invoke('sms:get-key'),

    // History
    smsVirtualSaveHistory: (data) => ipcRenderer.invoke('sms:save-history', data),
    smsVirtualGetHistory: () => ipcRenderer.invoke('sms:get-history'),

    // Deposits
    smsVirtualGetDepositMethods: (apiKey) => ipcRenderer.invoke('sms:get-deposit-methods', apiKey),
    smsVirtualRequestDeposit: (apiKey, methodId, amount) => ipcRenderer.invoke('sms:request-deposit', apiKey, methodId, amount),
    smsVirtualGetDepositHistory: (apiKey) => ipcRenderer.invoke('sms:get-deposit-history', apiKey),
    smsVirtualCancelDeposit: (apiKey, id) => ipcRenderer.invoke('sms:cancel-deposit', apiKey, id)
});
