let pollingInterval = null;
let depositPollingInterval = null;
const alarmedOtps = new Set(); // To prevent repeating sound for the same OTP

const Elements = {
    apiKeyInput: document.getElementById('sms-apikey-input'),
    saveKeyBtn: document.getElementById('sms-btn-save-key'),
    profileDisplay: document.getElementById('sms-profile-display'),
    balanceDisplay: document.getElementById('sms-balance-display'),
    countryInput: document.getElementById('sms-country-input'),
    countryList: document.getElementById('sms-country-list'),
    serviceInput: document.getElementById('sms-service-input'),
    serviceList: document.getElementById('sms-service-list'),
    requestBtn: document.getElementById('sms-btn-request'),
    activeList: document.getElementById('sms-active-list'),
    toastContainer: document.getElementById('toast-container'),
    navItems: document.querySelectorAll('.nav-item'),
    viewPanels: document.querySelectorAll('.view-panel'),
    mainTitle: document.getElementById('main-page-title'),
    historyList: document.getElementById('sms-history-list'),
    depositMethodSelect: document.getElementById('sms-deposit-method'),
    depositAmountInput: document.getElementById('sms-deposit-amount'),
    depositBtn: document.getElementById('sms-btn-deposit'),
    depositHistoryList: document.getElementById('sms-deposit-history')
};

let activeOrders = [];
let audioContext = null;

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    Elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3500);
}

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    
    const newBtnCancel = btnCancel.cloneNode(true);
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

    newBtnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    newBtnConfirm.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });

    modal.style.display = 'flex';
}

// Navigation
Elements.navItems.forEach(nav => {
    nav.addEventListener('click', () => {
        Elements.navItems.forEach(n => n.classList.remove('active'));
        nav.classList.add('active');
        
        const targetId = nav.getAttribute('data-target');
        if (targetId) {
            Elements.viewPanels.forEach(p => p.style.display = 'none');
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.style.display = 'block';
                Elements.mainTitle.textContent = nav.textContent.trim();
            }
            
            if (targetId === 'view-history') loadHistory();
            if (targetId === 'view-deposit') loadDepositView();
        }
    });
});

async function init() {
    const key = await window.api.smsVirtualGetKey();
    if (key) {
        Elements.apiKeyInput.value = key;
        connect(key);
    }

    Elements.saveKeyBtn.addEventListener('click', async () => {
        const val = Elements.apiKeyInput.value.trim();
        if (val) {
            await window.api.smsVirtualSaveKey(val);
            connect(val);
        }
    });

    Elements.requestBtn.addEventListener('click', handleRequestNumber);
    Elements.depositBtn.addEventListener('click', handleRequestDeposit);

    Elements.depositMethodSelect.addEventListener('change', () => {
        const amount = parseInt(Elements.depositAmountInput.value, 10);
        Elements.depositBtn.disabled = !Elements.depositMethodSelect.value || isNaN(amount) || amount < 1000;
    });
    Elements.depositAmountInput.addEventListener('input', () => {
        const amount = parseInt(Elements.depositAmountInput.value, 10);
        Elements.depositBtn.disabled = !Elements.depositMethodSelect.value || isNaN(amount) || amount < 1000;
    });
}

async function connect(key) {
    Elements.saveKeyBtn.disabled = true;
    Elements.saveKeyBtn.innerHTML = '<span class="loader"></span> Menghubungkan';

    const profileOk = await loadProfile(key);
    if (profileOk) {
        document.querySelector('.status-dot').classList.add('active');
        showToast('Berhasil terhubung ke SMS Virtuals!');
        await loadCountries(key);
        await loadServices(key);
        Elements.requestBtn.disabled = false;
        startPolling(key);
    } else {
        document.querySelector('.status-dot').classList.remove('active');
        showToast('Gagal terhubung. Cek API Key Anda.');
        Elements.requestBtn.disabled = true;
    }

    Elements.saveKeyBtn.disabled = false;
    Elements.saveKeyBtn.innerHTML = 'Hubungkan';
}

async function loadProfile(key) {
    const res = await window.api.smsVirtualGetProfile(key);
    if (res.success && res.data) {
        Elements.profileDisplay.textContent = res.data.email || res.data.name || 'Terhubung';
        
        const balRes = await window.api.smsVirtualGetBalance(key);
        if (balRes.success) {
            Elements.balanceDisplay.textContent = 'Rp ' + (balRes.data.balance || 0).toLocaleString('id-ID');
        }
        return true;
    }
    return false;
}

let cachedCountries = [];
let cachedServices = [];

async function loadCountries(key) {
    const res = await window.api.smsVirtualGetCountries(key, { pageSize: 300 });
    if (res.success && res.data && Array.isArray(res.data)) {
        cachedCountries = res.data;
        Elements.countryInput.placeholder = 'Ketik nama negara...';
        Elements.countryList.innerHTML = '';
        res.data.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            Elements.countryList.appendChild(opt);
        });
        
        const indo = res.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (indo) Elements.countryInput.value = indo.name;
    }
}

async function loadServices(key) {
    const res = await window.api.smsVirtualGetServices(key, { pageSize: 1000 });
    if (res.success && res.data && Array.isArray(res.data)) {
        Elements.serviceInput.placeholder = 'Ketik nama layanan...';
        Elements.serviceList.innerHTML = '';
        
        const common = ['whatsapp', 'telegram', 'google', 'facebook', 'instagram', 'tiktok', 'twitter'];
        const sortedServices = res.data.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aCommon = common.find(c => aName.includes(c));
            const bCommon = common.find(c => bName.includes(c));
            if (aCommon && !bCommon) return -1;
            if (!aCommon && bCommon) return 1;
            return a.name.localeCompare(b.name);
        });

        cachedServices = sortedServices;

        sortedServices.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            Elements.serviceList.appendChild(opt);
        });
    }
}

async function handleRequestNumber() {
    const key = await window.api.smsVirtualGetKey();
    const cName = Elements.countryInput.value.trim();
    const sName = Elements.serviceInput.value.trim();
    
    const countryObj = cachedCountries.find(c => c.name.toLowerCase() === cName.toLowerCase());
    const serviceObj = cachedServices.find(s => s.name.toLowerCase() === sName.toLowerCase());

    if (!countryObj || !serviceObj) {
        showToast('Pilih Negara dan Layanan yang valid dari daftar.');
        return;
    }

    const cId = countryObj.id;
    const sId = serviceObj.id;

    Elements.requestBtn.disabled = true;
    Elements.requestBtn.innerHTML = '<span class="loader"></span> Memproses';

    const res = await window.api.smsVirtualRequestNumber(key, sId, cId);
    if (res.success) {
        showToast('Berhasil merequest nomor baru!');
        loadProfile(key);
        pollActive(key);
    } else {
        let errorMsg = res.error || 'Terjadi kesalahan';
        if (errorMsg.includes('Number being restocked')) {
            errorMsg = 'Stok nomor sedang kosong/habis. Silakan coba lagi dalam beberapa menit.';
        } else if (errorMsg.includes('Insufficient balance')) {
            errorMsg = 'Saldo tidak cukup.';
        }
        showToast('Gagal: ' + errorMsg);
    }

    Elements.requestBtn.disabled = false;
    Elements.requestBtn.innerHTML = 'Request Nomor';
}

function startPolling(key) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollActive(key);
    pollingInterval = setInterval(() => pollActive(key), 5000);
}

function startDepositPolling(key) {
    if (depositPollingInterval) clearInterval(depositPollingInterval);
    pollDepositActive(key);
    depositPollingInterval = setInterval(() => pollDepositActive(key), 10000);
}

function playAlarm(otpText, service, phone) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.5);
}

async function pollActive(key) {
    try {
        const res = await window.api.smsVirtualGetOngoing(key);
        if (res.success && res.data && Array.isArray(res.data)) {
            renderActiveList(key, res.data);
            activeOrders = res.data;
        }
    } catch (e) {
        console.error('Polling error', e);
    }
}

function renderActiveList(key, items) {
    Elements.activeList.innerHTML = '';
    if (items.length === 0) {
        Elements.activeList.innerHTML = '<tr><td colspan="5" class="empty-state">Tidak ada pesanan aktif.</td></tr>';
        return;
    }

    items.forEach(async (item) => {
        const tr = document.createElement('tr');
        
        let statusText = 'PENDING';
        let badgeClass = 'badge-pending';
        let otpCode = '';
        if (item.orderDetailOtp && item.orderDetailOtp.length > 0) {
            otpCode = item.orderDetailOtp[item.orderDetailOtp.length - 1].otp;
        }
        
        if (item.status === 1) { statusText = 'READY'; badgeClass = 'badge-ready'; }
        if (item.status === 2) { statusText = 'RESEND'; badgeClass = 'badge-pending'; }
        if (item.status === 3) { statusText = 'SUCCESS'; badgeClass = 'badge-success'; }
        
        if (otpCode) {
            statusText = 'OTP MASUK';
            badgeClass = 'badge-success';
            
            const existing = activeOrders.find(o => o.id === item.id);
            if (existing) {
                const oldOtp = existing.orderDetailOtp && existing.orderDetailOtp.length > 0 ? existing.orderDetailOtp[existing.orderDetailOtp.length - 1].otp : null;
                if (!oldOtp && otpCode) {
                    playAlarm(otpCode, item.serviceCountry.service.name, item.phoneNumber);
                    showToast(`OTP Masuk: ${otpCode}`);
                }
            } else if (otpCode) {
                playAlarm(otpCode, item.serviceCountry.service.name, item.phoneNumber);
            }
        }

        const isPendingOrReady = item.status === 0 || item.status === 1 || item.status === 2;
        const serviceName = item.serviceCountry?.service?.name || 'Layanan';
        const countryName = item.serviceCountry?.country?.name || 'Negara';
        const price = item.servicePrice ? item.servicePrice.toLocaleString('id-ID') : '0';
        
        let timeLeft = '';
        if (item.expiredTime && !otpCode) {
            const expireDate = new Date(item.expiredTime).getTime();
            const now = new Date().getTime();
            const diff = Math.floor((expireDate - now) / 1000);
            if (diff > 0) {
                const m = Math.floor(diff / 60);
                const s = diff % 60;
                timeLeft = `Sisa: ${m}m ${s}s`;
            } else {
                timeLeft = 'Expired';
            }
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; color: var(--text-primary);">${serviceName}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${countryName} • Rp ${price}</div>
                ${timeLeft ? `<div style="font-size: 0.8rem; color: var(--warning); margin-top: 4px;">⏳ ${timeLeft}</div>` : ''}
            </td>
            <td style="font-family: monospace; font-size: 1.1rem; color: #e2e8f0;">+${item.phoneNumber || '...'}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
            <td>
                ${otpCode ? `<div class="otp-box" onclick="navigator.clipboard.writeText('${otpCode}'); showToast('Disalin: ${otpCode}')" title="Klik untuk copy">${otpCode}</div>` : '<span style="color:var(--text-secondary)">Menunggu...</span>'}
            </td>
            <td>
                <div class="action-buttons">
                    ${isPendingOrReady && !otpCode ? `<button class="btn btn-sm btn-outline-primary" onclick="actionReady('${item.id}')" title="Ready">Ready</button>` : ''}
                    ${otpCode ? `<button class="btn btn-sm btn-outline-success" onclick="actionComplete('${item.id}', '${serviceName}', '${item.phoneNumber}', '${otpCode}')" title="Selesai">Complete</button>` : ''}
                    ${isPendingOrReady && !otpCode ? `<button class="btn btn-sm btn-outline-danger" onclick="actionCancel('${item.id}')" title="Batal">Cancel</button>` : ''}
                </div>
            </td>
        `;
        Elements.activeList.appendChild(tr);
    });
}

window.actionReady = async (id) => {
    const key = await window.api.smsVirtualGetKey();
    await window.api.smsVirtualSetReady(key, id);
    pollActive(key);
};

window.actionCancel = async (id) => {
    showConfirm('Batalkan Pesanan', 'Yakin ingin membatalkan penyewaan nomor ini? Saldo akan direfund jika belum digunakan.', async () => {
        const key = await window.api.smsVirtualGetKey();
        const res = await window.api.smsVirtualCancel(key, id);
        if (res.success) {
            showToast('Pesanan dibatalkan. Saldo telah dikembalikan.');
            loadProfile(key);
        } else {
            // Translate English error to Indonesian if possible
            let errorMsg = res.error || 'Terjadi kesalahan';
            if (errorMsg.includes('wait 20 seconds')) errorMsg = 'Harap tunggu 20 detik sebelum membatalkan!';
            
            showToast('Gagal membatalkan: ' + errorMsg);
        }
        pollActive(key);
    });
};

window.actionComplete = async (id, serviceName, phone, otp) => {
    const key = await window.api.smsVirtualGetKey();
    await window.api.smsVirtualComplete(key, id);
    
    // Save to history
    await window.api.smsVirtualSaveHistory({
        id,
        date: new Date().toISOString(),
        service: serviceName,
        phone,
        otp
    });
    
    showToast('Penyewaan Selesai! Data disimpan ke Riwayat.');
    pollActive(key);
};

async function loadHistory() {
    const items = await window.api.smsVirtualGetHistory();
    Elements.historyList.innerHTML = '';
    
    if (!items || items.length === 0) {
        Elements.historyList.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada riwayat penyewaan.</td></tr>';
        return;
    }
    
    items.forEach(item => {
        const dateObj = new Date(item.date);
        const dateStr = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</td>
            <td style="font-weight: 600;">${item.service}</td>
            <td style="font-family: monospace; font-size: 1.1rem; color: #e2e8f0;">+${item.phone}</td>
            <td><div class="otp-box" style="display:inline-block;" onclick="navigator.clipboard.writeText('${item.otp}'); showToast('Disalin: ${item.otp}')">${item.otp}</div></td>
        `;
        Elements.historyList.appendChild(tr);
    });
}

// ===================== DEPOSIT LOGIC =====================

async function loadDepositView() {
    const key = await window.api.smsVirtualGetKey();
    if (!key) return;
    
    startDepositPolling(key);
    
    // Load deposit methods
    const res = await window.api.smsVirtualGetDepositMethods(key);
    console.log("DEPOSIT METHODS RES:", res);
    if (res.success && res.data && Array.isArray(res.data)) {
        Elements.depositMethodSelect.innerHTML = '<option value="">Pilih Metode...</option>';
        res.data.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name} (Min: Rp ${m.minAmount.toLocaleString('id-ID')})`;
            opt.dataset.min = m.minAmount;
            Elements.depositMethodSelect.appendChild(opt);
        });
    }
}

async function pollDepositActive(key) {
    try {
        const res = await window.api.smsVirtualGetDepositHistory(key);
        if (res.success && res.data && Array.isArray(res.data)) {
            renderDepositHistory(res.data);
        }
    } catch (e) {
        console.error('Polling deposit error', e);
    }
}

function renderDepositHistory(items) {
    Elements.depositHistoryList.innerHTML = '';
    if (items.length === 0) {
        Elements.depositHistoryList.innerHTML = '<tr><td colspan="5" class="empty-state">Tidak ada riwayat deposit.</td></tr>';
        return;
    }

    items.forEach(item => {
        const dateObj = new Date(item.createdAt);
        const dateStr = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID');
        const tr = document.createElement('tr');
        
        let statusText = 'PENDING';
        let badgeClass = 'badge-pending';
        let isPending = false;
        
        if (item.status === 1) { statusText = 'SUCCESS'; badgeClass = 'badge-success'; }
        else if (item.status === 2) { statusText = 'FAILED'; badgeClass = 'badge-danger'; }
        else if (item.status === 3) { statusText = 'EXPIRED'; badgeClass = 'badge-danger'; }
        else if (item.status === 4) { statusText = 'REFUNDED'; badgeClass = 'badge-primary'; }
        else if (item.status === 0) {
            isPending = true;
            statusText = 'PENDING';
            badgeClass = 'badge-pending';
        }

        let instructionHtml = '-';
        if (isPending && item.paymentData) {
            if (item.paymentData.startsWith('000201')) { // Basic QRIS check
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(item.paymentData)}&size=150x150`;
                instructionHtml = `<div style="text-align: center;"><img src="${qrUrl}" alt="QRIS" style="border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><br><small style="color:var(--text-secondary); cursor:pointer;" onclick="navigator.clipboard.writeText('${item.paymentData}'); showToast('Kode disalin')">Salin Kode Teks</small></div>`;
            } else {
                instructionHtml = `<div class="otp-box" style="font-size: 0.9rem;" onclick="navigator.clipboard.writeText('${item.paymentData}'); showToast('Instruksi disalin')">${item.paymentData}</div>`;
            }
        } else if (item.status === 1) {
            instructionHtml = '<span style="color:var(--success)">Selesai</span>';
        }

        tr.innerHTML = `
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</td>
            <td style="font-weight: 600;">${item.depositMethod?.name || '-'}</td>
            <td style="font-family: monospace; font-size: 1.1rem; color: #e2e8f0;">Rp ${item.amountCoin ? item.amountCoin.toLocaleString('id-ID') : '0'}</td>
            <td>
                <span class="badge ${badgeClass}">${statusText}</span>
                ${isPending ? `<br><button class="btn btn-sm btn-outline-danger" style="margin-top:8px;" onclick="actionCancelDeposit('${item.id}')">Batalkan</button>` : ''}
            </td>
            <td>${instructionHtml}</td>
        `;
        Elements.depositHistoryList.appendChild(tr);
    });
}

async function handleRequestDeposit() {
    const key = await window.api.smsVirtualGetKey();
    const methodId = Elements.depositMethodSelect.value;
    const amountStr = Elements.depositAmountInput.value;
    const amount = parseInt(amountStr, 10);
    
    if (!methodId || isNaN(amount) || amount < 1000) {
        showToast('Pilih metode dan masukkan jumlah valid (Min 1000).');
        return;
    }

    Elements.depositBtn.disabled = true;
    Elements.depositBtn.innerHTML = '<span class="loader"></span> Memproses';

    const res = await window.api.smsVirtualRequestDeposit(key, methodId, amount);
    if (res.success) {
        showToast('Deposit berhasil direquest! Silakan bayar.');
        pollDepositActive(key);
        Elements.depositAmountInput.value = '';
    } else {
        showToast('Gagal Deposit: ' + (res.error || 'Terjadi kesalahan'));
    }

    Elements.depositBtn.disabled = false;
    Elements.depositBtn.innerHTML = 'Request Deposit';
}

window.actionCancelDeposit = async (id) => {
    showConfirm('Batalkan Tagihan', 'Yakin ingin membatalkan tagihan deposit ini?', async () => {
        const key = await window.api.smsVirtualGetKey();
        const res = await window.api.smsVirtualCancelDeposit(key, id);
        if (res.success) showToast('Deposit dibatalkan.');
        else showToast('Gagal membatalkan deposit.');
        pollDepositActive(key);
    });
};

// Initialize
document.addEventListener('DOMContentLoaded', init);
