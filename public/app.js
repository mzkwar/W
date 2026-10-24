let authToken = localStorage.getItem('ftth_token') || '';

// التحقق الفوري من الجلسة المحفوظة عند فتح الموقع
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
            // حفظ التوكن في ذاكرة المتصفح
            localStorage.setItem('ftth_token', authToken);
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

// التنقل بين الأقسام
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

async function loadSubscribers() {
    const tbody = document.getElementById('subscribers-table-body');
    try {
        const res = await fetch('/api/ftth/tickets', { headers: { 'Authorization': authToken } });
        const data = await res.json();
        const items = data.items || [];
        
        tbody.innerHTML = '';
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">لا يوجد مشتركين أو تذاكر حالية</td></tr>`;
            return;
        }

        items.forEach(item => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-700/30">
                    <td class="p-3"><input type="checkbox" class="sub-check rounded" value="${item.id}"></td>
                    <td class="p-3 font-bold text-white">${item.ticketNumber || item.id}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">${item.status || 'نشط'}</span></td>
                    <td class="p-3 text-slate-400">${item.title || 'FTTH Plus'}</td>
                </tr>
            `;
        });
    } catch (err) { console.error(err); }
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
    }
});

async function assignSelected() {
    const agentId = document.getElementById('select-agent-assign').value;
    const selectedBoxes = document.querySelectorAll('.sub-check:checked');
    const subscriberIds = Array.from(selectedBoxes).map(cb => cb.value);

    if (!agentId || subscriberIds.length === 0) return alert("اختر الوكيل وتحدد مشترك واحد على الأقل");

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
