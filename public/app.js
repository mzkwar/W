let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];
let displayedSubscribers = [];
let debounceTimer = null;

window.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('ftth_theme') || 'dark';
    applyTheme(savedTheme);

    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        
        await Promise.all([
            loadSubscribersFast(),
            loadWalletBalance(),
            loadSessions(),
            loadAgents(),
            loadTickets(),
            loadRequestsTasks()
        ]);

        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 300);
        }
    } else {
        const loader = document.getElementById('global-loader');
        if (loader) loader.remove();
    }
});

function applyTheme(theme) {
    const htmlEl = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (theme === 'dark') {
        htmlEl.classList.add('dark');
        if (themeIcon) themeIcon.innerText = '🌙';
        if (themeText) themeText.innerText = 'الداكن';
    } else {
        htmlEl.classList.remove('dark');
        if (themeIcon) themeIcon.innerText = '☀️';
        if (themeText) themeText.innerText = 'الفاتح';
    }
    localStorage.setItem('ftth_theme', theme);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    applyTheme(isDark ? 'light' : 'dark');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-xs font-extrabold text-white transition-all duration-300 transform translate-y-[-20px] opacity-0 ${type === 'error' ? 'bg-rose-600 border border-rose-500' : 'bg-indigo-600 border border-indigo-500'}`; toast.innerText = message; container.appendChild(toast);  setTimeout(() => toast.classList.remove('translate-y-[-20px]', 'opacity-0'), 10); setTimeout(() => { toast.classList.add('translate-y-[-20px]', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000); }  function handleAuthError(res) { if (res.status === 401) { showToast("انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول", "error"); logout(); return true; } return false; }  function getAccountIdFromToken(token) { try { const base64Url = token.split('.')[1]; const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) { return '\%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); const payload = JSON.parse(jsonPayload); return payload.AccountId \vert{}\vert{} payload.sub \vert{}\vert{} '16909'; } catch (e) { return '16909'; } }  document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault(); const btn = document.getElementById('login-btn'); btn.innerText = 'جاري الاتصال...'; btn.disabled = true;  try { const res = await fetch('/api/ftth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('ftth-email').value, password: document.getElementById('ftth-password').value }) }); const data = await res.json(); const rawToken = data.access_token \vert{}\vert{} data.token \vert{}\vert{} data.accessToken;  if (res.ok && rawToken) { authToken = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
            localStorage.setItem('ftth_token', authToken);
            location.reload();
        } else {
            showToast(data.message || data.error || "فشل تسجيل الدخول", "error");
            btn.innerText = 'دخول النظام';
            btn.disabled = false;
        }
    } catch (err) {
        showToast("حدث خطأ في الاتصال بالسيرفر", "error");
        btn.innerText = 'دخول النظام';
        btn.disabled = false;
    }
});

function switchTab(tabName, title) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden'); document.getElementById('header-title').innerText = title \vert{}\vert{} 'مركز وار لخدمات الانترنت';  document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('text-indigo-500', 'font-extrabold'); btn.classList.add('text-slate-400'); });  // ربط الأزرار السفلية بالتبويبات let btnId = 'btn-subscribers'; if (tabName === 'new-subscriber') btnId = 'btn-new-subscriber'; else if (tabName === 'agents') btnId = 'btn-agents'; else if (tabName === 'tickets') btnId = 'btn-tickets'; else if (tabName === 'tasks') btnId = 'btn-tasks';  const activeBtn = document.getElementById(btnId); if (activeBtn) activeBtn.classList.add('text-indigo-500', 'font-extrabold'); }  function extractValue(field) { if (!field && field !== false && field !== 0) return ''; if (typeof field === 'object') { return field.displayValue \vert{}\vert{} field.name \vert{}\vert{} field.title \vert{}\vert{} field.id \vert{}\vert{} JSON.stringify(field); } return String(field); }  function cleanUsername(userStr) { const raw = extractValue(userStr); return raw.startsWith('@') ? raw.substring(1) : raw; }  function getSubscriptionType(sub) { let typeVal = ''; if (sub.self) { typeVal = extractValue(sub.self); } if ((!typeVal \vert{}\vert{} typeVal.toUpperCase() === 'SELF') && sub.package) { typeVal = extractValue(sub.package); } return typeVal \vert{}\vert{} 'SELF'; }  function formatDateClean(isoString) { if (!isoString) return 'غير محدد'; try { const date = new Date(isoString); const now = new Date(); const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));  const datePart = date.toISOString().split('T')[0]; const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });  let statusText = diffDays > 0 ? `[ ينتهي بعد ${diffDays} يوم ]` : diffDays === 0 ? `[ ينتهي اليوم ]` : `[ منذ ${Math.abs(diffDays)} يوم ]`; return `${datePart} ${timePart}${statusText}`;
    } catch (e) {
        return isoString;
    }
}

function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return 'غير متوفرة';
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    let res = '';
    if (days > 0) res += `${days} يوم `; if (hours > 0) res += `${hours} ساعة `;
    if (minutes > 0) res += `${minutes} دقيقة`; return res.trim() \vert{}\vert{} `${seconds} ثانية`;
}

function formatOntData(ontData, subDeviceDetails) {
    const model = ontData?.model || ontData || {};
    let statusText = 'Up';
    if (model.status) {
        statusText = typeof model.status === 'object' ? (model.status.displayValue || model.status.name || 'Up') : String(model.status);
    }
    
    let rxPowerVal = model.rxPower !== undefined && model.rxPower !== null ? model.rxPower : 'غير متوفرة';
    let serialNum = subDeviceDetails?.serial || model.serialNumber || model.sn || 'غير معروف';
    let fdtVal = extractValue(subDeviceDetails?.fdt) || 'غير متاح';
    let fatVal = extractValue(subDeviceDetails?.fat) || 'غير متاح';

    return `
        <div class="bg-cardLight dark:bg-cardDark p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div class="text-indigo-600 dark:text-indigo-400 font-black border-b border-slate-200 dark:border-slate-700 pb-2 text-sm flex items-center gap-2">
                📡 2. معلومات جهاز الـ ONT واختبار الإشارة
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span class="text-slate-500 dark:text-slate-400 font-bold">الرقم التسلسلي (SN):</span>
                    <span class="font-extrabold font-mono dir-ltr text-indigo-500 text-sm">${serialNum}</span>
                </div>
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span class="text-slate-500 dark:text-slate-400 font-bold">حالة ONT:</span>
                    <span class="font-extrabold text-emerald-500 text-sm">${statusText}</span>
                </div>
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span class="text-slate-500 dark:text-slate-400 font-bold">البور (Rx Power):</span>
                    <span class="font-extrabold font-mono text-cyan-500 dir-ltr text-sm">${rxPowerVal} dBm</span>
                </div>
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span class="text-slate-500 dark:text-slate-400 font-bold">FDT / FAT:</span>
                    <span class="font-extrabold text-sm">${fdtVal} /${fatVal}</span>
                </div>
            </div>
        </div>
    `;
}

function formatSessionDetails(sub) {
    let startedHtml = sub.startedAt ? `<div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs"><span class="text-slate-500 dark:text-slate-400 font-bold">تاريخ التفعيل:</span><span class="font-mono font-bold">${formatDateClean(sub.startedAt)}</span></div>` : '';
    
    if (!sub.activeSession) {
        return startedHtml + `<div class="bg-cardLight dark:bg-cardDark p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 text-xs text-center font-bold">لا توجد جلسة اتصال نشطة حالياً</div>`;
    }

    const session = sub.activeSession;
    return `
        ${startedHtml}
        <div class="bg-cardLight dark:bg-cardDark p-5 rounded-2xl border border-blue-500/30 shadow-sm space-y-3 text-xs">
            <div class="text-blue-500 font-black border-b border-blue-500/20 pb-2 flex items-center gap-2 text-sm">🌐 تفاصيل جلسة الاتصال النشطة</div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">وقت الاتصال:</span><span class="font-bold">${formatDateClean(session.startedAt)}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">مدة الأونلاين:</span><span class="font-extrabold text-emerald-500 text-sm">${formatDuration(session.sessionTimeInSeconds)}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">عنوان IP:</span><span class="font-mono dir-ltr text-indigo-500 font-bold text-sm">${session.ipAddress || 'N/A'}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">عنوان MAC:</span><span class="font-mono dir-ltr text-slate-400 font-bold text-sm">${session.macAddress || 'N/A'}</span></div>
        </div>
    `;
}

async function loadWalletBalance() {
    const badge = document.getElementById('wallet-badge');
    if (!badge) return;

    try {
        const cleanToken = authToken.replace('Bearer ', '');
        const accountId = getAccountIdFromToken(cleanToken);

        const res = await fetch(`/api/ftth/wallet/${accountId}`, { headers: { 'Authorization': authToken } }); if (handleAuthError(res)) return;  if (res.ok) { const walletData = await res.json(); let balance = walletData.model?.balance ?? walletData.balance ?? walletData ?? 0; badge.innerText = `الرصيد: ${Number(balance).toLocaleString()} د.ع`;
        } else {
            badge.innerText = `الرصيد: متاح`;
        }
    } catch (e) {
        badge.innerText = `الرصيد: --`;
    }
}

async function loadSessions() {
    try {
        const res = await fetch('/api/ftth/sessions', { headers: { 'Authorization': authToken } });
        handleAuthError(res);
    } catch (e) {
        console.error("خطأ في جلب الجلسات", e);
    }
}

async function loadSubscribersFast() {
    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const subData = await res.json();
        cachedSubscribers = Array.isArray(subData) ? subData : (subData.items || subData.subscribers || subData.data || []);
        
        updateGlobalStats(cachedSubscribers);
        renderTableRows(cachedSubscribers);
        
        // جلب البور في الخلفية بسلاسة
        fetchPowerInBackround(cachedSubscribers);

    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        const tbody = document.getElementById('subscribers-table-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-500 font-bold">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

async function fetchPowerInBackround(subscribers) {
    const batchSize = 5;
    for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);
        await Promise.all(batch.map(async (sub) => {
            if (sub.rxPower !== undefined) return;

            const username = cleanUsername(sub.username) || cleanUsername(sub.id);
            if (!username || username === 'N/A') return;

            try {
                const res = await fetch(`/api/ftth/ont?username=${username}`, { headers: { 'Authorization': authToken } }); if (res.ok) { const ontData = await res.json(); if (ontData?.model?.rxPower !== undefined) { sub.rxPower = ontData.model.rxPower; updatePowerCellInTable(username, sub.rxPower); } } } catch (e) {} })); } }  function updatePowerCellInTable(username, powerValue) { const el = document.getElementById(`power-${username}`);
    if (el) {
        el.innerText = `${powerValue} dBm`; el.className = 'font-mono font-bold text-cyan-500 dir-ltr text-sm animate-pulse'; setTimeout(() => el.classList.remove('animate-pulse'), 1000); } }  function updateGlobalStats(items) { let total = items.length; let active = 0; let online = 0; let offline = 0; let expiringCount = 0;  const now = new Date(); items.forEach(sub => { const statusVal = extractValue(sub.status); const isActive = sub.isActive \vert{}\vert{} statusVal.toLowerCase() === 'active' \vert{}\vert{} statusVal === 'فعال';  if (isActive) active++;  const isOnline = Boolean(sub.hasActiveSession); if (isOnline) online++; else offline++;  const expDate = new Date(sub.expires \vert{}\vert{} sub.expirationDate); const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)); if (diffDays >= 0 && diffDays <= 7) expiringCount++; });  document.getElementById('stat-total').innerText = total; document.getElementById('stat-active').innerText = active; document.getElementById('stat-online').innerText = online; document.getElementById('stat-offline').innerText = offline; document.getElementById('stat-expiring').innerText = expiringCount; }  function filterOnlineStatus(mode) { if (mode === 'online') { renderTableRows(cachedSubscribers.filter(s => Boolean(s.hasActiveSession))); showToast("عرض المشتركين المتصلين الآن"); } else if (mode === 'offline') { renderTableRows(cachedSubscribers.filter(s => !Boolean(s.hasActiveSession))); showToast("عرض المشتركين غير المتصلين"); } else { renderTableRows(cachedSubscribers); showToast("عرض جميع المشتركين"); } }  function filterExpiringSoon() { const now = new Date(); const filtered = cachedSubscribers.filter(sub => { const diffDays = Math.ceil((new Date(sub.expires \vert{}\vert{} sub.expirationDate) - now) / (1000 * 60 * 60 * 24)); return diffDays >= 0 && diffDays <= 7; }); renderTableRows(filtered); showToast(`عرض المشتركين الذين تنتهي اشتراكاتهم خلال 7 أيام (${filtered.length})`);
}

function filterByActivationDate() {
    const val = document.getElementById('filter-activation-date').value;
    if (!val) {
        renderTableRows(cachedSubscribers);
        return;
    }
    const filtered = cachedSubscribers.filter(sub => {
        const started = sub.startedAt || sub.createdAt || sub.activationDate || '';
        return started.startsWith(val);
    });
    renderTableRows(filtered);
    showToast(`تصفية التفعيل بتاريخ: ${val}`); }  function clearDateFilter() { document.getElementById('filter-activation-date').value = ''; renderTableRows(cachedSubscribers); showToast("عرض كافة المشتركين"); }  function renderTableRows(items) { displayedSubscribers = items; const tbody = document.getElementById('subscribers-table-body'); const badge = document.getElementById('subscribers-count-badge');  if (badge) badge.innerText = `العدد: ${items.length}`;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-bold">لا توجد نتائج مطابقة للبحث أو التصفية</td></tr>`;
        return;
    }

    items.forEach(sub => {
        const realCustomerName = extractValue(sub.customer) || extractValue(sub.subscriber) || 'غير محدد';
        const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';
        const statusVal = extractValue(sub.status);
        const isActive = sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال';
        const isOnline = Boolean(sub.hasActiveSession);
        const planType = getSubscriptionType(sub);
        
        const customerId = sub.customerId || sub.accountId || (typeof sub.customer === 'object' ? sub.customer.id : '') || sub.id;
        
        const hasPower = sub.rxPower !== undefined && sub.rxPower !== null;
        const rxPowerText = hasPower ? `${sub.rxPower} dBm` : 'جاري الفحص...';
        const powerClass = hasPower ? 'text-cyan-500 font-bold' : 'text-slate-400 text-xs italic animate-pulse';

        const powerDisplay = `<span id="power-${username}" class="font-mono dir-ltr text-sm ${powerClass}">${rxPowerText}</span>`;

        tbody.innerHTML += `
            <tr onclick="openSubscriberDetailPage('${username}', '${customerId}')" class="hover:bg-slate-100 dark:hover:bg-slate-800/60 transition cursor-pointer">
                <td class="p-4" onclick="event.stopPropagation()"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-4">
                    <span class="font-bold text-indigo-600 dark:text-indigo-400 block text-sm">${realCustomerName}</span>
                    <span class="text-xs text-slate-500 font-mono font-semibold">${username}</span>
                </td>
                <td class="p-4">${powerDisplay}</td>
                <td class="p-4">
                    <span class="px-3 py-1 rounded-lg text-xs font-bold ${isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}">
                        ${isActive ? 'فعال' : 'منتهي'}
                    </span>
                </td>
                <td class="p-4">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold ${isOnline ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}">
                        ${isOnline ? 'متصل' : 'غير متصل'}
                    </span>
                </td>
                <td class="p-4 font-bold text-slate-700 dark:text-slate-200 text-sm">${planType}</td>
            </tr>
        `;
    });
}

function debouncedFilterSubscribers() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const query = document.getElementById('search-input').value.trim().toLowerCase();
        if (!query) {
            renderTableRows(cachedSubscribers);
            return;
        }
        const filtered = cachedSubscribers.filter(sub => {
            const realCustomerName = extractValue(sub.customer).toLowerCase();
            const username = cleanUsername(sub.username || sub.id).toLowerCase();
            return realCustomerName.includes(query) || username.includes(query);
        });
        renderTableRows(filtered);
    }, 150);
}

let sortNameAsc = true;
function sortSubscribersByName() {
    sortNameAsc = !sortNameAsc;
    displayedSubscribers.sort((a, b) => {
        const nameA = (extractValue(a.customer) || '').toLowerCase();
        const nameB = (extractValue(b.customer) || '').toLowerCase();
        return sortNameAsc ? nameA.localeCompare(nameB, 'ar') : nameB.localeCompare(nameA, 'ar');
    });
    renderTableRows(displayedSubscribers);
}

let sortPowerDesc = true;
function sortSubscribersByPower() {
    sortPowerDesc = !sortPowerDesc;
    displayedSubscribers.sort((a, b) => {
        const powerA = a.rxPower !== undefined && a.rxPower !== null ? Number(a.rxPower) : -999;
        const powerB = b.rxPower !== undefined && b.rxPower !== null ? Number(b.rxPower) : -999;
        return sortPowerDesc ? powerB - powerA : powerA - powerB;
    });
    renderTableRows(displayedSubscribers);
}

let sortOnlineAsc = true;
function sortSubscribersByOnlineStatus() {
    sortOnlineAsc = !sortOnlineAsc;
    displayedSubscribers.sort((a, b) => {
        const onlineA = Boolean(a.hasActiveSession) ? 1 : 0;
        const onlineB = Boolean(b.hasActiveSession) ? 1 : 0;
        return sortOnlineAsc ? onlineB - onlineA : onlineA - onlineB;
    });
    renderTableRows(displayedSubscribers);
}

let sortPlanAsc = true;
function sortSubscribersByPlanType() {
    sortPlanAsc = !sortPlanAsc;
    displayedSubscribers.sort((a, b) => {
        const planA = getSubscriptionType(a).toLowerCase();
        const planB = getSubscriptionType(b).toLowerCase();
        return sortPlanAsc ? planA.localeCompare(planB, 'ar') : planB.localeCompare(planA, 'ar');
    });
    renderTableRows(displayedSubscribers);
}

// تبديل حقول البطاقة الوطنية
function toggleIdFields(type) {
    const nationalDiv = document.getElementById('field-national-card');
    const oldIdDiv = document.getElementById('field-old-id');
    
    if (type === 'nationalCard') {
        nationalDiv.classList.remove('hidden');
        oldIdDiv.classList.add('hidden');
    } else {
        nationalDiv.classList.add('hidden');
        oldIdDiv.classList.remove('hidden');
    }
}

// إرسال العقد وتسجيل المشترك الجديد
async function submitNewSubscriberContract(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-contract');
    btn.innerText = 'جاري إرسال العقد...';
    btn.disabled = true;

    const fullname = document.getElementById('new-sub-fullname').value;
    const phone = document.getElementById('new-sub-phone').value;
    const pkg = document.getElementById('new-sub-package').value;
    const address = document.getElementById('new-sub-address').value;
    const idType = document.querySelector('input[name="idType"]:checked').value;
    const nationalId = document.getElementById('new-sub-national-id').value;

    const payload = {
        customerName: fullname,
        phoneNumber: phone,
        packageName: pkg,
        address: address,
        hasNationalCard: idType === 'nationalCard',
        nationalCardNumber: nationalId || null,
        isp: 'FTTH',
        representative: 'مركز وار لخدمات الإنترنت'
    };

    try {
        const res = await fetch('/api/ftth/contracts/submit', {
            method: 'POST',
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast("تم فتح العقد وتسجيل المشترك الجديد بنجاح!");
            document.getElementById('new-subscriber-form').reset();
            switchTab('subscribers', 'المشتركين');
            loadSubscribersFast();
        } else {
            const errData = await res.json();
            showToast(errData.error || "تعذر إرسال العقد", "error");
        }
    } catch (err) {
        showToast("حدث خطأ في الاتصال بالمنظومة", "error");
    } finally {
        btn.innerText = '📝 إرسال العقد وتسجيل المشترك';
        btn.disabled = false;
    }
}

async function openSubscriberDetailPage(targetUsername, customerId) {
    const sub = cachedSubscribers.find(s => cleanUsername(s.username || s.id) === targetUsername);
    if (!sub) return;

    const realCustomerName = extractValue(sub.customer) || 'غير محدد';
    const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';

    document.getElementById('detail-sub-name').innerText = realCustomerName;
    document.getElementById('detail-sub-user').innerText = username;

    const detailPage = document.getElementById('subscriber-detail-page');
    const container = document.getElementById('detail-content-card');
    
    container.innerHTML = `<p class="text-center text-slate-400 py-16 animate-pulse font-bold text-base">جاري جلب ملف العميل الشامل وبيانات ال
