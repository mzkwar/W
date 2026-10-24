let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = [];

// تشغيل اللوحة مباشرة عند وجود الجلسة لسرعة فائقة
window.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        loadSubscribersFast();
        loadAgents();
        loadTickets();
    }
});

// تسجيل الدخول
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
        
        if (res.ok && data.access_token) {
            authToken = `Bearer ${data.access_token}`;
            localStorage.setItem('ftth_token', authToken);
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            loadSubscribersFast();
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

// جلب المشتركين
async function loadSubscribersFast() {
    const tbody = document.getElementById('subscribers-table-body');

    if (cachedSubscribers.length > 0) {
        renderTableRows(cachedSubscribers);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">جاري جلب المشتركين...</td></tr>`;

    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        
        cachedSubscribers = Array.isArray(data) ? data : (data.items || data.subscribers || data.data || []);
        
        // حساب وتحديث كروت الإحصائيات العلوية مرة واحدة فقط من البيانات الأصلية
        updateGlobalStats(cachedSubscribers);
        
        renderTableRows(cachedSubscribers);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

// حساب وتثبيت الإحصائيات الكلية للوحة العلوية
function updateGlobalStats(items) {
    let total = items.length;
    let active = 0;
    let expired = 0;

    items.forEach(sub => {
        const statusVal = typeof sub.status === 'object' ? (sub.status.displayValue || sub.status.id) : sub.status;
        const isActive = sub.isActive || statusVal === 'Active' || statusVal === 'فعال';
        if (isActive) active++;
        else expired++;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-expired').innerText = expired;
}

// رسم صفوف الجدول فقط دون المساس بالإحصائيات العلوية (لتسريع البحث)
function renderTableRows(items) {
    const tbody = document.getElementById('subscribers-table-body');
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">لا توجد نتائج متطابقة</td></tr>`;
        return;
    }

    items.forEach((sub, index) => {
        // استخراج اسم المشترك ومعرفه من الكائن الهيكلي {"id": "...", "displayValue": "..."}
        let username = 'N/A';
        let fullName = 'مشترك FTTH';

        if (typeof sub.subscriber === 'object' && sub.subscriber !== null) {
            username = sub.subscriber.id || username;
            fullName = sub.subscriber.displayValue || fullName;
        } else {
            username = sub.username || sub.id || username;
            fullName = sub.fullName || sub.name || sub.displayValue || fullName;
        }

        // استخراج الحالة والباقة
        const statusVal = typeof sub.status === 'object' ? (sub.status.displayValue || sub.status.id) : sub.status;
        const isActive = sub.isActive || statusVal === 'Active' || statusVal === 'فعال';
        const plan = typeof sub.package === 'object' ? (sub.package.displayValue || sub.package.id) : (sub.packageName || sub.planName || 'باقة الإنترنت');

        tbody.innerHTML += `
            <tr class="hover:bg-slate-700/30 transition">
                <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <a href="javascript:void(0)" onclick="openSubscriberCard(${index})" class="font-bold text-indigo-400 hover:underline block">${fullName}</a>
                    <span class="text-[10px] text-slate-400 font-mono">@${username}</span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                        ${isActive ? 'فعال' : 'منتهي'}
                    </span>
                </td>
                <td class="p-3 text-slate-300">${plan}</td>
            </tr>
        `;
    });
}

// البحث الفوري السريع من الذاكرة المحلية (دون إبطاء الموبايل أو تغيير الإحصائيات العلوية)
function filterSubscribers() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    if (!query) {
        renderTableRows(cachedSubscribers);
        return;
    }

    const filtered = cachedSubscribers.filter(sub => {
        let username = '';
        let fullName = '';

        if (typeof sub.subscriber === 'object' && sub.subscriber !== null) {
            username = (sub.subscriber.id || '').toLowerCase();
            fullName = (sub.subscriber.displayValue || '').toLowerCase();
        } else {
            username = (sub.username || sub.id || '').toLowerCase();
            fullName = (sub.fullName || sub.name || sub.displayValue || '').toLowerCase();
        }

        return username.includes(query) || fullName.includes(query);
    });

    renderTableRows(filtered);
}

// تحويل كائن المشترك إلى بطاقة تفاصيل مخصصة وأنيقة (Profile Card)
function openSubscriberCard(index) {
    const sub = cachedSubscribers[index];
    if (!sub) return;

    let username = 'N/A';
    let fullName = 'مشترك FTTH';

    if (typeof sub.subscriber === 'object' && sub.subscriber !== null) {
        username = sub.subscriber.id || username;
        fullName = sub.subscriber.displayValue || fullName;
    } else {
        username = sub.username || sub.id || username;
        fullName = sub.fullName || sub.name || sub.displayValue || fullName;
    }

    document.getElementById('modal-sub-name').innerText = fullName;
    document.getElementById('modal-sub-user').innerText = `@${username}`;

    const container = document.getElementById('modal-content-card');
    container.innerHTML = '';

    // معالجة وتنسيق كل حقل داخل بطاقة أنيقة
    for (const [key, value] of Object.entries(sub)) {
        let displayVal = '';
        
        if (typeof value === 'object' && value !== null) {
            displayVal = value.displayValue || value.name || value.title || value.id || JSON.stringify(value);
        } else {
            displayVal = value ?? 'غير متوفر';
        }

        container.innerHTML += `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700/60">
                <span class="text-slate-400 font-medium">${getArabicKeyName(key)}</span>
                <span class="text-white font-semibold text-left dir-ltr">${displayVal}</span>
            </div>
        `;
    }

    document.getElementById('subscriber-modal').classList.remove('hidden');
}

// ترجمة مفاتيح الـ API إلى أسماء عربية واضحة داخل البطاقة
function getArabicKeyName(key) {
    const map = {
        'id': 'معرف الاشتراك',
        'subscriber': 'بيانات المشترك',
        'status': 'حالة الاشتراك',
        'package': 'الباقة الحالية',
        'price': 'السعر',
        'startDate': 'تاريخ البداية',
        'expirationDate': 'تاريخ انتهاء الاشتراك',
        'createdDate': 'تاريخ الإنشاء',
        'phone': 'رقم الهاتف',
        'address': 'العنوان',
        'isOnline': 'حالة الاتصال'
    };
    return map[key] || key;
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
                <div><p class="text-xs font-bold text-white">${a.name}</p><p class="text-[10px] text-slate-400">@${a.username}</p></div>
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
