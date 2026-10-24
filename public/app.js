let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];

window.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        loadSubscribersFast();
        loadAgents();
        loadTickets();
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
        
        if (res.ok && data.access_token) {
            authToken = `Bearer ${data.access_token}`;
            localStorage.setItem('ftth_token', authToken);

            await loadSubscribersFast();
            loadAgents();
            loadTickets();

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            showToast("تم تسجيل الدخول بنجاح");
        } else {
            showToast(data.message || data.error || "فشل تسجيل الدخول", "error");
        }
    } catch (err) {
        showToast("حدث خطأ في الاتصال بالسيرفر", "error");
    } finally {
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

async function loadSubscribersFast() {
    const tbody = document.getElementById('subscribers-table-body');

    if (cachedSubscribers.length > 0) {
        renderTableRows(cachedSubscribers);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 animate-pulse">جاري جلب جميع المشتركين...</td></tr>`;

    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        
        if (res.status === 401) {
            showToast("انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً", "error");
            logout();
            return;
        }

        const subData = await res.json();
        cachedSubscribers = Array.isArray(subData) ? subData : (subData.items || subData.subscribers || subData.data || []);
        
        updateGlobalStats(cachedSubscribers);
        renderTableRows(cachedSubscribers);
    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين</td></tr>`;
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

    ['stat-total', 'stat-active', 'stat-online', 'stat-offline'].forEach(id => {
        document.getElementById(id).classList.remove('animate-pulse');
    });
}

function renderTableRows(items) {
    const tbody = document.getElementById('subscribers-table-body');
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

        tbody.innerHTML += `
            <tr class="hover:bg-slate-700/30 transition">
                <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <a href="javascript:void(0)" onclick="openSubscriberCardByUsername('${username}')" class="font-bold text-indigo-400 hover:underline block">${realCustomerName}</a>
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

async function openSubscriberCardByUsername(targetUsername) {
    const sub = cachedSubscribers.find(s => cleanUsername(s.username || s.id) === targetUsername);
    if (!sub) return;

    const realCustomerName = extractValue(sub.customer) || 'غير محدد';
    const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';

    document.getElementById('modal-sub-name').innerText = realCustomerName;
    document.getElementById('modal-sub-user').innerText = username;

    const container = document.getElementById('modal-content-card');
    container.innerHTML = `<p class="text-center text-slate-400 py-4 animate-pulse">جاري جلب تفاصيل الحساب وبيانات الـ ONT...</p>`;

    document.getElementById('subscriber-modal').classList.remove('hidden');

    let ontData = null;
    try {
        const ontRes = await fetch(`/api/ftth/ont?username=${username}`, { headers: { 'Authorization': authToken } });
        if (ontRes.ok) {
            ontData = await ontRes.json();
        }
    } catch (e) {
        console.error("تعذر جلب بيانات الـ ONT", e);
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

        if (key === 'status') {
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
        
        document.getElementById('stat-agents')?.innerText = agents.length || 0;
        
        if (!Array.isArray(agents) || agents.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد وكلاء حالياً</p>`;
            select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>';
            return;
        }

        list.innerHTML = agents.map(a => `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700">
                <div><p class="text-xs font-bold text-white">${a.name}</p><p class="text-[10px] text-slate-400">${a.username}</p></div>
                <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">${a.subscriber_count || 0} مشترك</span>
            </div>
        `).join('');

        select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>' + agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    } catch (e) { 
        console.error("خطأ جلب الوكلاء:", e); 
    }
}

async function loadTickets() {
    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        const data = await res.json();
        const list = document.getElementById('tickets-list');
        const items = data.items || [];

        if (items.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا توجد تذاكر حالية</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <div class="p-3 bg-slate-900 rounded-xl border border-slate-700">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-indigo-400">تذكرة #${t.ticketNumber || t.id}</span>
                    <span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">${t.status || 'مفتوحة'}</span>
                </div>
                <p class="text-xs text-slate-300">${t.title || 'لا يوجد عنوان'}</p>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

document.getElementById('add-agent-form').addEventListener('submit', async (e) => {
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
        document.getElementById('add-agent-form').reset();
        loadAgents();
        showToast("تم إنشاء الوكيل الثانوي بنجاح!");
    } else {
        const err = await res.json();
        showToast(err.error || "فشل إضافة الوكيل", "error");
    }
});

document.getElementById('select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.sub-check').forEach(cb => cb.checked = e.target.checked);
});

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
