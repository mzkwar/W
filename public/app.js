let authToken = localStorage.getItem('ftth_token') || '';

// التحقق التلقائي من الجلسة عند فتح التطبيق
window.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    }
});

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
        
        if (data.access_token) {
            authToken = `Bearer ${data.access_token}`;
            localStorage.setItem('ftth_token', authToken); // حفظ الجلسة
            showDashboard();
        } else {
            alert(data.message || "فشل تسجيل الدخول");
        }
    } catch (err) {
        alert("حدث خطأ في الاتصال بالسيرفر");
    } finally {
        btn.innerText = 'دخول النظام';
        btn.disabled = false;
    }
});

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    loadSummary();
    loadSubscribers();
    loadAgents();
    loadTickets();
}

// التبديل بين الأقسام
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

async function loadSummary() {
    try {
        const res = await fetch('/api/ftth/summary', { headers: { 'Authorization': authToken } });
        const data = await res.json();
        document.getElementById('stat-total').innerText = data.totalSubscribersCount || data.activeCount || 0;
        document.getElementById('stat-active').innerText = data.activeCount || 0;
        document.getElementById('stat-expired').innerText = data.expiredCount || 0;
    } catch (e) { console.error(e); }
}

// جلب المشتركين عبر /api/subscriptions
async function loadSubscribers() {
    const tbody = document.getElementById('subscribers-table-body');
    try {
        const res = await fetch('/api/ftth/subscriptions', { headers: { 'Authorization': authToken } });
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.subscribers || data.data || []);
        
        tbody.innerHTML = '';
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">لا توجد بيانات مشتركين متاحة</td></tr>`;
            return;
        }

        items.forEach(sub => {
            const subName = sub.fullName || sub.username || sub.name || sub.subscriberName || 'مشترك FTTH';
            const subId = sub.id || sub.username || 'N/A';
            const isActive = sub.isActive !== undefined ? sub.isActive : (sub.status === 'Active' || sub.status === 'فعال');
            const plan = sub.packageName || sub.planName || sub.package || 'باقة الإنترنت';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-700/30 transition">
                    <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${subId}"></td>
                    <td class="p-3 font-bold text-white">${subName} (${subId})</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                            ${isActive ? 'فعال' : 'منتهي'}
                        </span>
                    </td>
                    <td class="p-3 text-slate-400">${plan}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("خطأ في جلب المشتركين:", err);
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-400">فشل جلب بيانات المشتركين</td></tr>`;
    }
}

async function loadAgents() {
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
    location.reload();
}
