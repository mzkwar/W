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
        const response = await axios.get('https://admin.ftth.iq/api/subscriptions', {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        console.error("خطأ جلب الاشتراكات:", error.response?.data || error.message);
        res.status(500).json({ error: "تعذر جلب الاشتراكات من المنظومة الرئيسية" });
    }
});

// مسار جلب تفاصيل جهاز الـ ONT للمشترك
app.get('/api/ftth/ont', async (req, res) => {
    const token = req.headers.authorization;
    const username = req.query.username;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get(`https://admin.ftth.iq/api/subscriptions/device/ont?username=${username}`, {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب معلومات الـ ONT" });
    }
});

// مسار جلب المناطق
app.get('/api/ftth/zones', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/locations/zones', {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب المناطق" });
    }
});

// مسار جلب الباقات والخطط
app.get('/api/ftth/bundles', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/plans/bundles?includePrices=false', {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب الباقات" });
    }
});

app.get('/api/ftth/tickets', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/support/tickets?pageSize=12&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&hierarchyLevel=0&additionalFilter=ForMe', {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب التذاكر" });
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

app.post('/api/subagent/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT id, name, username FROM sub_agents WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err || !row) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        res.json(row);
    });
});

app.get('/api/subagent/my-subscribers/:subAgentId', (req, res) => {
    const { subAgentId } = req.params;
    db.all(`SELECT subscriber_id FROM assigned_subscribers WHERE sub_agent_id = ?`, [subAgentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.subscriber_id));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على Port ${PORT}`));
