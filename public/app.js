let authToken = localStorage.getItem('ftth_token') || '';
let cachedSubscribers = []; // تخزين مؤقت لجلب البيانات فوراً بدون أي تأخير

// التحقق من الجلسة وإظهار اللوحة فوراً إن وجدت لتجنب الوميض
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

// التنقل بين الأقسام بدون أي إعادة تحميل
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

// جلب المشتركين بسرعة فائقة
async function loadSubscribersFast() {
    const tbody = document.getElementById('subscribers-table-body');

    // إذا كانت البيانات مخزنة مسبقاً، اعرضها فوراً بدون انتظار السيرفر
    if (cachedSubscribers.length > 0) {
        renderSubscribers(cachedSubscribers);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">جاري جلب المشتركين...</td></tr>`;

    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        cachedSubscribers = Array.isArray(data) ? data : (data.items || data.subscribers || data.data || []);
        renderSubscribers(cachedSubscribers);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

// عرض المشتركين وتحديث الإحصائيات الفعالة والمنتهية وحالة الاتصال
function renderSubscribers(items) {
    const tbody = document.getElementById('subscribers-table-body');
    tbody.innerHTML = '';

    let total = items.length;
    let active = 0;
    let expired = 0;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">لا توجد بيانات متاحة</td></tr>`;
        return;
    }

    items.forEach((sub, index) => {
        const username = sub.username || sub.id || 'N/A';
        const fullName = sub.fullName || sub.name || sub.subscriberName || username;
        const isActive = sub.isActive !== undefined ? sub.isActive : (sub.status === 'Active' || sub.status === 'فعال' || sub.state === 'Active');
        const isOnline = sub.isOnline || sub.online || sub.connectionStatus === 'Online' || sub.isConnected;
        const plan = sub.packageName || sub.planName || sub.package || 'باقة الإنترنت';

        if (isActive) active++;
        else expired++;

        tbody.innerHTML += `
            <tr class="hover:bg-slate-700/30 transition">
                <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${username}"></td>
                <td class="p-3">
                    <a href="javascript:void(0)" onclick="showSubscriberDetails(${index})" class="font-bold text-indigo-400 hover:underline block">${fullName}</a>
                    <span class="text-[10px] text-slate-400">@${username}</span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                        ${isActive ? 'فعال' : 'منتهي'}
                    </span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] ${isOnline ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700 text-slate-400'}">
                        ${isOnline ? 'متصل' : 'غير متصل'}
                    </span>
                </td>
                <td class="p-3 text-slate-400">${plan}</td>
            </tr>
        `;
    });

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-expired').innerText = expired;
}

// ميزة البحث الفوري باسم المشترك أو اليوزر
function filterSubscribers() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const filtered = cachedSubscribers.filter(sub => {
        const username = (sub.username || sub.id || '').toLowerCase();
        const fullName = (sub.fullName || sub.name || sub.subscriberName || '').toLowerCase();
        return username.includes(query) || fullName.includes(query);
    });
    renderSubscribers(filtered);
}

// عرض نافذة التفاصيل الكاملة عند الضغط على اسم المشترك
function showSubscriberDetails(index) {
    const sub = cachedSubscribers[index];
    if (!sub) return;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = '';

    // توليد قائمة بكل الحقول المتوفرة في بيانات المشترك الأصلية
    for (const [key, value] of Object.entries(sub)) {
        if (typeof value === 'object' && value !== null) {
            modalContent.innerHTML += `<div class="p-2 bg-slate-900 rounded-lg flex justify-between"><span class="text-slate-400">${key}:</span> <span class="text-right">${JSON.stringify(value)}</span></div>`;
        } else {
            modalContent.innerHTML += `<div class="p-2 bg-slate-900 rounded-lg flex justify-between"><span class="text-slate-400">${key}:</span> <span class="text-white font-medium text-right">${value ?? 'غير متوفر'}</span></div>`;
        }
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
