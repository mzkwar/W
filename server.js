// جلب النطاقات (Zones) المتاحة للمشتركين
app.get('/api/ftth/zones', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/locations/zones', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب النطاقات" });
    }
});

// جلب الباقات والخطط المتاحة (Plans & Bundles)
app.get('/api/ftth/bundles', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/plans/bundles?includePrices=true', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب الباقات" });
    }
});

// جلب خيارات التنصيب
app.get('/api/ftth/installation-options', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.get('https://admin.ftth.iq/api/requests/customer-onboarding/installation-options', {
            headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "تعذر جلب خيارات التنصيب" });
    }
});

// إرسال عقد ومشترك جديد للموقع الأساسي
app.post('/api/ftth/contracts/submit', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "غير مصرح" });

    try {
        const response = await axios.post('https://admin.ftth.iq/api/contracts', req.body, {
            headers: { 
                'Authorization': token, 
                'Content-Type': 'application/json',
                'Accept': 'application/json' 
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("خطأ إرسال العقد:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            error: "فشل إرسال عقد المشترك للموقع الأصلي", 
            details: error.response?.data || error.message 
        });
    }
});
