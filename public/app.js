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

// تسجيل الدخول والجلب المباشر
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

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            loadAgents();
            loadTickets();
        } else {
            alert(data.message || data.error || "فشل تسجيل الدخول");
        }
    } catch (err) {
        alert("حدث خطأ في الاتصال بالسيرفر");
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
    if (sub.salesType) {
        const st = extractValue(sub.salesType);
        if (st && st !== 'SELF') return st;
    }
    if (sub.services && Array.isArray(sub.services)) {
        for (let s of sub.services) {
            if (s.productType) {
                const pt = extractValue(s.productType);
                if (pt) return pt;
            }
        }
    }
    const pkg = extractValue(sub.package) || extractValue(sub.packageName);
    if (pkg) return pkg;
    return extractValue(sub.salesType) || 'SELF';
}

// جلب المشتركين والجلسات
async function loadSubscribersFast() {
    const tbody = document.getElementById('subscribers-table-body');

    if (cachedSubscribers.length > 0) {
        renderTableRows(cachedSubscribers);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">جاري جلب المشتركين وحالة الاتصال...</td></tr>`;

    try {
        const [subRes, onlineRes] = await Promise.all([
            fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } }),
            fetch('/api/ftth/sessions?filterBy=Online', { headers: { 'Authorization': authToken } })
        ]);

        if (subRes.status === 401 || onlineRes.status === 401) { logout(); return; }

        const subData = await subRes.json();
        const onlineData = await onlineRes.json();

        cachedSubscribers = Array.isArray(subData) ? subData : (subData.items || subData.subscribers || subData.data || []);
        
        const onlineItems = Array.isArray(onlineData) ? onlineData : (onlineData.items || onlineData.sessions || onlineData.data || []);
        const onlineUsernames = new Set();
        
        onlineItems.forEach(s => {
            const possibleUser = s.username || s.userName || s.subscriberUsername || s.user || s.id || 
                                (s.subscriber && (s.subscriber.id || s.subscriber.displayValue || s.subscriber.username));
            
            if (possibleUser) {
                const cleaned = cleanUsername(possibleUser).trim().toLowerCase();
                if (cleaned) onlineUsernames.add(cleaned);
            }
        });

        console.log("قائمة اليوزرات المتصلة من API الجلسات:", Array.from(onlineUsernames));

        cachedSubscribers = cachedSubscribers.map(sub => {
            const u1 = cleanUsername(sub.username).trim().toLowerCase();
            const u2 = cleanUsername(sub.id).trim().toLowerCase();
            const u3 = sub.subscriber ? cleanUsername(sub.subscriber.id || sub.subscriber.displayValue).trim().toLowerCase() : '';

            const isOnline = (u1 && onlineUsernames.has(u1)) || 
                             (u2 && onlineUsernames.has(u2)) || 
                             (u3 && onlineUsernames.has(u3)) || 
                             Boolean(sub.isOnline || sub.online);

            return { ...sub, _isOnline: isOnline };
        });

        updateGlobalStats(cachedSubscribers);
        renderTableRows(cachedSubscribers);
    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين أو الجلسات</td></tr>`;
    }
}

function updateGlobalStats(items) {
    let total = items.length;
    let active = 0;
    let expired = 0;
    let online = 0;
    let offline = 0;

    items.forEach(sub => {
        const statusVal = extractValue(sub.status);
        const isActive = sub.isActive || statusVal.toLowerCase() === 'active' || statusVal === 'فعال';

        if (isActive) active++;
        else expired++;

        if (sub._isOnline) online++;
        else offline++;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-expired').innerText = expired;
    document.getElementById('stat-online').innerText = online;
    document.getElementById('stat-offline').innerText = offline;
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
        const isOnline = sub._isOnline;
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

// عرض جميع البيانات والحقول الخام للـ المشترك بدون استثناء
function openSubscriberCardByUsername(targetUsername) {
    const sub = cachedSubscribers.find(s => cleanUsername(s.username || s.id) === targetUsername);
    if (!sub) return;

    const realCustomerName = extractValue(sub.customer) || 'غير محدد';
    const username = cleanUsername(sub.username) || cleanUsername(sub.id) || 'N/A';

    document.getElementById('modal-sub-name').innerText = realCustomerName;
    document.getElementById('modal-sub-user').innerText = username;

    const container = document.getElementById('modal-content-card');
    container.innerHTML = '';

    // قاموس التسميات العربية مع إمكانية عرض أي حقل آخر
    const keyLabels = {
        'customer': 'اسم المشترك',
        'username': 'اسم المستخدم',
        'partner': 'الوكيل',
        'zone': 'المنطقة',
        'status': 'حالة الاشتراك',
        'expires': 'تاريخ الانتهاء',
        'expirationDate': 'تاريخ الانتهاء',
        'package': 'الباقة',
        'salesType': 'نوع الاشتراك',
        'autoRenew': 'التجديد التلقائي',
        '_isOnline': 'حالة الاتصال (مفحوصة)'
    };

    // عرض كل مفاتيح وقيم الكائن بالكامل
    for (const [key, value] of Object.entries(sub)) {
        const labelName = keyLabels[key] || key;
        let displayVal = extractValue(value);

        if (typeof value === 'boolean') {
            displayVal = value ? 'true' : 'false';
        }

        container.innerHTML += `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700/60">
                <span class="text-slate-400 font-medium">${labelName}</span>
                <span class="text-white font-semibold text-left dir-ltr break-all max-w-[200px]">${displayVal}</span>
            </div>
        `;
    }

    document.getElementById('subscriber-modal').classList.remove('hidden');
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
        
        document.getElementById('stat-agents').innerText = agents.length;
        list.innerHTML = agents.map(a => `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700">
                <div><p class="text-xs font-bold text-white">${a.name}</p><p class="text-[10px] text-slate-400">${a.username}</p></div>
                <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">${a.subscriber_count || 0} مشترك</span>
            </div>
        `).join('');

        select.innerHTML = '<option value="">اختر وكيلاً ثانويًا...</option>' + agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    } catch (e) { console.error(e); }
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
        alert("تم إنشاء الوكيل الثانوي بنجاح!");
    } else {
        const err = await res.json();
        alert(err.error || "فشل إضافة الوكيل");
    }
});

document.getElementById('select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.sub-check').forEach(cb => cb.checked = e.target.checked);
});

async function assignSelected() {
    const agentId = document.getElementById('select-agent-assign').value;
    const selectedBoxes = document.querySelectorAll('.sub-check:checked');
    const subscriberIds = Array.from(selectedBoxes).map(cb => cb.value);

    if (!agentId || subscriberIds.length === 0) return alert("يرجى اختيار الوكيل وتحديد مشترك واحد على الأقل");

    const res = await fetch('/api/admin/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberIds, subAgentId: agentId })
    });
    const data = await res.json();
    alert(data.message);
    loadAgents();
}

function logout() {
    localStorage.removeItem('ftth_token');
    cachedSubscribers = [];
    location.reload();
}
