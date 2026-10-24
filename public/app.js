let authToken = '';

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.innerText = 'جاري الاتصال بـ admin.ftth.iq...';
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
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            loadSubscribers();
            loadAgents();
        } else {
            alert(data.message || "فشل تسجيل الدخول، تحقق من البيانات.");
        }
    } catch (err) {
        alert("حدث خطأ أثناء الاتصال بالمنظومة.");
    } finally {
        btn.innerText = 'دخول النظام';
        btn.disabled = false;
    }
});

async function loadSubscribers() {
    try {
        const res = await fetch('/api/ftth/subscribers', {
            headers: { 'Authorization': authToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('subscribers-table-body');
        
        tbody.innerHTML = '';

        let list = [];
        if (Array.isArray(data)) {
            list = data;
        } else if (data.subscribers) {
            list = data.subscribers;
        } else if (data.data) {
            list = data.data;
        }

        document.getElementById('stat-total').innerText = list.length || data.totalCount || data.activeCount || 0;
        document.getElementById('stat-active').innerText = data.activeCount || list.filter(i => i.isActive).length || 0;
        document.getElementById('stat-expired').innerText = data.expiredCount || list.filter(i => !i.isActive).length || 0;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-4 text-center text-slate-400">
                        تم الاتصال بنجاح بالمنظومة. (جاري جلب القائمة الحقيقية للمشتركين)
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach((sub, idx) => {
            const subId = sub.username || sub.id || `SUB-${1000 + idx}`;
            const isActive = sub.isActive !== undefined ? sub.isActive : true;
            const plan = sub.packageName || sub.planName || 'باقة FTTH الرئيسية';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-700/30 transition">
                    <td class="p-3"><input type="checkbox" class="sub-check rounded border-slate-700 bg-slate-900" value="${subId}"></td>
                    <td class="p-3 font-bold text-white">${subId}</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                            ${isActive ? 'فعال' : 'منتهي'}
                        </span>
                    </td>
                    <td class="p-3 text-slate-400">${plan}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("خطأ في جلب المشتركين:", error);
    }
}

async function loadAgents() {
    const res = await fetch('/api/admin/sub-agents');
    const agents = await res.json();
    const list = document.getElementById('agents-list');
    const select = document.getElementById('select-agent-assign');
    
    document.getElementById('stat-agents').innerText = agents.length;

    if (agents.length === 0) {
        list.innerHTML = `<p class="text-xs text-slate-500">لا يوجد وكلاء ثانويين حالياً</p>`;
    } else {
        list.innerHTML = agents.map(a => `
            <div class="flex justify-between items-center p-2.5 bg-slate-900 rounded-xl border border-slate-700/60">
                <div>
                    <p class="text-xs font-bold text-white">${a.name}</p>
                    <p class="text-[10px] text-slate-400">@${a.username}</p>
                </div>
                <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">
                    ${a.subscriber_count || 0} مشترك
                </span>
            </div>
        `).join('');
    }

    select.innerHTML = '<option value="">اختر الوكيل الثانوي...</option>' + 
        agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
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
    const data = await res.json();
    if (res.ok) {
        document.getElementById('add-agent-form').reset();
        loadAgents();
        alert("تم إنشاء الوكيل الثانوي بنجاح!");
    } else {
        alert(data.error || "فشل إنشاء الوكيل");
    }
});

document.getElementById('select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.sub-check').forEach(cb => cb.checked = e.target.checked);
});

async function assignSelected() {
    const agentId = document.getElementById('select-agent-assign').value;
    const selectedBoxes = document.querySelectorAll('.sub-check:checked');
    const subscriberIds = Array.from(selectedBoxes).map(cb => cb.value);

    if (!agentId) {
        alert("يرجى اختيار الوكيل الثانوي أولاً.");
        return;
    }
    if (subscriberIds.length === 0) {
        alert("يرجى تحديد مشترك واحد على الأقل من الجدول.");
        return;
    }

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
    location.reload();
}
