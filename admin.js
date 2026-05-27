// ======================================================
// admin.js - DadaXWear Admin Panel Logic
// v2.0 — Email+Password Token Auth
//   ✅ getAdminToken() — localStorage থেকে token নেওয়া
//   ✅ adminFetch() — সব admin requests এ Authorization header
//   ✅ 401 response হলে logout করে login page দেখানো
//   ✅ handleAdminLogout() — server-side token invalidate
// ======================================================

const BASE_URL     = 'https://dadaxwear.com';
const API_BASE_URL = `${BASE_URL}/api`;

// ─── Token helpers ───
function getAdminToken() {
    return localStorage.getItem('dxw_admin_token') || '';
}

// সব admin API call এর জন্য wrapper — token header automatically যোগ হয়
async function adminFetch(url, options = {}) {
    const token = getAdminToken();
    const headers = {
        ...(options.headers || {}),
        'Authorization': `Bearer ${token}`
    };
    // FormData হলে Content-Type browser নিজে set করে (boundary সহ)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const res = await fetch(url, { ...options, headers });

    // Token expired বা invalid হলে logout
    if (res.status === 401) {
        localStorage.removeItem('dxw_admin_token');
        // login overlay দেখাও
        const overlay = document.getElementById('login-overlay');
        const panel   = document.getElementById('admin-panel');
        if (overlay) overlay.style.display = 'flex';
        if (panel)   panel.style.display   = 'none';
        showToast("⚠️ Session expired. Please login again.");
    }
    return res;
}

// ─── Toast ───
function showToast(msg) {
    const t = document.getElementById("toast");
    if (t) {
        t.innerText = msg;
        t.className = "show";
        setTimeout(() => t.className = "", 3000);
    }
}

// ─── Logout ───
window.handleAdminLogout = async function() {
    if (!confirm("Are you sure you want to logout?")) return;
    try {
        await adminFetch(`${API_BASE_URL}/admin/logout`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    localStorage.removeItem('dxw_admin_token');
    window.location.replace('index.html');
};

// ─────────────────────────────────────────────────────
// ১. লোগো লোড
// ─────────────────────────────────────────────────────
async function loadLogo() {
    try {
        const res  = await fetch(`${API_BASE_URL}/settings/logo`);
        const data = await res.json();
        const logoImg = document.getElementById('currentLogo');
        if (logoImg && data.logo) {
            const fullUrl = data.logo.startsWith('http')
                ? data.logo
                : BASE_URL + (data.logo.startsWith('/') ? data.logo : '/' + data.logo);
            logoImg.src          = fullUrl + '?t=' + Date.now();
            logoImg.style.display = 'block';
        }
    } catch (e) { console.error("Logo Error:", e); }
}

// ─────────────────────────────────────────────────────
// ২. লোগো আপডেট
// ─────────────────────────────────────────────────────
window.updateLogo = async function() {
    const file = document.getElementById('logoInput').files[0];
    if (!file) return showToast("⚠️ Select a logo!");

    const btn = document.getElementById('logoBtn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Updating...";

    const fd = new FormData();
    fd.append('logo', file);

    try {
        const res    = await adminFetch(`${API_BASE_URL}/admin/update-logo`, { method: 'POST', body: fd });
        const result = await res.json();
        if (result.success) {
            showToast("✅ Logo Updated!");
            document.getElementById('logoInput').value = "";
            setTimeout(loadLogo, 1000);
        } else {
            showToast("❌ Update Failed");
        }
    } catch (e) { showToast("❌ Server Error"); }
    finally { btn.disabled = false; btn.innerText = originalText; }
};

// ─────────────────────────────────────────────────────
// ৩. নতুন প্রোডাক্ট যোগ
// ─────────────────────────────────────────────────────
window.addNewProduct = async function() {
    const name         = document.getElementById('pName').value;
    const price        = document.getElementById('pPrice').value;
    const desc         = document.getElementById('pDesc').value;
    const cat          = document.getElementById('pCategory').value;
    const mainFile     = document.getElementById('pImage').files[0];
    const galleryFiles = document.getElementById('pGallery').files;
    const btn          = document.getElementById('addBtn');

    if (!name || !price || !mainFile) return showToast("⚠️ Name, Price & Main Image required!");

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const fd = new FormData();
    fd.append('name', name);
    fd.append('price', price);
    fd.append('description', desc);
    fd.append('category', cat);
    fd.append('image', mainFile);
    for (let i = 0; i < Math.min(galleryFiles.length, 3); i++) {
        fd.append('gallery', galleryFiles[i]);
    }

    try {
        const res = await adminFetch(`${API_BASE_URL}/admin/add-product`, { method: 'POST', body: fd });
        if (res.ok) {
            showToast("✅ Product Added!");
            document.getElementById('pName').value    = '';
            document.getElementById('pPrice').value   = '';
            document.getElementById('pDesc').value    = '';
            document.getElementById('pImage').value   = '';
            document.getElementById('pGallery').value = '';
            loadAdminProducts();
        } else {
            showToast("❌ Failed to add product");
        }
    } catch (e) {
        showToast("❌ Server Connection Error");
    } finally {
        btn.disabled  = false;
        btn.innerHTML = oldHtml;
    }
};

// ─────────────────────────────────────────────────────
// ৪. প্রোডাক্ট লিস্ট লোড
// ─────────────────────────────────────────────────────
async function loadAdminProducts() {
    const list = document.getElementById("adminProductList");
    if (!list) return;
    try {
        // GET /api/products — public route, token লাগে না
        const res  = await fetch(`${API_BASE_URL}/products`);
        const data = await res.json();

        if (!data || data.length === 0) {
            list.innerHTML = "<p style='text-align:center; padding:20px; color:#666;'>No products found.</p>";
            return;
        }
        list.innerHTML = data.map(p => {
            const imgPath = p.image
                ? (p.image.startsWith('http') ? p.image : BASE_URL + (p.image.startsWith('/') ? p.image : '/' + p.image))
                : 'https://via.placeholder.com/45';
            return `
            <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
                <img src="${imgPath}" width="45" height="45" style="border-radius:8px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/45'">
                <div style="flex:1;">
                    <b style="font-size:0.8rem; color:#fff;">${p.name}</b><br>
                    <span style="color:var(--primary); font-size:0.75rem;">${p.price} TK | ${p.category || 'All'}</span>
                </div>
                <button onclick="deleteProduct('${p._id}')" style="color:#ff4d4d; background:none; border:none; cursor:pointer; padding:5px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = "<p style='text-align:center; color:red;'>Error loading products</p>";
    }
}

// ─────────────────────────────────────────────────────
// ৫. প্রোডাক্ট ডিলিট
// ─────────────────────────────────────────────────────
window.deleteProduct = async function(id) {
    if (!confirm("Delete this product?")) return;
    try {
        const res = await adminFetch(`${API_BASE_URL}/admin/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("🗑️ Deleted");
            loadAdminProducts();
        } else {
            showToast("❌ Delete Failed");
        }
    } catch (e) { showToast("❌ Error deleting product"); }
};

// ─────────────────────────────────────────────────────
// ৬. অর্ডার লোড
// ─────────────────────────────────────────────────────
async function loadOrders() {
    const container = document.getElementById('orderList');
    if (!container) return;
    try {
        const res    = await adminFetch(`${API_BASE_URL}/orders`);
        if (!res.ok) { container.innerHTML = "<p style='text-align:center; color:red;'>Auth error</p>"; return; }
        const orders = await res.json();

        if (!orders || orders.length === 0) {
            container.innerHTML = "<p style='text-align:center; padding:20px; color:#666;'>No orders found.</p>";
            return;
        }

        container.innerHTML = orders.map(o => {
            const trx      = o['trx-id'] || o.trxId || o.transactionId || o.trx || "";
            const isOnline = o.paymentMethod?.toLowerCase() !== 'cod' &&
                             o.paymentMethod?.toLowerCase() !== 'cash on delivery';
            return `
            <div class="order-card">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <b style="color:var(--primary);">#${o.orderId || o._id.slice(-6).toUpperCase()}</b>
                    <span style="color:var(--primary); font-size:0.75rem; font-weight:bold;">${o.paymentMethod}</span>
                </div>
                <div style="font-size:0.85rem; color:#eee; margin-bottom:10px;">
                    <div><b>${o.customer?.name}</b> (${o.customer?.phone})</div>
                    <div style="color:#999; font-size:0.8rem;">${o.customer?.address}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:10px; font-size:0.8rem; margin-bottom:10px;">
                    ${(o.items || []).map(i => {
                        const sleeve = i['order-hand'] || i.hand || i.handType || i.sleeve || "N/A";
                        return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #222; padding:5px 0;">
                            <span>${i.name} (S: ${i.size || 'N/A'}, H: ${sleeve})</span>
                            <span>x${i.quantity}</span>
                        </div>`;
                    }).join('')}
                </div>
                ${(isOnline && trx) ? `
                    <div style="background:rgba(46,204,113,0.1); border:1px solid #2ecc71; padding:8px; border-radius:8px; font-size:0.8rem; margin-bottom:10px; color:#2ecc71; font-family:monospace; word-break:break-all;">
                        TrxID: ${trx}
                    </div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #333; padding-top:10px;">
                    <b style="color:var(--primary);">${o.totalAmount} TK</b>
                    <div style="display:flex; gap:5px;">
                        <select onchange="updateOrderStatus('${o._id}', this.value)" style="padding:4px; font-size:0.7rem; background:#222; color:#fff; border:1px solid #444; border-radius:4px;">
                            <option value="Pending"    ${o.status === 'Pending'    ? 'selected' : ''}>Pending</option>
                            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Shipped"    ${o.status === 'Shipped'    ? 'selected' : ''}>Shipped</option>
                            <option value="Delivered"  ${o.status === 'Delivered'  ? 'selected' : ''}>Delivered</option>
                            <option value="Cancelled"  ${o.status === 'Cancelled'  ? 'selected' : ''}>Cancelled</option>
                        </select>
                        <button onclick="deleteOrder('${o._id}')" style="color:#ff4d4d; border:none; background:none; cursor:pointer;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = "<p style='text-align:center; color:red;'>Error loading orders</p>";
    }
}

// ─────────────────────────────────────────────────────
// ৭. অর্ডার স্ট্যাটাস আপডেট
// ─────────────────────────────────────────────────────
window.updateOrderStatus = async (id, status) => {
    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${id}/status`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status })
        });
        if (res.ok) showToast("✅ Status Updated & Notified!");
        else        showToast("❌ Update Failed");
    } catch (e) { showToast("❌ Network Error"); }
};

// ─────────────────────────────────────────────────────
// ৮. অর্ডার ডিলিট
// ─────────────────────────────────────────────────────
window.deleteOrder = async (id) => {
    if (!confirm("Delete this order?")) return;
    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${id}`, { method: 'DELETE' });
        if (res.ok) { showToast("🗑️ Order Deleted"); loadOrders(); }
        else        showToast("❌ Delete Failed");
    } catch (e) { showToast("❌ Error deleting order"); }
};
