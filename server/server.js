// ===========================================
// server.js - DADAXWEAR PREMIUM SERVER v36.0
// v36 NEW:
//   ✅ Admin Email+Password login system
//   ✅ POST /api/admin/login  — token return
//   ✅ POST /api/admin/logout — token invalidate
//   ✅ verifyAdminToken middleware — admin routes protect
//   ✅ Token 24h expiry
// .env: ADMIN_EMAIL + ADMIN_PASSWORD set korte hobe
// ===========================================

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dotenv   = require('dotenv');
const path     = require('path');
const multer   = require('multer');
const fs       = require('fs');
const crypto   = require('crypto');
const { ObjectId } = require('mongoose').Types;

dotenv.config();
const app         = express();
const projectRoot = path.join(__dirname, '..');

// =================================================
// ADMIN TOKEN SYSTEM
// .env: ADMIN_EMAIL + ADMIN_PASSWORD set korte hobe
// =================================================
const adminTokens = new Map(); // token -> expiry
const TOKEN_TTL   = 24 * 60 * 60 * 1000; // 24h

function generateAdminToken() {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, Date.now() + TOKEN_TTL);
    return token;
}

// Cleanup expired tokens every hour
setInterval(() => {
    const now = Date.now();
    for (const [t, exp] of adminTokens.entries()) {
        if (now > exp) adminTokens.delete(t);
    }
}, 60 * 60 * 1000);

// Middleware — all admin-only routes e use korbo
function verifyAdminToken(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || !adminTokens.has(token) || Date.now() > adminTokens.get(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
}

// ─── ১. CORS ───
const corsOptions = {
    origin: [
        'https://dadaxwear.com',
        'https://www.dadaxwear.com',
        'http://localhost:5001',
        'http://localhost:3000'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ২. Uploads folder setup ───
const uploadDir = path.join(projectRoot, 'uploads');
['profiles', 'logos', 'products'].forEach(f => {
    const dir = path.join(uploadDir, f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
app.use('/uploads', express.static(uploadDir));
app.use(express.static(projectRoot));

// ─── ৩. Multer ───
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'products';
        if (file.fieldname === 'profileImage') folder = 'profiles';
        if (file.fieldname === 'logo')         folder = 'logos';
        cb(null, path.join(uploadDir, folder));
    },
    filename: (req, file, cb) => {
        const u = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + u + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ─── ৪. Database ───
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Dadaxwear DB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ═════════════════════════════════════════════════════
// ✅ HELPER: Orders এর items এ missing image fill করা
//    productId দিয়ে products collection থেকে image নেওয়া হয়
//    পুরনো orders এও কাজ করবে
// ═════════════════════════════════════════════════════
async function enrichOrdersWithImages(orders, db) {
    // ১. সব unique productId collect করো (image নেই এমন items থেকে)
    const missingIds = new Set();
    for (const order of orders) {
        for (const item of (order.items || [])) {
            if (!item.image && item.productId) {
                missingIds.add(String(item.productId));
            }
        }
    }

    // ২. একবারেই DB থেকে সব products আনো (N+1 query বাদ)
    const productImageMap = {};
    if (missingIds.size > 0) {
        try {
            const validIds = [...missingIds].filter(id => {
                try { new ObjectId(id); return true; } catch { return false; }
            });

            if (validIds.length > 0) {
                const products = await db.collection('products')
                    .find(
                        { _id: { $in: validIds.map(id => new ObjectId(id)) } },
                        { projection: { _id: 1, image: 1 } }
                    )
                    .toArray();

                for (const p of products) {
                    productImageMap[String(p._id)] = p.image || '';
                }
            }
        } catch (e) {
            console.warn('Image enrichment lookup failed:', e.message);
        }
    }

    // ৩. Orders এর items এ image fill করো
    for (const order of orders) {
        for (const item of (order.items || [])) {
            if (!item.image && item.productId) {
                item.image = productImageMap[String(item.productId)] || '';
            }
        }
    }

    return orders;
}

// ═════════════════════════════════════════════════════
// ৫. ADMIN AUTH API
// ═════════════════════════════════════════════════════

// Admin Login — email+password check, token return
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@dadaxwear.com';
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@DXW2024!';

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const emailMatch    = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const passwordMatch = password === ADMIN_PASSWORD;

        if (!emailMatch || !passwordMatch) {
            console.warn(`⚠️ Failed admin login attempt: email=${email}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = generateAdminToken();
        console.log(`✅ Admin logged in: ${email}`);
        res.json({ success: true, token });

    } catch (err) {
        console.error('POST /api/admin/login error:', err);
        res.status(500).json({ success: false });
    }
});

// Admin Logout — token invalidate
app.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) adminTokens.delete(token);
    res.json({ success: true });
});

// ═════════════════════════════════════════════════════
// ৬. USER PROFILE API
// ═════════════════════════════════════════════════════
app.post('/api/user/save-profile', upload.single('profileImage'), async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

        const db         = mongoose.connection.db;
        const updateData = { ...req.body, updatedAt: new Date() };
        if (req.file) updateData.profileImage = `/uploads/profiles/${req.file.filename}`;

        await db.collection('users').updateOne(
            { phone: phone.trim() },
            { $set: updateData },
            { upsert: true }
        );
        res.json({ success: true, profileImage: updateData.profileImage });
    } catch (err) {
        console.error('save-profile error:', err);
        res.status(500).json({ success: false });
    }
});

app.get('/api/user/get-profile/:phone', async (req, res) => {
    try {
        const db   = mongoose.connection.db;
        const user = await db.collection('users').findOne({ phone: req.params.phone.trim() });
        res.json({ success: !!user, exists: !!user, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═════════════════════════════════════════════════════
// ৬. ORDER API
// ═════════════════════════════════════════════════════

// নতুন order তৈরি করা (checkout)
app.post('/api/orders', async (req, res) => {
    try {
        const db      = mongoose.connection.db;
        const orderId = 'DXW' + Math.floor(100000 + Math.random() * 900000);

        const customer = req.body.customer || {};
        if (customer.phone) customer.phone = customer.phone.trim();

        const orderData = {
            orderId:        orderId,
            customer:       customer,
            items:          req.body.items || [],
            totalAmount:    Number(req.body.totalAmount) || 0,
            shippingCharge: Number(req.body.shippingCharge) || 0,
            paymentMethod:  req.body.paymentMethod || 'cod',
            transactionId:  req.body.transactionId || 'N/A',
            status:         'Pending',
            createdAt:      new Date()
        };

        const result = await db.collection('orders').insertOne(orderData);
        console.log(`✅ New order: ${orderId} | Phone: ${customer.phone} | Total: ${orderData.totalAmount}`);
        res.status(201).json({ success: true, orderId, _id: result.insertedId });

    } catch (err) {
        console.error('POST /api/orders error:', err);
        res.status(500).json({ success: false, message: 'Order failed' });
    }
});

// Admin: সব orders দেখা — image enrichment সহ (protected)
app.get('/api/orders', verifyAdminToken, async (req, res) => {
    try {
        const db     = mongoose.connection.db;
        let orders   = await db.collection('orders')
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        // ✅ image enrichment
        orders = await enrichOrdersWithImages(orders, db);

        console.log(`📋 Admin fetched all orders: ${orders.length}`);
        res.json(orders);
    } catch (err) {
        console.error('GET /api/orders error:', err);
        res.status(500).json([]);
    }
});

// ✅ User history — image enrichment সহ
// পুরনো orders এ item.image না থাকলে productId দিয়ে fill করা হয়
app.get('/api/orders/user/:phone', async (req, res) => {
    try {
        const db    = mongoose.connection.db;
        const phone = decodeURIComponent(req.params.phone).trim();
        if (!phone) return res.json([]);

        let orders = await db.collection('orders')
            .find({
                'customer.phone': {
                    $regex: `^${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                    $options: 'i'
                }
            })
            .sort({ createdAt: -1 })
            .toArray();

        // ✅ image enrichment — পুরনো + নতুন সব orders
        orders = await enrichOrdersWithImages(orders, db);

        console.log(`📋 History: phone=${phone}, found=${orders.length}`);
        res.json(orders);

    } catch (err) {
        console.error('GET /api/orders/user error:', err);
        res.status(500).json([]);
    }
});

// Order status update + notification
app.put('/api/orders/:id/status', verifyAdminToken, async (req, res) => {
    try {
        const { status } = req.body;
        const db         = mongoose.connection.db;

        const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
        if (!order) return res.status(404).json({ success: false });

        await db.collection('orders').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, updatedAt: new Date() } }
        );

        const oid = order.orderId || req.params.id.slice(-6).toUpperCase();
        let msg = `Apnar order #${oid} er status ekhon: ${status}.`;
        if (status === 'Shipped')   msg = `Order #${oid} shipped hoyeche!`;
        if (status === 'Delivered') msg = `Order #${oid} delivered! Dhonnobad.`;

        await db.collection('notifications').insertOne({
            phone:     order.customer?.phone || '',
            orderId:   oid,
            message:   msg,
            status,
            isRead:    false,
            createdAt: new Date()
        });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/orders/:id/status error:', err);
        res.status(500).json({ success: false });
    }
});

// Admin: order delete করা (protected)
app.delete('/api/orders/:id', verifyAdminToken, async (req, res) => {
    try {
        const db     = mongoose.connection.db;
        const result = await db.collection('orders').deleteOne({
            _id: new ObjectId(req.params.id)
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        console.log(`🗑️ Order deleted: ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/orders/:id error:', err);
        res.status(500).json({ success: false });
    }
});

// ═════════════════════════════════════════════════════
// ৭. PRODUCT API
// ═════════════════════════════════════════════════════
app.get('/api/products', async (req, res) => {
    try {
        const db       = mongoose.connection.db;
        const products = await db.collection('products').find().sort({ createdAt: -1 }).toArray();
        res.json(products);
    } catch (err) {
        console.error('GET /api/products error:', err);
        res.status(500).json([]);
    }
});

app.post('/api/admin/add-product', verifyAdminToken, upload.fields([
    { name: 'image',   maxCount: 1 },
    { name: 'gallery', maxCount: 3 }
]), async (req, res) => {
    try {
        const { name, price, description, category } = req.body;
        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Name and price required' });
        }

        const mainImage = req.files['image']?.[0]?.filename
            ? `/uploads/products/${req.files['image'][0].filename}`
            : '';
        const gallery = (req.files['gallery'] || []).map(f => `/uploads/products/${f.filename}`);

        const db          = mongoose.connection.db;
        const productData = {
            name:        name.trim(),
            price:       Number(price),
            description: description?.trim() || '',
            category:    category || 'All',
            image:       mainImage,
            gallery:     gallery,
            createdAt:   new Date()
        };

        const result = await db.collection('products').insertOne(productData);
        console.log(`✅ Product added: ${name} | ID: ${result.insertedId}`);
        res.status(201).json({ success: true, _id: result.insertedId });

    } catch (err) {
        console.error('POST /api/admin/add-product error:', err);
        res.status(500).json({ success: false, message: 'Failed to add product' });
    }
});

app.delete('/api/admin/products/:id', verifyAdminToken, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        await db.collection('products').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ═════════════════════════════════════════════════════
// ৮. SETTINGS / LOGO
// ═════════════════════════════════════════════════════
app.get('/api/settings/logo', async (req, res) => {
    try {
        const db       = mongoose.connection.db;
        const settings = await db.collection('settings').findOne({ type: 'site_config' });
        res.json(settings || { logo: '/uploads/logos/default.png' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/update-logo', verifyAdminToken, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No logo file provided' });
        }
        const logoPath = `/uploads/logos/${req.file.filename}`;
        const db       = mongoose.connection.db;

        await db.collection('settings').updateOne(
            { type: 'site_config' },
            { $set: { logo: logoPath, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log(`✅ Logo updated: ${logoPath}`);
        res.json({ success: true, logo: logoPath });
    } catch (err) {
        console.error('POST /api/admin/update-logo error:', err);
        res.status(500).json({ success: false });
    }
});

// ═════════════════════════════════════════════════════
// ৯. NOTIFICATION API
// ═════════════════════════════════════════════════════

// ✅ User এর সব notifications আনা (notification.html এ দরকার)
app.get('/api/notifications/:phone', async (req, res) => {
    try {
        const db    = mongoose.connection.db;
        const phone = decodeURIComponent(req.params.phone).trim();
        if (!phone) return res.json([]);

        const notifications = await db.collection('notifications')
            .find({ phone: { $regex: `^${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
            .sort({ createdAt: -1 })
            .toArray();

        console.log(`🔔 Notifications: phone=${phone}, found=${notifications.length}`);
        res.json(notifications);
    } catch (err) {
        console.error('GET /api/notifications/:phone error:', err);
        res.status(500).json([]);
    }
});

// ✅ Single notification delete
app.delete('/api/notifications/:id', async (req, res) => {
    try {
        const db     = mongoose.connection.db;
        const result = await db.collection('notifications').deleteOne({
            _id: new ObjectId(req.params.id)
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/notifications/:id error:', err);
        res.status(500).json({ success: false });
    }
});

// ✅ User এর সব notifications clear করা
app.delete('/api/notifications/clear/:phone', async (req, res) => {
    try {
        const db    = mongoose.connection.db;
        const phone = decodeURIComponent(req.params.phone).trim();
        if (!phone) return res.status(400).json({ success: false });

        const result = await db.collection('notifications').deleteMany({
            phone: { $regex: `^${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        });
        console.log(`🗑️ Cleared ${result.deletedCount} notifications for phone=${phone}`);
        res.json({ success: true, deleted: result.deletedCount });
    } catch (err) {
        console.error('DELETE /api/notifications/clear/:phone error:', err);
        res.status(500).json({ success: false });
    }
});

// ═════════════════════════════════════════════════════
// ১০. PAGE ROUTING
// ═════════════════════════════════════════════════════
app.get('/', (req, res) => res.sendFile(path.join(projectRoot, 'index.html')));

app.get('/:page', (req, res, next) => {
    let page = req.params.page;
    if (!page.includes('.')) page += '.html';
    const filePath = path.join(projectRoot, page);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else next();
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dadaxwear Server v34.0 running on port ${PORT}`);
});
