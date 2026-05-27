// ======================================================
// DADAXWEAR CHECKOUT SYSTEM - v27.0
// FIXES v27:
//   ✅ historyItem items এ image field যোগ করা হয়েছে
//   ✅ orderData items এ image field যোগ করা হয়েছে
//      → history page এ product thumbnail দেখাবে
// ======================================================

window.processOrder = async function () {
    const btn = document.getElementById('place-order-btn');

    try {
        let cart = [];
        try {
            cart = JSON.parse(localStorage.getItem('dxw_cart')) || [];
            if (!Array.isArray(cart)) cart = [];
        } catch (e) { cart = []; }

        if (cart.length === 0) {
            alert('❌ আপনার ব্যাগ খালি! কেনাকাটা করুন।');
            return;
        }

        const nameVal  = document.getElementById('cust-name')?.value.trim();
        const phoneVal = document.getElementById('cust-phone')?.value.trim();
        const addrVal  = document.getElementById('cust-address')?.value.trim();
        const areaEl   = document.getElementById('delivery-area');

        const paymentRadio = document.querySelector('input[name="payment"]:checked');
        const trxInput     = document.getElementById('trx-id');

        if (!nameVal || !phoneVal || !addrVal) {
            alert('❌ নাম, ফোন এবং ঠিকানা দিন।');
            return;
        }
        if (!paymentRadio) {
            alert('❌ একটি পেমেন্ট মেথড সিলেক্ট করুন।');
            return;
        }

        localStorage.setItem('dxw_user_phone', phoneVal.trim());

        const shippingCharge = areaEl ? (parseInt(areaEl.value) || 55) : 55;
        const subtotal    = cart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity || 1)), 0);
        const totalAmount = subtotal + shippingCharge;

        // ✅ FIX: image field যোগ করা হয়েছে — history page thumbnail-এর জন্য
        const tempId = 'DXW' + Date.now();
        const historyItem = {
            orderId:     tempId,
            date:        new Date().toLocaleDateString('en-GB'),
            total:       totalAmount,
            totalAmount: totalAmount,
            status:      'Pending',
            items:       cart.map(item => ({
                name:     item.name,
                price:    Number(item.price),
                quantity: Number(item.quantity) || 1,
                size:     item.size || 'Free Size',
                sleeve:   'N/A',
                image:    item.image || ''       // ✅ image save
            }))
        };

        let hist = [];
        try { hist = JSON.parse(localStorage.getItem('dxw_order_history')) || []; } catch (e) { hist = []; }
        hist.unshift(historyItem);
        localStorage.setItem('dxw_order_history', JSON.stringify(hist));

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> প্রসেস হচ্ছে...';
        }

        // ✅ FIX: orderData items এও image পাঠানো হচ্ছে — server DB তে save হবে
        const orderData = {
            customer: { name: nameVal, phone: phoneVal.trim(), address: addrVal },
            items: cart.map(item => ({
                productId: String(item.id || item._id || ''),
                name:      item.name,
                quantity:  Number(item.quantity) || 1,
                price:     Number(item.price),
                size:      item.size || 'Free Size',
                handType:  'N/A',
                image:     item.image || ''      // ✅ image server-এও save
            })),
            shippingCharge: shippingCharge,
            totalAmount:    totalAmount,
            paymentMethod:  paymentRadio.value.toLowerCase(),
            transactionId:  paymentRadio.value !== 'cod' ? (trxInput?.value.trim() || 'N/A') : 'N/A'
        };

        const res    = await fetch('https://dadaxwear.com/api/orders', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(orderData)
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const realId = result.orderId || tempId;
            try {
                let h = JSON.parse(localStorage.getItem('dxw_order_history')) || [];
                if (h.length > 0 && h[0].orderId === tempId) {
                    h[0].orderId = realId;
                    localStorage.setItem('dxw_order_history', JSON.stringify(h));
                }
            } catch (e) {}

            localStorage.removeItem('dxw_cart');
            if (typeof window.clearCartMemory === 'function') window.clearCartMemory();

            const modal = document.getElementById('order-success-modal');
            if (modal) {
                modal.style.display = 'flex';
            } else {
                alert(`✅ অর্ডার সফল! ID: ${realId}`);
                window.location.href = 'history.html';
            }

        } else {
            try {
                let h = JSON.parse(localStorage.getItem('dxw_order_history')) || [];
                h = h.filter(o => o.orderId !== tempId);
                localStorage.setItem('dxw_order_history', JSON.stringify(h));
            } catch (e) {}
            alert('❌ অর্ডার ব্যর্থ: ' + (result.message || 'সার্ভার সমস্যা।'));
        }

    } catch (err) {
        console.error('Checkout error:', err);
        alert('❌ সমস্যা হয়েছে। ইন্টারনেট চেক করুন।');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>CONFIRM ORDER</span> <i class="fas fa-arrow-right"></i>';
        }
    }
};
