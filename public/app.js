let authToken = '';

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
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
        alert("فشل تسجيل الدخول، تحقق من البيانات.");
    }
});

async function loadSubscribers() {
    const res = await fetch('/api/ftth/subscribers', {
        headers: { 'Authorization': authToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('subscribers-table-body');
    
    // افتراض عرض البيانات الجاهزة من API المنظومة
    tbody.innerHTML = `
        <tr class="border-b">
            <td class="p-3"><input type="checkbox" class="sub-check" value="SUB-1001"></td>
            <td class="p-3 font-bold">SUB-1001</td>
            <td class="p-3 text-emerald-600">فعال</td>
            <td class="p-3">باقة FTTH Plus</td>
        </tr>
        <tr class="border-b">
            <td class="p-3"><input type="checkbox" class="sub-check" value="SUB-1002"></td>
            <td class="p-3 font-bold">SUB-1002</td>
            <td class="p-3 text-red-500">منتهي</td>
            <td class="p-3">باقة FTTH Standard</td>
        </tr>
    `;
}

async function loadAgents() {
    const res = await fetch('/api/admin/sub-agents');
    const agents = await res.json();
    const list = document.getElementById('agents-list');
    const select = document.getElementById('select-agent-assign');
    
    list.innerHTML = agents.map(a => `<li class="py-2">${a.name} (@${a.username})</li>`).join('');
    select.innerHTML = '<option value="">اختر وكيلاً لتحويل المشتركين إليه</option>' + 
        agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

document.getElementById('add-agent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/api/admin/sub-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: document.getElementById('agent-name').value,
            username: document.getElementById('agent-username').value,
            password: document.getElementById('agent-password').value
        })
    });
    document.getElementById('add-agent-form').reset();
    loadAgents();
});

async function assignSelected() {
    const agentId = document.getElementById('select-agent-assign').value;
    const selectedBoxes = document.querySelectorAll('.sub-check:checked');
    const subscriberIds = Array.from(selectedBoxes).map(cb => cb.value);

    if (!agentId || subscriberIds.length === 0) {
        alert("يرجى اختيار الوكيل وتحديد مشترك واحد على الأقل.");
        return;
    }

    const res = await fetch('/api/admin/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberIds, subAgentId: agentId })
    });
    const data = await res.json();
    alert(data.message);
}

function logout() {
    location.reload();
}
