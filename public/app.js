let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];
let cachedExpiring = [];

window.addEventListener('DOMContentLoaded', async () => {
    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        
        await Promise.all([
            loadSubscribersFast(),
            loadExpiringSubscribers(),
            loadWalletBalance(),
            loadZones(),
            loadSessions(),
            loadAgents(),
            loadTickets()
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
    
    setTimeout(() => {
        toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function handleAuthError(res) {
    if (res.status === 401) {
        showToast("انتهت صلاحية الجلسة أو التوكن غير صالح، يرجى تسجيل الدخول مجدداً", "error");
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
    btn.innerText = 'جاري الاتصال وجلب البيانات...';
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
        btn.classList.remove('text-indigo-400', 'font-bold');
        btn.classList.add('text-slate-400');
    });
    document.getElementById(`btn-${tabName}`).classList.add('text-indigo-400', 'font-bold');
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
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const datePart = date.toISOString().split('T')[0];
        const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        let statusText = '';
        if (diffDays > 0) {
            statusText = `[ ينتهي بعد ${diffDays} يوم ]`;
        } else if (diffDays === 0) {
            statusText = `[ ينتهي اليوم ]`;
        } else {
            statusText = `[ منذ ${Math.abs(diffDays)} يوم ]`;
        }
        
        return `${datePart} ${timePart} ${statusText}`;
    } catch (e) {
        return isoString;
    }
}

// تحويل الثواني إلى صيغة وقت مقروءة
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

// تنسيق بيانات الـ ONT بدقة
function formatOntData(ontData) {
    if (!ontData) return '<p class="text-slate-400 text-xs">لا توجد معلومات ONT متاحة</p>';
    
    let statusText = 'نشط UP';
    if (ontData.status) {
        const rawStatus = extractValue(ontData.status).toUpperCase();
        if (rawStatus.includes('DOWN') || rawStatus === '1' || rawStatus === 'معطل') {
            statusText = 'غير نشط Down';
        } else if (rawStatus.includes('UP') || rawStatus === '0' || rawStatus === 'نشط') {
            statusText = 'نشط UP';
        } else {
            statusText = rawStatus;
        }
    }
    
    let rxPowerVal = ontData.rxPower !== undefined && ontData.rxPower !== null ? ontData.rxPower : 'غير متوفر';

    let html = `
        <div class="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800/50 space-y-2 text-xs">
            <div class="flex justify-between items-center">
                <span class="text-indigo-300 font-medium">الحالة:</span>
                <span class="font-bold ${statusText.includes('UP') ? 'text-emerald-400' : 'text-rose-400'}">${statusText}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-indigo-300 font-medium">البور (Rx Power):</span>
                <span class="font-bold text-white dir-ltr">${rxPowerVal} dBm</span>
            </div>
    `;

    for (const [k, v] of Object.entries(ontData)) {
        if (k !== 'status' && k !== 'rxPower' && typeof v !== 'object' && v !== null) {
            html += `
                <div class="flex justify-between items-center pt-1 border-t border-indigo-900/40">
                    <span class="text-slate-400">${k}:</span>
                    <span class="text-white dir-ltr">${v}</span>
                </div>
            `;
        }
    }
    html += `</div>`;
    return html;
}

// تنسيق جلسة الاتصال وتاريخ البدء
function formatSessionDetails(sub) {
    let startedHtml = sub.startedAt ? `<div class="p-2.5 bg-slate-800 rounded-xl border border-slate-700/60 flex justify-between items-center text-xs"><span class="text-slate-400">تاريخ البدء:</span><span class="text-white font-mono">${formatDateClean(sub.startedAt)}</span></div>` : '';
    
    if (!sub.activeSession) return startedHtml + `<p class="text-slate-400 text-xs">لا توجد جلسة اتصال نشطة حالياً</p>`;

    const session = sub.activeSession;
    return `
        ${startedHtml}
        <div class="p-3 bg-blue-950/30 rounded-xl border border-blue-800/40 space-y-2 text-xs">
            <div class="text-blue-400 font-bold border-b border-blue-900/50 pb-1">تفاصيل جلسة الاتصال النشطة</div>
            <div class="flex justify-between items-center"><span class="text-slate-400">وقت البدء:</span><span class="text-white">${formatDateClean(session.startedAt)}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-400">مدة الاتصال:</span><span class="text-white font-semibold">${formatDuration(session.sessionTimeInSeconds)}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-400">عنوان IP:</span><span class="text-white font-mono dir-ltr">${session.ipAddress || 'N/A'}</span></div>
            <div class="flex justify-between items-center"><span class="text-slate-400">عنوان MAC:</span><span class="text-white font-mono dir-ltr">${session.macAddress || 'N/A'}</span></div>
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
            let balance = 0;
            if (walletData.model && typeof walletData.model.balance === 'number') {
                balance = walletData.model.balance;
            } else if (typeof walletData.balance === 'number') {
                balance = walletData.balance;
            } else if (typeof walletData === 'number') {
                balance = walletData;
            }
            badge.innerText = `الرصيد: ${balance.toLocaleString()} دينار عراقي`;
        } else {
            badge.innerText = `الرصيد: متاح`;
        }
    } catch (e) {
        badge.innerText = `الرصيد: --`;
    }
}

async function loadZones() {
    try {
        const res = await fetch('/api/ftth/zones', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        if (res.ok) {
            const zonesData = await res.json();
            const zones = Array.isArray(zonesData) ? zonesData : (zonesData.items || zonesData.zones || zonesData.data || []);
            const selectZone = document.getElementById('select-zone-filter');
            if (selectZone && zones.length > 0) {
                selectZone.innerHTML = '<option value="">جميع المناطق (Zones)</option>' + zones.map(z => {
                    const zId = z.id || z.name || '';
                    const zName = z.name || z.title || z.id || 'منطقة غير محددة';
                    return `<option value="${zId}">${zName}</option>`;
                }).join('');
            }
        }
    } catch (e) {
        console.error("خطأ في جلب المناطق", e);
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
    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        const tbody = document.getElementById('subscribers-table-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

async function loadExpiringSubscribers() {
    try {
        const res = await fetch('/api/ftth/subscriptions/expiring', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        if (res.ok) {
            const data = await res.json();
            cachedExpiring = Array.isArray(data) ? data : (data.items || data.subscribers || data.data || []);
            const statExpiring = document.getElementById('stat-expiring');
            if (statExpiring) statExpiring.innerText = cachedExpiring.length;
        }
    } catch (e) {
        console.error("خطأ جلب الاشتراكات القريبة الانتهاء", e);
    }
}

function updateGlobalStats(items) {
    let total = items.length;
    let active = 0;
    let online = 0;
    let offline = 0;

    items.forEach(sub => {
        const statusVal = extractValue(sub.status);
        const isActive = sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال';

        if (isActive) active++;

        const isOnline = Boolean(sub.hasActiveSession);
        if (isOnline) online++;
        else offline++;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-online').innerText = online;
    document.getElementById('stat-offline').innerText = offline;
}

function filterOnlineStatus(mode) {
    if (mode === 'online') {
        const filtered = cachedSubscribers.filter(s => Boolean(s.hasActiveSession));
        renderTableRows(filtered);
        showToast("عرض المشتركين المتصلين الآن");
    } else if (mode === 'offline') {
        const filtered = cachedSubscribers.filter(s => !Boolean(s.hasActiveSession));
        renderTableRows(filtered);
        showToast("عرض المشتركين غير المتصلين");
    } else {
        renderTableRows(cachedSubscribers);
        showToast("عرض جميع المشتركين");
    }
}

function filterExpiringSoon() {
    if (cachedExpiring.length > 0) {
        renderTableRows(cachedExpiring);
        showToast("عرض المشتركين الذين تنتهي حساباتهم قريباً");
    } else {
        showToast("لا توجد حسابات تنتهي قريباً أو جاري التحديث", "error");
    }
}

function filterByZone() {
    const zoneId = document.getElementById('select-zone-filter').value;
    if (!zoneId) {
        renderTableRows(cachedSubscribers);
        return;
    }
    const filtered = cachedSubscribers.filter(sub => {
        const subZone = extractValue(sub.zoneId || sub.zone || '');
        return subZone.includes(zoneId);
    });
    renderTableRows(filtered);
}

function renderTableRows(items) {
    const tbody = document.getElementById('subscribers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">لا توجد نتائج مطابقة</td></tr>`;
        return;
    }

    items.forEach(sub => {
        const realCustomerName = extractValue(sub.customer) || extractValue(sub.subscriber) || 'غير محدد';
        const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';
        const statusVal = extractValue(sub.status);
        const isActive = sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال';
        const isOnline = Boolean(sub.hasActiveSession);
        const planType = getSubscriptionType(sub);
        const customerId = sub.customerId || sub.accountId || (typeof sub.customer === 'object' ? sub.customer.id : '') || '542203';

        tbody.innerHTML += `
            <tr onclick="openSubscriberDetailPage('${username}', '${customerId}')" class="hover:bg-slate-700/40 transition cursor-pointer">
                <td class="p-3" onclick="event.stopPropagation()"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <span class="font-bold text-indigo-400 block">${realCustomerName}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${username}</span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                        ${isActive ? 'فعال' : 'منتهي'}
                    </span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] ${isOnline ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-400'}">
                        ${isOnline ? 'متصل' : 'غير متصل'}
                    </span>
                </td>
                <td class="p-3 text-slate-300 font-semibold">${planType}</td>
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
    const filtered = cachedSubscribers.filter(sub => {
        const realCustomerName = extractValue(sub.customer).toLowerCase();
        const username = cleanUsername(sub.username || sub.id).toLowerCase();
        return realCustomerName.includes(query) || username.includes(query);
    });
    renderTableRows(filtered);
}

// عرض بيانات المشترك في صفحة منفصلة بالكامل مع الهاتف وإحداثيات الخريطة
async function openSubscriberDetailPage(targetUsername, customerId) {
    const sub = cachedSubscribers.find(s => cleanUsername(s.username || s.id) === targetUsername) || cachedExpiring.find(s => cleanUsername(s.username || s.id) === targetUsername);
    if (!sub) return;

    const realCustomerName = extractValue(sub.customer) || 'غير محدد';
    const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';

    document.getElementById('detail-sub-name').innerText = realCustomerName;
    document.getElementById('detail-sub-user').innerText = username;

    const detailPage = document.getElementById('subscriber-detail-page');
    const container = document.getElementById('detail-content-card');
    
    container.innerHTML = `<p class="text-center text-slate-400 py-12 animate-pulse">جاري جلب ملف العميل الشامل وبيانات الـ ONT...</p>`;
    detailPage.classList.remove('hidden');

    let customerDetails = null;
    let ontData = null;

    try {
        const [custRes, ontRes] = await Promise.all([
            fetch(`/api/ftth/customer/${customerId}`, { headers: { 'Authorization': authToken } }),
            fetch(`/api/ftth/ont?username=${username}`, { headers: { 'Authorization': authToken } })
        ]);

        if (custRes.ok) customerDetails = await custRes.json();
        if (ontRes.ok) ontData = await ontRes.json();
    } catch (e) {
        console.error("خطأ في جلب التفاصيل", e);
    }

    container.innerHTML = '';

    // جلسة الاتصال وتاريخ البدء
    container.innerHTML += formatSessionDetails(sub);

    // معلومات الـ ONT
    if (ontData) {
        container.innerHTML += `<div class="text-indigo-400 font-bold pt-3 pb-1 border-b border-slate-700">معلومات جهاز الـ ONT</div>`;
        container.innerHTML += formatOntData(ontData);
    }

    // استخراج الهاتف والإحداثيات إن وجدت في ملف العميل
    let phoneNum = customerDetails?.phone || customerDetails?.mobile || customerDetails?.phoneNumber || sub.phone || sub.mobile || 'غير متوفر';
    let lat = customerDetails?.latitude || customerDetails?.lat || sub.latitude;
    let lng = customerDetails?.longitude || customerDetails?.lng || sub.longitude;

    let contactMapHtml = `
        <div class="p-3 bg-slate-800 rounded-xl border border-slate-700/60 space-y-2 text-xs">
            <div class="text-amber-400 font-bold border-b border-slate-700 pb-1">معلومات الاتصال والموقع الجغرافي</div>
            <div class="flex justify-between items-center"><span class="text-slate-400">رقم الهاتف:</span><a href="tel:${phoneNum}" class="text-emerald-400 font-bold dir-ltr">${phoneNum}</a></div>
    `;
    if (lat && lng) {
        contactMapHtml += `
            <div class="flex justify-between items-center"><span class="text-slate-400">الإحداثيات:</span><span class="text-white font-mono dir-ltr">${lat}, ${lng}</span></div>
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold mt-2">فتح الموقع على خريطة جوجل (Google Maps)</a>
        `;
    } else {
        contactMapHtml += `<div class="text-slate-500 text-center py-1">الإحداثيات الجغرافية غير متوفرة لهذا المشترك</div>`;
    }
    contactMapHtml += `</div>`;
    container.innerHTML += contactMapHtml;

    const excludedFields = [
        'services', 'autoRenewPaymentMethod', 'bundleId', 'bundle', 
        'publicIpsCount', 'totalQuotaInBytes', 'lineOfBusiness', 
        '_isOnline', 'commitmentPeriod', 'activeSession', 'startedAt', 'phone', 'mobile'
    ];

    const keyLabels = {
        'customer': 'اسم المشترك',
        'username': 'اسم المستخدم',
        'partner': 'الوكيل',
        'zone': 'المنطقة',
        'status': 'حالة الاشتراك',
        'expires': 'تاريخ الانتهاء',
        'expirationDate': 'تاريخ الانتهاء',
        'package': 'الباقة',
        'self': 'نوع الإشتراك',
        'salesType': 'نوع الإشتراك',
        'autoRenew': 'التجديد التلقائي',
        'hasActiveSession': 'حالة الاتصال'
    };

    let baseInfoHtml = `<div class="space-y-2 pt-2"><div class="text-emerald-400 font-bold pb-1 border-b border-slate-700">بيانات الاشتراك الأساسية</div>`;
    for (const [key, value] of Object.entries(sub)) {
        if (excludedFields.includes(key)) continue;

        const labelName = keyLabels[key] || key;
        let displayVal = extractValue(value);

        if (key === 'expires' || key === 'expirationDate') {
            displayVal = formatDateClean(value);
        } else if (key === 'status') {
            displayVal = (displayVal.toLowerCase() === 'active' || displayVal === 'فعال') ? 'فعال' : 'منتهي الصلاحية';
        } else if (key === 'autoRenew') {
            displayVal = value ? 'مفعل' : 'غير مفعل';
        } else if (key === 'hasActiveSession') {
            displayVal = value ? 'متصل' : 'غير متصل';
        } else if (key === 'username') {
            displayVal = cleanUsername(displayVal);
        } else if (key === 'salesType' || key === 'package' || key === 'self') {
            displayVal = getSubscriptionType(sub);
        }

        baseInfoHtml += `
            <div class="flex justify-between items-center p-2.5 bg-slate-800 rounded-xl border border-slate-700/60 text-xs">
                <span class="text-slate-400 font-medium">${labelName}</span>
                <span class="text-white font-semibold text-left dir-ltr break-all max-w-[200px]">${displayVal}</span>
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
            if(list) list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد وكلاء حالياً</p>`;
            if(select) select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>';
            return;
        }

        if(list) {
            list.innerHTML = agents.map(a => `
                <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700">
                    <div><p class="text-xs font-bold text-white">${a.name}</p><p class="text-[10px] text-slate-400">${a.username}</p></div>
                    <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">${a.subscriber_count || 0} مشترك</span>
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

    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 animate-pulse">جاري جلب تذاكر الدعم الفني...</p>`;

    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const data = await res.json();
        const items = data.items || data.tickets || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد تذاكر دعم فني حالية</p>`;
            return;
        }

        list.innerHTML = items.map(t => {
            const ticketNum = t.ticketNumber || t.id || 'N/A';
            const title = t.title || t.subject || 'بدون عنوان';
            const status = t.status || 'مفتوحة';
            const customerName = extractValue(t.customer || t.creator || 'غير معروف');
            const dateStr = formatDateClean(t.createdAt);

            return `
                <div class="p-3.5 bg-slate-900 rounded-xl border border-slate-700/80 space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-indigo-400">تذكرة رقم #${ticketNum}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded ${status === 'Closed' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">${status}</span>
                    </div>
                    <p class="text-xs font-bold text-white">${title}</p>
                    <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                        <span>المرسل: ${customerName}</span>
                        <span>التاريخ: ${dateStr}</span>
                    </div>
                    <button onclick="alert('تفاصيل التذكرة رقم #${ticketNum}\\nالعنوان: ${title}\\nالحالة: ${status}\\nالتاريخ: ${dateStr}')" class="w-full mt-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 py-1.5 rounded-lg text-[11px] font-bold transition">عرض المزيد</button>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-rose-400 text-center py-4">تعذر جلب التذاكر</p>`;
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
