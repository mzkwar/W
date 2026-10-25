let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];
let displayedSubscribers = [];
let subscribersPowerCache = {};

window.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
    } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
    }

    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        
        try {
            await Promise.allSettled([
                loadSubscribersFast(),
                loadWalletBalance(),
                loadSessions(),
                loadAgents(),
                loadTickets(),
                loadRequestsTasks()
            ]);
        } catch (e) {
            console.error("Initialization warning:", e);
        } finally {
            const loader = document.getElementById('global-loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 300);
            }
        }
    } else {
        const loader = document.getElementById('global-loader');
        if (loader) loader.remove();
    }
});

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-xs font-bold text-white transition-all duration-300 transform translate-y-[-20px] opacity-0 ${type === 'error' ? 'bg-rose-600 border border-rose-500' : 'bg-indigo-600 border border-indigo-500'}`;
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
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
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
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    document.getElementById(`btn-${tabName}`).classList.add('text-indigo-600', 'dark:text-indigo-400', 'font-bold');
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
    let typeVal = sub.self ? extractValue(sub.self) : '';
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
            badge.innerText = `الرصيد: ${Number(balance).toLocaleString()} دينار`;
        } else {
            badge.innerText = `الرصيد: متاح`;
        }
    } catch (e) {
        badge.innerText = `الرصيد: --`;
    }
}

async function loadSessions() {
    try {
        await fetch('/api/ftth/sessions', { headers: { 'Authorization': authToken } });
    } catch (e) { console.error(e); }
}

async function loadSubscribersFast() {
    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const subData = await res.json();
        cachedSubscribers = Array.isArray(subData) ? subData : (subData.items || subData.subscribers || subData.data || []);
        
        updateGlobalStats(cachedSubscribers);
        renderTableRows(cachedSubscribers);
    } catch (err) {
        console.error(err);
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
        if (sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال') active++;
        if (Boolean(sub.hasActiveSession)) {
            online++;
        } else {
            offline++;
        }

        const expDate = new Date(sub.expires || sub.expirationDate);
        const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) expiringCount++;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-online').innerText = online;
    document.getElementById('stat-offline').innerText = offline;
    document.getElementById('stat-active').innerText = active;
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
    showToast(`تم الفرز حسب تاريخ التفعيل: ${val} (${filtered.length} مشترك)`);
}

function renderTableRows(items) {
    displayedSubscribers = items;
    const tbody = document.getElementById('subscribers-table-body');
    const countBadge = document.getElementById('subscribers-count-badge');
    if (countBadge) countBadge.innerText = `العدد: ${items.length}`;

    if (!tbody) return;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">لا توجد نتائج مطابقة</td></tr>`;
        return;
    }

    items.forEach(sub => {
        const realCustomerName = extractValue(sub.customer) || extractValue(sub.subscriber) || 'غير محدد';
        const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';
        const isActive = sub.isActive || extractValue(sub.status).toLowerCase() === 'active';
        const isOnline = Boolean(sub.hasActiveSession);
        const planType = getSubscriptionType(sub);
        const customerId = sub.customerId || sub.accountId || (typeof sub.customer === 'object' ? sub.customer.id : '') || sub.id;

        const powerDisplay = `<span class="font-mono font-bold text-slate-400 dir-ltr">0 dBm</span>`;

        tbody.innerHTML += `
            <tr onclick="openSubscriberDetailPage('${username}', '${customerId}')" class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition cursor-pointer">
                <td class="p-3" onclick="event.stopPropagation()"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <span class="font-bold text-indigo-600 dark:text-indigo-400 block">${realCustomerName}</span>
                    <span class="text-[10px] text-slate-500 font-mono">${username}</span>
                </td>
                <td class="p-3">${powerDisplay}</td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}">
                        ${isActive ? 'فعال' : 'منتهي'}
                    </span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] ${isOnline ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}">
                        ${isOnline ? 'متصل' : 'غير متصل'}
                    </span>
                </td>
                <td class="p-3 font-semibold">${planType}</td>
            </tr>
        `;
    });
}

function filterSubscribers() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (!query) {
        renderTableRows(cachedSubscribers);
        return;
    }
    const filtered = cachedSubscribers.filter(sub => extractValue(sub.customer).toLowerCase().includes(query) || cleanUsername(sub.username || sub.id).toLowerCase().includes(query));
    renderTableRows(filtered);
}

let sortNameAsc = true;
function sortSubscribersByName() {
    sortNameAsc = !sortNameAsc;
    displayedSubscribers.sort((a, b) => {
        const nameA = (extractValue(a.customer) || '').toLowerCase();
        const nameB = (extractValue(b.customer) || '').toLowerCase();
        if (nameA < nameB) return sortNameAsc ? -1 : 1;
        if (nameA > nameB) return sortNameAsc ? 1 : -1;
        return 0;
    });
    renderTableRows(displayedSubscribers);
    showToast(sortNameAsc ? "تم الترتيب تصاعدياً حسب الاسم" : "تم الترتيب تنازلياً حسب الاسم");
}

let sortPowerDesc = true;
function sortSubscribersByPower() {
    sortPowerDesc = !sortPowerDesc;
    showToast(sortPowerDesc ? "ترتيب حسب البور (تصاعدي)" : "ترتيب حسب البور (تنازلي)");
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
    
    container.innerHTML = `<p class="text-center text-slate-400 py-12 animate-pulse">جاري جلب ملف العميل الشامل وبيانات الـ ONT...</p>`;
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
    } catch (e) { console.error(e); }

    container.innerHTML = '';
    const customerSubs = customerData?.customerSubscriptions || [];
    const matchedSub = customerSubs.find(s => cleanUsername(s.deviceDetails?.username || s.username) === username) || sub;

    const custModel = customerData?.customer || {};
    const primaryContact = custModel.primaryContact || {};
    const addresses = custModel.addresses || [];
    const primaryAddress = addresses[0] || {};
    const gps = primaryAddress.gpsCoordinate || {};

    let phoneNum = primaryContact.mobile || primaryContact.secondaryPhone || custModel.phone || sub.phone || 'غير مسجل';
    let lat = gps.latitude || sub.latitude;
    let lng = gps.longitude || sub.longitude;
    let addressDisplay = primaryAddress.displayValue || 'العنوان غير متوفر';

    let personalLocationHtml = `
        <div class="bg-cardLight dark:bg-cardDark p-4 rounded-2xl border border-borderLight dark:border-slate-700 shadow-sm space-y-3 text-xs">
            <div class="text-amber-500 font-bold border-b border-borderLight dark:border-slate-700 pb-2">1. البيانات الشخصية والموقع الجغرافي</div>
            <div class="flex justify-between items-center"><span class="text-slate-500">رقم الهاتف:</span><a href="tel:${phoneNum}" class="text-emerald-500 font-bold dir-ltr">${phoneNum}</a></div>
            <div class="flex justify-between items-center"><span class="text-slate-500">العنوان:</span><span class="font-medium">${addressDisplay}</span></div>
    `;
    if (lat && lng) {
        personalLocationHtml += `
            <div class="flex justify-between items-center"><span class="text-slate-500">الإحداثيات:</span><span class="font-mono dir-ltr">${lat}, ${lng}</span></div>
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold mt-2">📍 فتح الموقع على خريطة جوجل (Google Maps)</a>
        `;
    } else {
        personalLocationHtml += `<div class="text-slate-400 text-center py-1">الإحداثيات الجغرافية غير متوفرة</div>`;
    }
    personalLocationHtml += `</div>`;
    container.innerHTML += personalLocationHtml;

    // استخراج بيانات الـ ONT وبقوة البور منontData.model.rxPower مباشرة بدقة
    const model = ontData?.model || ontData || {};
    let statusText = model.status?.displayValue || model.status || 'Up';
    
    let rawRxPower = ontData?.model?.rxPower ?? ontData?.rxPower ?? model.rxPower;
    let rxPowerVal = (rawRxPower !== null && rawRxPower !== undefined && !isNaN(Number(rawRxPower))) ? `${rawRxPower} dBm` : 'غير متوفرة';

    let serialNum = matchedSub.deviceDetails?.serial || model.serialNumber || model.sn || 'غير معروف';
    let fdtVal = extractValue(matchedSub.deviceDetails?.fdt) || 'غير متاح';
    let fatVal = extractValue(matchedSub.deviceDetails?.fat) || 'غير متاح';

    container.innerHTML += `
        <div class="bg-cardLight dark:bg-cardDark p-4 rounded-2xl border border-borderLight dark:border-slate-700 shadow-sm space-y-2 text-xs">
            <div class="text-indigo-600 dark:text-indigo-400 font-bold border-b border-borderLight dark:border-slate-700 pb-2">2. معلومات جهاز الـ ONT واختبار الإشارة</div>
            <div class="flex justify-between items-center"><span class="text-slate-500">الرقم التسلسلي (SN):</span><span class="font-bold font-mono dir-ltr">${serialNum}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-500">الحالة:</span><span class="font-bold text-emerald-500">${statusText}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-500">البور (Rx Power):</span><span class="font-bold font-mono text-indigo-500 dir-ltr">${rxPowerVal}</span></div>
            <div class="flex justify-between items-center pt-1 border-t border-borderLight dark:border-slate-700"><span class="text-slate-500">FDT / FAT:</span><span>${fdtVal} / ${fatVal}</span></div>
        </div>
    `;

    let sessionHtml = '';
    if (matchedSub.activeSession) {
        const session = matchedSub.activeSession;
        sessionHtml = `
            <div class="p-3 bg-blue-500/5 rounded-xl border border-blue-500/20 space-y-2 text-xs">
                <div class="text-blue-500 font-bold border-b border-blue-500/20 pb-1">تفاصيل جلسة الاتصال النشطة</div>
                <div class="flex justify-between items-center"><span class="text-slate-500">وقت البدء:</span><span>${formatDateClean(session.startedAt)}</span></div>
                <div class="flex justify-between items-center"><span class="text-slate-500">مدة الاتصال:</span><span class="font-semibold">${formatDuration(session.sessionTimeInSeconds)}</span></div>
                <div class="flex justify-between items-center"><span class="text-slate-500">عنوان IP:</span><span class="font-mono dir-ltr">${session.ipAddress || 'N/A'}</span></div>
            </div>
        `;
    }

    let baseInfoHtml = `<div class="bg-cardLight dark:bg-cardDark p-4 rounded-2xl border border-borderLight dark:border-slate-700 shadow-sm space-y-3 text-xs">
        <div class="text-cyan-600 dark:text-cyan-400 font-bold border-b border-borderLight dark:border-slate-700 pb-2">3. التفاصيل الأخرى للاشتراك</div>
        ${sessionHtml}`;

    const excludedFields = ['services', 'autoRenewPaymentMethod', 'bundleId', 'bundle', 'publicIpsCount', 'totalQuotaInBytes', 'lineOfBusiness', 'commitmentPeriod', 'activeSession', 'startedAt', 'phone', 'mobile', 'deviceDetails'];
    const keyLabels = { 'customer': 'اسم المشترك', 'username': 'اسم المستخدم', 'partner': 'الوكيل', 'status': 'حالة الاشتراك', 'expires': 'تاريخ الانتهاء', 'expirationDate': 'تاريخ الانتهاء', 'package': 'الباقة', 'self': 'نوع الإشتراك', 'salesType': 'نوع الإشتراك', 'autoRenew': 'التجديد التلقائي', 'hasActiveSession': 'حالة الاتصال' };

    for (const [key, value] of Object.entries(matchedSub)) {
        if (excludedFields.includes(key)) continue;
        let displayVal = extractValue(value);
        if (key === 'expires' || key === 'expirationDate') displayVal = formatDateClean(value);
        else if (key === 'status') displayVal = displayVal.toLowerCase() === 'active' || displayVal === 'فعال' ? 'فعال' : 'منتهي الصلاحية';
        else if (key === 'autoRenew') displayVal = value ? 'مفعل' : 'غير مفعل';
        else if (key === 'hasActiveSession') displayVal = value ? 'متصل' : 'غير متصل';
        else if (key === 'username') displayVal = cleanUsername(displayVal);

        baseInfoHtml += `
            <div class="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-borderLight dark:border-slate-800 text-xs">
                <span class="text-slate-500 font-medium">${keyLabels[key] || key}</span>
                <span class="font-semibold text-left dir-ltr break-all max-w-[200px]">${displayVal}</span>
            </div>
        `;
    }
    baseInfoHtml += `</div>`;
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
            if(list) list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">لا توجد وكلاء حالياً</p>`;
            if(select) select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>';
            return;
        }

        if(list) {
            list.innerHTML = agents.map(a => `
                <div class="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-borderLight dark:border-slate-800">
                    <div><p class="text-xs font-bold">${a.name}</p><p class="text-[10px] text-slate-500">${a.username}</p></div>
                    <span class="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full">${a.subscriber_count || 0} مشترك</span>
                </div>
            `).join('');
        }
        if(select) {
            select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>' + agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        }
    } catch (e) { console.error(e); }
}

async function loadTickets() {
    const list = document.getElementById('tickets-list');
    if (!list) return;
    list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 animate-pulse">جاري جلب تذاكر الدعم الفني...</p>`;
    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">لا توجد تذاكر دعم فني حالية</p>`;
            return;
        }
        list.innerHTML = items.map(t => `
            <div class="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-borderLight dark:border-slate-800 space-y-2 text-xs">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">تذكرة #${t.displayId || t.id} (${extractValue(t.self) || 'دعم'})</span>
                    <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500">${t.status || 'مفتوحة'}</span>
                </div>
                <p class="bg-cardLight dark:bg-cardDark p-2 rounded-lg">${t.summary || 'بدون تفاصيل'}</p>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">تعذر جلب التذاكر</p>`; }
}

async function loadRequestsTasks() {
    const list = document.getElementById('tasks-list');
    if (!list) return;
    list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 animate-pulse">جاري جلب المهام الفنية والطلبات...</p>`;
    try {
        const res = await fetch('/api/ftth/requests', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">لا توجد مهام أو طلبات تنصيب معلقة حالياً</p>`;
            return;
        }
        list.innerHTML = items.map(req => `
            <div class="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-borderLight dark:border-slate-800 space-y-2 text-xs">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-amber-500">طلب تنصيب (كود: ${req.installationCode || 'N/A'})</span>
                    <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">${extractValue(req.status) || 'In Progress'}</span>
                </div>
                <div class="bg-cardLight dark:bg-cardDark p-2 rounded-lg space-y-1">
                    <div>اسم المشترك: <strong class="text-indigo-500">${extractValue(req.customer) || 'غير معروف'}</strong></div>
                    <div>رقم الهاتف: <a href="tel:${req.customer?.contact?.mobile}" class="text-emerald-500 font-bold dir-ltr">${req.customer?.contact?.mobile || 'غير متوفر'}</a></div>
                </div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">تعذر جلب المهام الفنية</p>`; }
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
