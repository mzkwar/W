let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];
let cachedSessions = [];
let currentFilterMode = 'all'; // all, online, offline

window.addEventListener('DOMContentLoaded', async () => {
    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        
        await Promise.all([
            loadSubscribersFast(),
            loadWalletBalance(),
            loadZones(),
            loadSessions(),
            loadAgents(),
            loadTickets()
        ]);

        // إخفاء شاشة التحميل الشاملة بكلاس سلس
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

// تنسيق التاريخ والوقت وحساب الأيام المتبقية
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
            statusText = `[ منتهي منذ ${Math.abs(diffDays)} يوم ]`;
        }
        
        return `${datePart} ${timePart} ${statusText}`;
    } catch (e) {
        return isoString;
    }
}

// تنسيق الرصيد البشري
async function loadWalletBalance() {
    const badge = document.getElementById('wallet-badge');
    if (!badge) return;

    try {
        const cleanToken = authToken.replace('Bearer ', '');
        const accountId = getAccountIdFromToken(cleanToken);

        const res = await fetch(`/api/ftth/wallet/${accountId}`, { headers: { 'Authorization': authToken } });
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
        if (res.ok) {
            const zonesData = await res.json();
            const zones = Array.isArray(zonesData) ? zonesData : (zonesData.items || zonesData.zones || []);
            const selectZone = document.getElementById('select-zone-filter');
            if (selectZone && zones.length > 0) {
                selectZone.innerHTML = '<option value="">جميع المناطق (Zones)</option>' + zones.map(z => `<option value="${z.id || z.name}">${z.name || z.title || z.id}</option>`).join('');
            }
        }
    } catch (e) {
        console.error("خطأ في جلب المناطق", e);
    }
}

async function loadSessions() {
    try {
        const res = await fetch('/api/ftth/sessions', { headers: { 'Authorization': authToken } });
        if (res.ok) {
            const sessionData = await res.json();
            cachedSessions = Array.isArray(sessionData) ? sessionData : (sessionData.items || sessionData.sessions || []);
        }
    } catch (e) {
        console.error("خطأ في جلب الجلسات", e);
    }
}

async function loadSubscribersFast() {
    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        
        if (res.status === 401) {
            showToast("انتهت صلاحية الجلسة، يرجى تسجيل الدخول", "error");
            return;
        }

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
    currentFilterMode = mode;
    if (mode === 'online') {
        const filtered = cachedSubscribers.filter(s => Boolean(s.hasActiveSession));
        renderTableRows(filtered);
        showToast("تم تصفية المشتركين المتصلين حالياً");
    } else if (mode === 'offline') {
        const filtered = cachedSubscribers.filter(s => !Boolean(s.hasActiveSession));
        renderTableRows(filtered);
        showToast("تم تصفية المشتركين غير المتصلين بالاعتماد على الجلسات");
    } else {
        renderTableRows(cachedSubscribers);
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
            <tr class="hover:bg-slate-700/30 transition">
                <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <a href="javascript:void(0)" onclick="openSubscriberCard('${username}', '${customerId}')" class="font-bold text-indigo-400 hover:underline block">${realCustomerName}</a>
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

async function openSubscriberCard(targetUsername, customerId) {
    const sub = cachedSubscribers.find(s => cleanUsername(s.username || s.id) === targetUsername);
    if (!sub) return;

    const realCustomerName = extractValue(sub.customer) || 'غير محدد';
    const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';

    document.getElementById('modal-sub-name').innerText = realCustomerName;
    document.getElementById('modal-sub-user').innerText = username;

    const container = document.getElementById('modal-content-card');
    container.innerHTML = `<p class="text-center text-slate-400 py-4 animate-pulse">جاري جلب ملف العميل الشامل وبيانات الـ ONT...</p>`;
    document.getElementById('subscriber-modal').classList.remove('hidden');

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

    const excludedFields = [
        'services', 'autoRenewPaymentMethod', 'bundleId', 'bundle', 
        'publicIpsCount', 'totalQuotaInBytes', 'lineOfBusiness', 
        '_isOnline', 'commitmentPeriod'
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

        container.innerHTML += `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700/60">
                <span class="text-slate-400 font-medium">${labelName}</span>
                <span class="text-white font-semibold text-left dir-ltr break-all max-w-[200px]">${displayVal}</span>
            </div>
        `;
    }

    if (customerDetails) {
        container.innerHTML += `<div class="text-emerald-400 font-bold pt-2 border-t border-slate-700 text-center">معلومات ملف العميل الشامل</div>`;
        for (const [cKey, cVal] of Object.entries(customerDetails)) {
            if (typeof cVal !== 'object' && cVal !== null) {
                container.innerHTML += `
                    <div class="flex justify-between items-center p-2.5 bg-emerald-950/20 rounded-xl border border-emerald-800/40">
                        <span class="text-emerald-300 font-medium">العميل: ${cKey}</span>
                        <span class="text-white font-semibold text-left dir-ltr break-all max-w-[200px]">${cVal}</span>
                    </div>
                `;
            }
        }
    }

    if (ontData) {
        container.innerHTML += `<div class="text-indigo-400 font-bold pt-2 border-t border-slate-700 text-center">معلومات جهاز الـ ONT</div>`;
        for (const [ontKey, ontVal] of Object.entries(ontData)) {
            container.innerHTML += `
                <div class="flex justify-between items-center p-2.5 bg-indigo-950/30 rounded-xl border border-indigo-800/40">
                    <span class="text-indigo-300 font-medium">ONT: ${ontKey}</span>
                    <span class="text-white font-semibold text-left dir-ltr break-all max-w-[200px]">${extractValue(ontVal)}</span>
                </div>
            `;
        }
    }
}

function closeModal() {
    document.getElementById('subscriber-modal').classList.add('hidden');
}

async function loadAgents() {
    try {
        const res = await fetch('/api/admin/sub-agents');
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
        const data = await res.json();
        const items = data.items || data.tickets || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد تذاكر دعم فني حالية</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <div class="p-3 bg-slate-900 rounded-xl border border-slate-700/80 space-y-1.5">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-indigo-400">تذكرة رقم #${t.ticketNumber || t.id}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded ${t.status === 'Closed' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">${t.status || 'مفتوحة'}</span>
                </div>
                <p class="text-xs font-bold text-white">${t.title || t.subject || 'بدون عنوان'}</p>
                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    <span>المرسل: ${extractValue(t.customer || t.creator || 'غير معروف')}</span>
                    <span>التاريخ: ${formatDateClean(t.createdAt)}</span>
                </div>
            </div>
        `).join('');
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
