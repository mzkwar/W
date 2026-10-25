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
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-xs font-extrabold text-white transition-all duration-300 transform translate-y-[-20px] opacity-0 ${type === 'error' ? 'bg-rose-600 border border-rose-500' : 'bg-indigo-600 border border-indigo-500'}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.remove('translate-y-[-20px]', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function handleAuthError(res) {
    if (res.status === 401) {
        showToast("انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول", "error");
        logout();
        return true;
    }
    return false;
}

function getAccountIdFromToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        return payload.AccountId || payload.sub || '16909';
    } catch (e) {
        return '16909';
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.innerText = 'جاري الاتصال...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/ftth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('ftth-email').value,
                password: document.getElementById('ftth-password').value
            })
        });
        const data = await res.json();
        const rawToken = data.access_token || data.token || data.accessToken;

        if (res.ok && rawToken) {
            authToken = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
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
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById('header-title').innerText = title;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-indigo-500', 'font-extrabold');
        btn.classList.add('text-slate-400');
    });
    const activeBtn = document.getElementById(`btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('text-indigo-500', 'font-extrabold');
}

function extractValue(field) {
    if (!field && field !== false && field !== 0) return '';
    if (typeof field === 'object') {
        return field.displayValue || field.name || field.title || field.id || JSON.stringify(field);
    }
    return String(field);
}

function cleanUsername(userStr) {
    const raw = extractValue(userStr);
    return raw.startsWith('@') ? raw.substring(1) : raw;
}

function getSubscriptionType(sub) {
    let typeVal = '';
    if (sub.self) {
        typeVal = extractValue(sub.self);
    }
    if ((!typeVal || typeVal.toUpperCase() === 'SELF') && sub.package) {
        typeVal = extractValue(sub.package);
    }
    return typeVal || 'SELF';
}

function formatDateClean(isoString) {
    if (!isoString) return 'غير محدد';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
        
        const datePart = date.toISOString().split('T')[0];
        const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        let statusText = diffDays > 0 ? `[ ينتهي بعد ${diffDays} يوم ]` : diffDays === 0 ? `[ ينتهي اليوم ]` : `[ منذ ${Math.abs(diffDays)} يوم ]`;
        return `${datePart} ${timePart} ${statusText}`;
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
    if (days > 0) res += `${days} يوم `;
    if (hours > 0) res += `${hours} ساعة `;
    if (minutes > 0) res += `${minutes} دقيقة`;
    return res.trim() || `${seconds} ثانية`;
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
                    <span class="font-extrabold text-sm">${fdtVal} / ${fatVal}</span>
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

        const res = await fetch(`/api/ftth/wallet/${accountId}`, { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        if (res.ok) {
            const walletData = await res.json();
            let balance = walletData.model?.balance ?? walletData.balance ?? walletData ?? 0;
            badge.innerText = `الرصيد: ${Number(balance).toLocaleString()} د.ع`;
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
        
        // جلب البور تلقائياً بالخلفية بدون تجميد الواجهة
        fetchPowerInBackround(cachedSubscribers);

    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        const tbody = document.getElementById('subscribers-table-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-500 font-bold">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

// دالة جلب البور بالخلفية وتحديث الخلية فور توفر البيانات
async function fetchPowerInBackround(subscribers) {
    // معالجة المشتركين على أجزاء لتجنب الضغط على السيرفر
    const batchSize = 5;
    for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);
        await Promise.all(batch.map(async (sub) => {
            if (sub.rxPower !== undefined) return; // تم الجلب سابقاً

            const username = cleanUsername(sub.username) || cleanUsername(sub.id);
            if (!username || username === 'N/A') return;

            try {
                const res = await fetch(`/api/ftth/ont?username=${username}`, { headers: { 'Authorization': authToken } });
                if (res.ok) {
                    const ontData = await res.json();
                    if (ontData?.model?.rxPower !== undefined) {
                        sub.rxPower = ontData.model.rxPower;
                        updatePowerCellInTable(username, sub.rxPower);
                    }
                }
            } catch (e) {
                // تظليل الخطأ بهدوء
            }
        }));
    }
}

// تحديث خلية البور للمشترك داخل الجدول مباشرة فور وصولها
function updatePowerCellInTable(username, powerValue) {
    const el = document.getElementById(`power-${username}`);
    if (el) {
        el.innerText = `${powerValue} dBm`;
        el.className = 'font-mono font-bold text-cyan-500 dir-ltr text-sm animate-pulse';
        setTimeout(() => el.classList.remove('animate-pulse'), 1000);
    }
}

function updateGlobalStats(items) {
    let total = items.length;
    let active = 0;
    let online = 0;
    let offline = 0;
    let expiringCount = 0;

    const now = new Date();
    items.forEach(sub => {
        const statusVal = extractValue(sub.status);
        const isActive = sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال';

        if (isActive) active++;

        const isOnline = Boolean(sub.hasActiveSession);
        if (isOnline) online++;
        else offline++;

        const expDate = new Date(sub.expires || sub.expirationDate);
        const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) expiringCount++;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-online').innerText = online;
    document.getElementById('stat-offline').innerText = offline;
    document.getElementById('stat-expiring').innerText = expiringCount;
}

function filterOnlineStatus(mode) {
    if (mode === 'online') {
        renderTableRows(cachedSubscribers.filter(s => Boolean(s.hasActiveSession)));
        showToast("عرض المشتركين المتصلين الآن");
    } else if (mode === 'offline') {
        renderTableRows(cachedSubscribers.filter(s => !Boolean(s.hasActiveSession)));
        showToast("عرض المشتركين غير المتصلين");
    } else {
        renderTableRows(cachedSubscribers);
        showToast("عرض جميع المشتركين");
    }
}

function filterExpiringSoon() {
    const now = new Date();
    const filtered = cachedSubscribers.filter(sub => {
        const diffDays = Math.ceil((new Date(sub.expires || sub.expirationDate) - now) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
    });
    renderTableRows(filtered);
    showToast(`عرض المشتركين الذين تنتهي اشتراكاتهم خلال 7 أيام (${filtered.length})`);
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
    showToast(`تصفية التفعيل بتاريخ: ${val}`);
}

function clearDateFilter() {
    document.getElementById('filter-activation-date').value = '';
    renderTableRows(cachedSubscribers);
    showToast("عرض كافة المشتركين");
}

function renderTableRows(items) {
    displayedSubscribers = items;
    const tbody = document.getElementById('subscribers-table-body');
    const badge = document.getElementById('subscribers-count-badge');
    
    if (badge) badge.innerText = `العدد المعروض: ${items.length}`;
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
        
        // البور يظهر مباشرة أو يُعرض بحالة "جاري الفحص..." وتحدث قيمته بالخلفية
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
    showToast(sortNameAsc ? "تم الترتيب تصاعدياً حسب الاسم" : "تم الترتيب تنازلياً حسب الاسم");
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
    showToast(sortPowerDesc ? "ترتيب حسب البور (الأعلى أولاً)" : "ترتيب حسب البور (الأدنى أولاً)");
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
    showToast(sortOnlineAsc ? "عرض المشتركين المتصلين في البداية" : "عرض المشتركين غير المتصلين في البداية");
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
    showToast("تم ترتيب المشتركين حسب نوع الباقة");
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
    
    container.innerHTML = `<p class="text-center text-slate-400 py-16 animate-pulse font-bold text-base">جاري جلب ملف العميل الشامل وبيانات الـ ONT...</p>`;
    detailPage.classList.remove('hidden');

    let customerData = null;
    let ontData = null;

    try {
        const [custRes, ontRes] = await Promise.all([
            fetch(`/api/ftth/customer/${customerId}`, { headers: { 'Authorization': authToken } }),
            fetch(`/api/ftth/ont?username=${username}`, { headers: { 'Authorization': authToken } })
        ]);

        if (custRes.ok) customerData = await custRes.json();
        if (ontRes.ok) ontData = await ontRes.json();
    } catch (e) {
        console.error("خطأ في جلب التفاصيل", e);
    }

    container.innerHTML = '';

    const customerSubs = customerData?.customerSubscriptions || [];
    const matchedSub = customerSubs.find(s => cleanUsername(s.deviceDetails?.username || s.username) === username) || sub;

    if (ontData?.model?.rxPower !== undefined) {
        sub.rxPower = ontData.model.rxPower;
        updatePowerCellInTable(username, sub.rxPower);
    }

    const custModel = customerData?.customer || {};
    const primaryContact = custModel.primaryContact || {};
    const addresses = custModel.addresses || [];
    const primaryAddress = addresses[0] || {};
    const gps = primaryAddress.gpsCoordinate || {};

    let phoneNum = primaryContact.mobile || primaryContact.secondaryPhone || custModel.phone || sub.phone || 'غير مسجل';
    let lat = gps.latitude || sub.latitude;
    let lng = gps.longitude || sub.longitude;
    let addressDisplay = primaryAddress.displayValue || 'العنوان غير متوفر';

    let contactMapHtml = `
        <div class="bg-cardLight dark:bg-cardDark p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 text-xs">
            <div class="text-amber-500 font-black border-b border-slate-200 dark:border-slate-700 pb-2 text-sm flex items-center gap-2">
                📍 1. البيانات الشخصية والموقع الجغرافي
            </div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">رقم الهاتف:</span><a href="tel:${phoneNum}" class="text-emerald-500 font-black text-sm dir-ltr">${phoneNum}</a></div>
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">العنوان:</span><span class="font-bold text-sm">${addressDisplay}</span></div>
    `;
    if (lat && lng) {
        contactMapHtml += `
            <div class="flex justify-between items-center"><span class="text-slate-500 dark:text-slate-400 font-bold">الإحداثيات:</span><span class="font-mono dir-ltr text-indigo-500 font-extrabold text-sm">${lat}, ${lng}</span></div>
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-extrabold mt-2 shadow transition text-xs">🗺️ فتح الموقع على خرائط جوجل (Google Maps)</a>
        `;
    } else {
        contactMapHtml += `<div class="text-slate-400 text-center py-1 font-bold">الإحداثيات الجغرافية غير متوفرة لهذا المشترك</div>`;
    }
    contactMapHtml += `</div>`;
    container.innerHTML += contactMapHtml;

    container.innerHTML += formatOntData(ontData, matchedSub.deviceDetails);
    container.innerHTML += formatSessionDetails(matchedSub);

    const excludedFields = [
        'services', 'autoRenewPaymentMethod', 'bundleId', 'bundle', 
        'publicIpsCount', 'totalQuotaInBytes', 'lineOfBusiness', 
        '_isOnline', 'commitmentPeriod', 'activeSession', 'startedAt', 'phone', 'mobile', 'deviceDetails'
    ];

    const keyLabels = {
        'customer': 'اسم المشترك',
        'username': 'اسم المستخدم',
        'partner': 'الوكيل المسؤول',
        'status': 'حالة الاشتراك',
        'expires': 'تاريخ الانتهاء',
        'expirationDate': 'تاريخ الانتهاء',
        'package': 'الباقة المفعلة',
        'self': 'نوع الإشتراك',
        'salesType': 'نوع الإشتراك',
        'autoRenew': 'التجديد التلقائي',
        'hasActiveSession': 'حالة الاتصال'
    };

    let baseInfoHtml = `
        <div class="bg-cardLight dark:bg-cardDark p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 text-xs">
            <div class="text-emerald-500 font-black border-b border-slate-200 dark:border-slate-700 pb-2 text-sm flex items-center gap-2">📄 4. بيانات الاشتراك الأساسية والخدمة</div>
            <div class="space-y-2">
    `;
    
    for (const [key, value] of Object.entries(matchedSub)) {
        if (excludedFields.includes(key)) continue;

        const labelName = keyLabels[key] || key;
        let displayVal = extractValue(value);

        if (key === 'expires' || key === 'expirationDate') displayVal = formatDateClean(value);
        else if (key === 'status') displayVal = (displayVal.toLowerCase() === 'active' || displayVal === 'فعال') ? 'فعال' : 'منتهي الصلاحية';
        else if (key === 'autoRenew') displayVal = value ? 'مفعل' : 'غير مفعل';
        else if (key === 'hasActiveSession') displayVal = value ? 'متصل' : 'غير متصل';
        else if (key === 'username') displayVal = cleanUsername(displayVal);
        else if (key === 'salesType' || key === 'package' || key === 'self') displayVal = getSubscriptionType(matchedSub);

        baseInfoHtml += `
            <div class="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <span class="text-slate-500 dark:text-slate-400 font-bold">${labelName}</span>
                <span class="font-extrabold text-left dir-ltr break-all max-w-[200px] text-sm">${displayVal}</span>
            </div>
        `;
    }
    baseInfoHtml += `</div></div>`;
    container.innerHTML += baseInfoHtml;
}

function closeSubscriberDetail() {
    document.getElementById('subscriber-detail-page').classList.add('hidden');
}

async function loadAgents() {
    try {
        const res = await fetch('/api/admin/sub-agents');
        if (handleAuthError(res)) return;

        const agents = await res.json();
        const list = document.getElementById('agents-list');
        const select = document.getElementById('select-agent-assign');
        
        if (!Array.isArray(agents) || agents.length === 0) {
            if(list) list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 font-bold">لا توجد وكلاء حالياً</p>`;
            if(select) select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>';
            return;
        }

        if(list) {
            list.innerHTML = agents.map(a => `
                <div class="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div><p class="text-xs font-black">${a.name}</p><p class="text-[10px] text-slate-500 font-mono">${a.username}</p></div>
                    <span class="text-xs bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full font-bold">${a.subscriber_count || 0} مشترك</span>
                </div>
            `).join('');
        }

        if(select) {
            select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>' + agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        }
    } catch (e) { 
        console.error("خطأ جلب الوكلاء:", e); 
    }
}

async function loadTickets() {
    const list = document.getElementById('tickets-list');
    if (!list) return;

    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 animate-pulse font-bold">جاري جلب تذاكر الدعم الفني...</p>`;

    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 font-bold">لا توجد تذاكر دعم فني حالية</p>`;
            return;
        }

        list.innerHTML = items.map(t => {
            const ticketDisplayId = t.displayId || t.id || 'N/A';
            const subject = extractValue(t.self) || 'تذكرة دعم فني';
            const summary = t.summary || 'بدون تفاصيل';
            const status = t.status || 'مفتوحة';
            const customerName = extractValue(t.customer) || 'غير معروف';
            const zoneName = extractValue(t.zone) || 'N/A';
            const dateStr = formatDateClean(t.createdAt);

            return `
                <div class="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-black text-indigo-500 text-sm">تذكرة #${ticketDisplayId} (${subject})</span>
                        <span class="px-3 py-1 rounded-lg font-bold ${status === 'Closed' || status === 'Resolved' ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}">${status}</span>
                    </div>
                    <p class="bg-cardLight dark:bg-cardDark p-3 rounded-lg font-bold">${summary}</p>
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800 gap-1 font-semibold">
                        <span>المشترك: <strong class="text-slate-700 dark:text-slate-300 font-extrabold">${customerName}</strong> | النطاق: ${zoneName}</span>
                        <span>التاريخ: ${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-rose-500 text-center py-4 font-bold">تعذر جلب التذاكر</p>`;
    }
}

async function loadRequestsTasks() {
    const list = document.getElementById('tasks-list');
    if (!list) return;

    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 animate-pulse font-bold">جاري جلب المهام الفنية والطلبات...</p>`;

    try {
        const res = await fetch('/api/ftth/requests', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 font-bold">لا توجد مهام أو طلبات تنصيب معلقة حالياً</p>`;
            return;
        }

        list.innerHTML = items.map(req => {
            const customerObj = req.customer || {};
            const customerName = extractValue(customerObj) || 'غير معروف';
            const mobile = customerObj.contact?.mobile || 'غير متوفر';
            const installCode = req.installationCode || 'N/A';
            const statusVal = extractValue(req.status) || 'In Progress';
            const zoneName = extractValue(req.zone) || 'N/A';
            const dateStr = formatDateClean(req.createdAt);

            return `
                <div class="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-black text-amber-500 text-sm">طلب تنصيب (كود: ${installCode})</span>
                        <span class="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 font-bold">${statusVal}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-cardLight dark:bg-cardDark p-3 rounded-lg font-bold">
                        <div>اسم المشترك: <strong class="text-indigo-500">${customerName}</strong></div>
                        <div>رقم الهاتف: <a href="tel:${mobile}" class="text-emerald-500 font-extrabold dir-ltr">${mobile}</a></div>
                        <div>النطاق (Zone): <span>${zoneName}</span></div>
                    </div>
                    <div class="flex justify-between items-center text-xs text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800 font-semibold">
                        <span>تاريخ الإنشاء: ${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-rose-500 text-center py-4 font-bold">تعذر جلب المهام الفنية</p>`;
    }
}

const addAgentForm = document.getElementById('add-agent-form');
if(addAgentForm) {
    addAgentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetch('/api/admin/sub-agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('agent-name').value,
                username: document.getElementById('agent-username').value,
                password: document.getElementById('agent-password').value
            })
        });
        if (res.ok) {
            addAgentForm.reset();
            loadAgents();
            showToast("تم إنشاء الوكيل الثانوي بنجاح!");
        } else {
            const err = await res.json();
            showToast(err.error || "فشل إضافة الوكيل", "error");
        }
    });
}

const selectAllCheckbox = document.getElementById('select-all');
if(selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.sub-check').forEach(cb => cb.checked = e.target.checked);
    });
}

async function assignSelected() {
    const agentId = document.getElementById('select-agent-assign').value;
    const selectedBoxes = document.querySelectorAll('.sub-check:checked');
    const subscriberIds = Array.from(selectedBoxes).map(cb => cb.value);

    if (!agentId || subscriberIds.length === 0) {
        showToast("يرجى اختيار الوكيل وتحديد مشترك واحد على الأقل", "error");
        return;
    }

    const res = await fetch('/api/admin/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberIds, subAgentId: agentId })
    });
    const data = await res.json();
    showToast(data.message);
    loadAgents();
}

function logout() {
    localStorage.removeItem('ftth_token');
    cachedSubscribers = [];
    location.reload();
}
