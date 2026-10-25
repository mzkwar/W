const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("خطأ في قاعدة البيانات:", err.message);
    else console.log("تم الاتصال بقاعدة البيانات بنجاح.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS sub_agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS assigned_subscribers (
        subscriber_id TEXT PRIMARY KEY,
        sub_agent_id INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sub_agent_id) REFERENCES sub_agents(id) ON DELETE CASCADE
    )`);
});

app.post('/api/ftth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', 'earthlink-portals');
        params.append('username', username);
        params.append('password', password);

        const response = await axios.post('https://admin.ftth.iq/api/auth/Contractor/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("خطأ تسجيل الدخول:", error.response?.data || error.message);
        res.status(401).json({ message: "فشل تسجيل الدخول، تحقق من البيانات", error: error.response?.data || error.message });
    }
});

app.get('/api/ftth/subscriptions', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/subscriptions?hierarchyLevel=0', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: "تعذر جلب الاشتراكات" });
    }
});

app.get('/api/ftth/ont', async (req, res) => {
    const token = req.headers.authorization;
    const username = req.query.username;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get(`https://admin.ftth.iq/api/subscriptions/device/ont?username=${username}`, {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        try {
            const altResponse = await axios.get(`https://admin.ftth.iq/api/subscriptions/ont?username=${username}`, {
                headers: { 'Authorization': token, 'Accept': 'application/json' }
            });
            return res.json(altResponse.data);
        } catch (err) {
            res.json({ rxPower: null });
        }
    }
});

app.get('/api/ftth/customer/:id', async (req, res) => {
    const token = req.headers.authorization;
    const customerId = req.params.id;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const [custRes, subsRes] = await Promise.all([
            axios.get(`https://admin.ftth.iq/api/customers/${customerId}`, { headers: { 'Authorization': token, 'Accept': 'application/json' } }).catch(() => ({ data: {} })),
            axios.get(`https://admin.ftth.iq/api/customers/subscriptions?customerId=${customerId}`, { headers: { 'Authorization': token, 'Accept': 'application/json' } }).catch(() => ({ data: {} }))
        ]);

        res.json({
            customer: custRes.data.model || custRes.data,
            customerSubscriptions: subsRes.data.items || subsRes.data.model || []
        });
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب بيانات العميل" });
    }
});

app.get('/api/ftth/wallet/:partnerId', async (req, res) => {
    const token = req.headers.authorization;
    const partnerId = req.params.partnerId;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get(`https://admin.ftth.iq/api/partners/${partnerId}/wallets/balance`, {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب رصيد المحفظة" });
    }
});

app.get('/api/ftth/sessions', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/sessions?pageSize=50&pageNumber=1&sortCriteria.property=username&sortCriteria.direction=asc&status=1&hierarchyLevel=1', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب الجلسات" });
    }
});

app.get('/api/ftth/tickets', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/support/tickets?pageSize=12&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&hierarchyLevel=1&additionalFilter=ForMe', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب التذاكر" });
    }
});

app.get('/api/ftth/requests', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/requests?pageSize=10&pageNumber=1&sortCriteria.property=CreatedAt&sortCriteria.direction=desc&typeIds=28be9a02-1365-400b-9db4-003829eb962c&status=Open&additionalFilters=MyRequests', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب المهام" });
    }
});

app.post('/api/admin/sub-agents', (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: "جميع الحقول مطلوبة" });

    db.run(`INSERT INTO sub_agents (username, password, name) VALUES (?, ?, ?)`,
        [username, password, name],
        function(err) {
            if (err) return res.status(400).json({ error: "اسم المستخدم مستعمل بالفعل" });
            res.json({ id: this.lastID, username, name });
        }
    );
});

app.get('/api/admin/sub-agents', (req, res) => {
    const query = `
        SELECT sa.id, sa.username, sa.name, sa.created_at, COUNT(sub.subscriber_id) as subscriber_count
        FROM sub_agents sa
        LEFT JOIN assigned_subscribers sub ON sa.id = sub.sub_agent_id
        GROUP BY sa.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/assign', (req, res) => {
    const { subscriberIds, subAgentId } = req.body;
    if (!subscriberIds || !subAgentId) return res.status(400).json({ error: "بيانات ناقصة" });

    const stmt = db.prepare(`INSERT OR REPLACE INTO assigned_subscribers (subscriber_id, sub_agent_id) VALUES (?, ?)`);
    subscriberIds.forEach(id => stmt.run(id, subAgentId));
    stmt.finalize();

    res.json({ message: `تم تحويل ${subscriberIds.length} مشترك بنجاح` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على Port ${PORT}`));
