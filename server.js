const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// إنشاء قاعدة البيانات المحلية
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error("خطأ في قاعدة البيانات:", err.message);
    else console.log("تم الاتصال بقاعدة البيانات المحلية بنجاح.");
});

// تهيئة الجداول
db.serialize(() => {
    // جدول الوكلاء الثانويين
    db.run(`CREATE TABLE IF NOT EXISTS sub_agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT
    )`);

    // جدول تخصيص المشتركين
    db.run(`CREATE TABLE IF NOT EXISTS assigned_subscribers (
        subscriber_id TEXT PRIMARY KEY,
        sub_agent_id INTEGER,
        FOREIGN KEY(sub_agent_id) REFERENCES sub_agents(id)
    )`);
});

// 1. تسجيل الدخول إلى admin.ftth.iq والحصول على Token
app.post('/api/ftth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const response = await axios.post('https://admin.ftth.iq/api/auth/Contractor/token', {
            username,
            password
        });
        res.json(response.data);
    } catch (error) {
        res.status(401).json({ message: "فشل تسجيل الدخول في admin.ftth.iq", error: error.message });
    }
});

// 2. جلب المشتركين من admin.ftth.iq باستعمال الـ Token
app.get('/api/ftth/subscribers', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        // الاتصال المباشر بالموقع الأساسي admin.ftth.iq
        const response = await axios.get('https://admin.ftth.iq/api/partners/dashboard/summary?hierarchyLevel=0', {
            headers: { 'Authorization': token }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب البيانات من اللوحة الأساسية" });
    }
});

// 3. إضافة وكيل ثانوي جديد
app.post('/api/admin/sub-agents', (req, res) => {
    const { username, password, name } = req.body;
    db.run(`INSERT INTO sub_agents (username, password, name) VALUES (?, ?, ?)`,
        [username, password, name],
        function(err) {
            if (err) return res.status(400).json({ error: "اسم المستخدم مستعمل بالفعل" });
            res.json({ id: this.lastID, username, name });
        }
    );
});

// 4. عرض كل الوكلاء الثانويين
app.get('/api/admin/sub-agents', (req, res) => {
    db.all(`SELECT id, username, name FROM sub_agents`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 5. تحويل/تخصيص مشتركين لوكيل ثانوي محدد
app.post('/api/admin/assign', (req, res) => {
    const { subscriberIds, subAgentId } = req.body;
    if (!subscriberIds || !subAgentId) return res.status(400).json({ error: "بيانات ناقصة" });

    const stmt = db.prepare(`INSERT OR REPLACE INTO assigned_subscribers (subscriber_id, sub_agent_id) VALUES (?, ?)`);
    subscriberIds.forEach(id => stmt.run(id, subAgentId));
    stmt.finalize();

    res.json({ message: `تم تحويل ${subscriberIds.length} مشترك بنجاح` });
});

// 6. تسجيل دخول الوكيل الثانوي
app.post('/api/subagent/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT id, name, username FROM sub_agents WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err || !row) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        res.json(row);
    });
});

// 7. جلب المشتركين المخصصين لوكيل ثانوي محدد
app.get('/api/subagent/my-subscribers/:subAgentId', (req, res) => {
    const { subAgentId } = req.params;
    db.all(`SELECT subscriber_id FROM assigned_subscribers WHERE sub_agent_id = ?`, [subAgentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.subscriber_id));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن على: http://localhost:${PORT}`);
});
