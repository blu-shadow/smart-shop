/**
 * DadaXWear - Profile Dashboard Logic (Fixed for HTTPS & Domain)
 */

const API_BASE = 'https://dadaxwear.com/api';

document.addEventListener('DOMContentLoaded', async () => {
    const userPhone = localStorage.getItem('user_phone');

    // যদি ফোন নম্বর না থাকে, তবে তাকে লগইন/সেটআপ পেজে পাঠাও
    if (!userPhone) {
        window.location.href = 'login.html';
        return;
    }

    // প্রোফাইল ডাটা লোড করা
    try {
        const res = await fetch(`${API_BASE}/user/get-profile/${userPhone}`);
        const data = await res.json();

        if (data.exists) {
            updateUI(data.user);
        } else {
            // যদি ইউজার ডেটাবেসে না থাকে
            window.location.href = 'login.html';
        }
    } catch (err) {
        console.error("Profile Load Error:", err);
    }

    // সাইন আউট লজিক
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.onclick = () => {
            localStorage.removeItem('user_phone');
            localStorage.removeItem('dxw_user');
            window.location.href = 'login.html';
        };
    }

    // এডিট বাটন লজিক
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.onclick = () => {
            window.location.href = 'login.html';
        };
    }
});

/**
 * UI আপডেট করার ফাংশন
 */
function updateUI(user) {
    // এলিমেন্টগুলো চেক করে ডেটা সেট করা
    const fields = {
        'display-name': user.name || 'User',
        'display-username': `@${user.username || 'username'}`,
        'display-email': user.email || '-',
        'display-phone': user.phone || '-',
        'display-birth': user.birthYear || '-',
        'display-age': user.age || '-',
        'display-address': user.address || '-'
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    }

    // প্রোফাইল ইমেজ সেটআপ
    if (user.profileImage) {
        const imgElement = document.getElementById('display-img');
        if (imgElement) {
            // ফিক্সড: পুরনো আইপি সরিয়ে ডোমেইন ব্যবহার করা হয়েছে
            const imgUrl = user.profileImage.startsWith('http') 
                ? user.profileImage 
                : `https://dadaxwear.com${user.profileImage}`;
            
            imgElement.src = imgUrl;

            // যদি ইমেজ লোড হতে এরর দেয় তবে ডিফল্ট ইমেজ দেখাবে
            imgElement.onerror = function() {
                this.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
            };
        }
    }
}
