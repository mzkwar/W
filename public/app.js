let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];

window.addEventListener('DOMContentLoaded', async () => {
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

// عرض معلومات الـ ONT بدقة متناهية
function formatOntData(ontData, subDeviceDetails) {
    const model = ontData?.model || ontData || {};
    let statusText = 'Up';
    if (model.status) {
        if (typeof model.status === 'object') {
            statusText = model.status.displayValue || model.status.name || 'Up';
        } else {
            statusText = String(model.status);
        }
    }
    
    let rxPowerVal = model.rxPower !== undefined && model.rxPower !== null ? model.rxPower : 'غير متوفرة';
    let serialNum = subDeviceDetails?.serial || model.serialNumber || model.sn || 'غير معروف';
    let fdtVal = extractValue(subDeviceDetails?.fdt) || 'غير متاح';
    let fatVal = extractValue(subDeviceDetails?.fat) || 'غير متاح';

    let html = `
        <div class="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800/50 space-y-2 text-xs">
            <div class="flex justify-between items-center">
                <span class="text-indigo-300 font-medium">الرقم التسلسلي (SN ONT):</span>
                <span class="font-bold text-white font-mono dir-ltr">${serialNum}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-indigo-300 font-medium">الحالة:</span>
                <span class="font-bold text-emerald-400">${statusText}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-indigo-300 font-medium">البور (Rx Power):</span>
                <span class="font-bold text-white dir-ltr">${rxPowerVal} dBm</span>
            </div>
            <div class="flex justify-between items-center pt-1 border-t border-indigo-900/40">
                <span class="text-slate-400">FDT / FAT:</span>
                <span class="text-white">${fdtVal} / ${fatVal}</span>
            </div>
        </div>
    `;
    return html;
}

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
        if (diffDays >= 0 && diffDays <= 7) {
            expiringCount++;
        }
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-online').innerText = online;
    document.getElementById('stat-offline').innerText = offline;
    document.getElementById('stat-expiring').innerText = expiringCount;
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
    const now = new Date();
    const filtered = cachedSubscribers.filter(sub => {
        const expDate = new Date(sub.expires || sub.expirationDate);
        const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
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
    showToast(`تم الفرز حسب تاريخ التفعيل: ${val}`);
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
        
        const customerId = sub.customerId || sub.accountId || (typeof sub.customer === 'object' ? sub.customer.id : '') || sub.id;

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

// عرض ملف العميل الشامل
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
    } catch (e) {
        console.error("خطأ في جلب التفاصيل", e);
    }

    container.innerHTML = '';

    const customerSubs = customerData?.customerSubscriptions || [];
    const matchedSub = customerSubs.find(s => cleanUsername(s.deviceDetails?.username || s.username) === username) || sub;

    container.innerHTML += formatSessionDetails(matchedSub);

    container.innerHTML += `<div class="text-indigo-400 font-bold pt-3 pb-1 border-b border-slate-700">معلومات جهاز الـ ONT واختبار الإشارة</div>`;
    container.innerHTML += formatOntData(ontData, matchedSub.deviceDetails);

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
        <div class="p-3 bg-slate-800 rounded-xl border border-slate-700/60 space-y-2 text-xs">
            <div class="text-amber-400 font-bold border-b border-slate-700 pb-1">معلومات الاتصال والموقع الجغرافي</div>
            <div class="flex justify-between items-center"><span class="text-slate-400">رقم الهاتف:</span><a href="tel:${phoneNum}" class="text-emerald-400 font-bold dir-ltr">${phoneNum}</a></div>
            <div class="flex justify-between items-center"><span class="text-slate-400">العنوان:</span><span class="text-white">${addressDisplay}</span></div>
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
        '_isOnline', 'commitmentPeriod', 'activeSession', 'startedAt', 'phone', 'mobile', 'deviceDetails'
    ];

    const keyLabels = {
        'customer': 'اسم المشترك',
        'username': 'اسم المستخدم',
        'partner': 'الوكيل',
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
    for (const [key, value] of Object.entries(matchedSub)) {
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
            displayVal = getSubscriptionType(matchedSub);
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

// دالة جلب وعرض تذاكر الدعم الفني بناءً على الهيكل الجديد
async function loadTickets() {
    const list = document.getElementById('tickets-list');
    if (!list) return;

    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 animate-pulse">جاري جلب تذاكر الدعم الفني...</p>`;

    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد تذاكر دعم فني حالية</p>`;
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
                <div class="p-3.5 bg-slate-900 rounded-xl border border-slate-700/80 space-y-2 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-indigo-400">تذكرة #${ticketDisplayId} (${subject})</span>
                        <span class="px-2 py-0.5 rounded ${status === 'Closed' || status === 'Resolved' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">${status}</span>
                    </div>
                    <p class="text-white bg-slate-800 p-2 rounded-lg">${summary}</p>
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800 gap-1">
                        <span>المشترك: <strong class="text-slate-300">${customerName}</strong> | النطاق: ${zoneName}</span>
                        <span>التاريخ: ${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-rose-400 text-center py-4">تعذر جلب التذاكر</p>`;
    }
}

// دالة جلب وعرض المهام والطلبات (Onboarding Requests) بناءً على الهيكل الجديد
async function loadRequestsTasks() {
    const list = document.getElementById('tasks-list');
    if (!list) return;

    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 animate-pulse">جاري جلب المهام الفنية والطلبات...</p>`;

    try {
        const res = await fetch('/api/ftth/requests', { headers: { 'Authorization': authToken } });
        if (handleAuthError(res)) return;

        const data = await res.json();
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد مهام أو طلبات تنصيب معلقة حالياً</p>`;
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
                <div class="p-3.5 bg-slate-900 rounded-xl border border-slate-700/80 space-y-2 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-amber-400">طلب تنصيب (كود: ${installCode})</span>
                        <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">${statusVal}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-800 p-2 rounded-lg text-slate-300">
                        <div>اسم المشترك: <strong class="text-white">${customerName}</strong></div>
                        <div>رقم الهاتف: <a href="tel:${mobile}" class="text-emerald-400 font-bold dir-ltr">${mobile}</a></div>
                        <div>النطاق (Zone): <span class="text-white">${zoneName}</span></div>
                    </div>
                    <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                        <span>تاريخ الإنشاء: ${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-xs text-rose-400 text-center py-4">تعذر جلب المهام الفنية</p>`;
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
