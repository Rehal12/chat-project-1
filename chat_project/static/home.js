let socket = io();
let username = localStorage.getItem('username') || "Anonymous";

// --- Friend System & Sidebar Logic ---
let friends = JSON.parse(localStorage.getItem('friends') || '[]');
let recentChats = JSON.parse(localStorage.getItem('recentChats') || '[]');
let groups = JSON.parse(localStorage.getItem('groups') || '[]');

function renderFriendList() {
    const ul = document.getElementById('friendList');
    ul.innerHTML = '';
    if (friends.length === 0) {
        ul.innerHTML = '<li style="color:#888;">No friends yet</li>';
        return;
    }
    friends.forEach(email => {
        // Fetch username for each friend
        fetch('/search_user', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: email })
        })
        .then(res => res.json())
        .then(data => {
            let username = email;
            if (data.success && data.users.length > 0) {
                username = data.users[0].username;
            }
            const li = document.createElement('li');
            li.innerHTML = `<b>${username}</b> <span style='color:#888;'>(${email})</span>`;
            li.onclick = () => startChatWithFriend(email);
            ul.appendChild(li);
        });
    });
}
function renderRecentChats() {
    const ul = document.getElementById('recentChats');
    ul.innerHTML = '';
    if (recentChats.length === 0) {
        ul.innerHTML = '<li style="color:#888;">No recent chats</li>';
        return;
    }
    recentChats.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;
        li.onclick = () => startChatWithFriend(email);
        ul.appendChild(li);
    });
}
function renderGroupList() {
    const ul = document.getElementById('groupList');
    ul.innerHTML = '';
    if (groups.length === 0) {
        ul.innerHTML = '<li style="color:#888;">No groups yet</li>';
        return;
    }
    groups.forEach(group => {
        // Only show group if it exists in backend rooms
        fetch('/get_group_info', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ group_id: group.id })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const li = document.createElement('li');
                li.textContent = group.name || group.id;
                li.onclick = () => joinGroupChat(group.id);
                ul.appendChild(li);
            }
        });
    });
}
// --- Friend Search Modal ---
function showSearchFriendModal() {
    // Overlay
    let overlay = document.createElement('div');
    overlay.className = 'friend-search-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    // Modal
    let modal = document.createElement('div');
    modal.className = 'friend-search-modal';
    modal.innerHTML = `
        <h3>Search Friend</h3>
        <input id='searchFriendInput' type='text' placeholder='Email or Username'>
        <button id='searchFriendBtn' class='sidebar-btn' style='margin-top:8px;'>Search</button>
        <div class='search-results' id='searchFriendResults'></div>
        <button onclick='this.closest(".friend-search-overlay").remove()' class='sidebar-btn' style='margin-top:18px;background:#eee;color:#2193b0;'>Close</button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('searchFriendBtn').onclick = function() {
        let query = document.getElementById('searchFriendInput').value.trim();
        if (!query) return;
        fetch('/search_user', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query })
        })
        .then(res => res.json())
        .then(data => {
            let resultsDiv = document.getElementById('searchFriendResults');
            resultsDiv.innerHTML = '';
            const myEmail = localStorage.getItem('email');
            let users = (data.success && data.users) ? data.users.filter(u => u.email !== myEmail) : [];
            if (users.length) {
                users.forEach(user => {
                    let item = document.createElement('div');
                    item.className = 'search-result-item';
                    item.innerHTML = `<span><b>${user.username}</b> <span style='color:#888;font-size:12px;'>(${user.email})</span></span>`;
                    let addBtn = document.createElement('button');
                    addBtn.textContent = 'Add';
                    addBtn.className = 'add-btn';
                    addBtn.onclick = function() {
                        showFriendRequestModal(user.email, user.username, overlay);
                    };
                    item.appendChild(addBtn);
                    resultsDiv.appendChild(item);
                });
            } else {
                resultsDiv.innerHTML = '<div style="color:#888;">No users found</div>';
            }
        });
    };
}

function showFriendRequestModal(email, username, parentOverlay) {
    if (parentOverlay) parentOverlay.remove();
    let overlay = document.createElement('div');
    overlay.className = 'friend-search-overlay';
    let modal = document.createElement('div');
    modal.className = 'friend-search-modal';
    modal.innerHTML = `
        <h3>Add Friend</h3>
        <div style='margin-bottom:10px;'>Send friend request to <b>${username}</b>?</div>
        <button id='sendFriendReqBtn' class='sidebar-btn'>Send Request</button>
        <button id='cancelFriendReqBtn' class='sidebar-btn' style='margin-left:10px;background:#eee;color:#2193b0;'>Cancel</button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('sendFriendReqBtn').onclick = function() {
        addFriendFromSearch(email, username, overlay);
    };
    document.getElementById('cancelFriendReqBtn').onclick = function() {
        overlay.remove();
    };
}

function addFriendFromSearch(email, username, overlay) {
    if (friends.includes(email)) {
        showToast('Already in your friend list.');
        if (overlay) overlay.remove();
        return;
    }
    const myEmail = localStorage.getItem('email');
    const myName = localStorage.getItem('username');
    addFriendBackend(email);
    // Always send username with friend request
    socket.emit('friend_request', {
        sender_email: myEmail,
        sender_username: myName,
        receiver_email: email
    });
    if (overlay) overlay.remove();
    showToast('Friend request sent!');
}

// --- Friend Search System ---
function showAddFriendModal() {
    // Replace modal with search UI
    const modal = document.getElementById('addFriendModal');
    modal.innerHTML = `<div class='modal-card'>
        <h3>Search User</h3>
        <input type='text' id='searchFriendInput' placeholder='Enter email or username'>
        <button onclick='searchFriend()'>Search</button>
        <div id='searchFriendResults' style='margin-top:12px;'></div>
        <button onclick='closeAddFriendModal()' class='modal-close'>Close</button>
    </div>`;
    modal.style.display = 'flex';
}
function closeAddFriendModal() {
    document.getElementById('addFriendModal').style.display = 'none';
}
function searchFriend() {
    const query = document.getElementById('searchFriendInput').value.trim();
    if (!query) return;
    fetch('/search_user', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ query })
    })
    .then(res => res.json())
    .then(data => {
        const resultsDiv = document.getElementById('searchFriendResults');
        if (data.success && data.users.length > 0) {
            resultsDiv.innerHTML = data.users.map(u =>
                `<div style='margin-bottom:8px;'>
                    <b>${u.username}</b> <span style='color:#888;'>(${u.email})</span>
                    <button class='sidebar-btn' style='margin-left:8px;' onclick='addFriendFromSearch("${u.email}")'>Add</button>
                </div>`
            ).join('');
        } else {
            resultsDiv.innerHTML = '<span style="color:#888;">No user found</span>';
        }
    });
}
function addFriendFromSearch(email) {
    addFriendBackend(email);
    showToast('Friend added!');
    closeAddFriendModal();
}
function addFriend() {
    const email = document.getElementById('addFriendEmail').value.trim();
    const myEmail = localStorage.getItem('email');
    const myName = localStorage.getItem('username');
    if (email && !friends.includes(email)) {
        // Notify backend and send socket event
        addFriendBackend(email);
        socket.emit('friend_request', {
            sender_email: myEmail,
            sender_username: myName,
            receiver_email: email
        });
        closeAddFriendModal();
    }
}
function startChatWithFriend(email) {
    document.getElementById('partner_email').value = email;
    createSingleChat();
}
function joinGroupChat(groupId) {
    document.getElementById('group_room_id').value = groupId;
    joinGroup();
}

window.onload = function() {
    document.getElementById('userNameShow').textContent = localStorage.getItem('username') || '';
    document.getElementById('userEmailShow').textContent = 'Email: ' + (localStorage.getItem('email') || '');
    syncFriends();
    renderRecentChats();
    renderGroupList();
    // Replace add friend button
    let addBtn = document.getElementById('addFriendBtn');
    if (addBtn) addBtn.onclick = showSearchFriendModal;
};

// Show/Hide functions for chat types
function showSingle() {
    document.getElementById('singleDiv').style.display = 'block';
    document.getElementById('groupDiv').style.display = 'none';
}
// coming soon 
function showGroup() {
    document.getElementById('singleDiv').style.display = 'none';
    document.getElementById('groupDiv').style.display = 'block';
}

// Single chat functions
function createSingleChat() {
    const partner_email = document.getElementById('partner_email').value.trim();
    const email = localStorage.getItem('email');
    const username = localStorage.getItem('username');
    if (!partner_email) {
        alert("Enter partner's Email");
        return;
    }
    let ids = [email, partner_email].sort();
    let room_id = ids.join('_');
    // Always send username with chat request
    socket.emit('chat_request', {
        sender_email: email,
        sender_username: username,
        receiver_email: partner_email,
        room_id: room_id
    });
    document.getElementById('info').innerText = 'Chat request sent. Waiting for response...';
}

// Listen for chat request accepted/rejected
socket.on('chat_request_accepted', function(data) {
    localStorage.setItem('room_id', data.room_id);
    localStorage.setItem('chat_type', 'single');
    window.location.href = "/chat";
});

socket.on('chat_request_rejected', function(data) {
    document.getElementById('info').innerText = 'User rejected your request.';
});

// Listen for chat request failed (user not online)
socket.on('chat_request_failed', function(data) {
    document.getElementById('info').innerText = data.error || 'Request failed.';
});

function copyGroupId(roomId) {
    navigator.clipboard.writeText(roomId);
    alert("Group ID copied to clipboard!");
}

function goToChat(roomId) {
    window.location.href = "/chat";
}

function showGroupIdModal(groupId) {
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class='modal-card'><h3>Group Created!</h3><div>Group ID: <b>${groupId}</b></div><button onclick='navigator.clipboard.writeText("${groupId}");alert("Copied!")'>Copy Group ID</button><button onclick='this.parentNode.parentNode.remove()' class='modal-close'>Close</button></div>`;
    document.body.appendChild(modal);
}
function createGroup() {
    const group_name = document.getElementById('group_name').value.trim();
    const email = localStorage.getItem('email');
    const username = localStorage.getItem('username');
    if (!group_name) {
        alert('Enter group name');
        return;
    }
    fetch('/create_group', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_name, email, username })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            groups.push({ id: data.group_id, name: data.group_name });
            localStorage.setItem('groups', JSON.stringify(groups));
            renderGroupList();
            showGroupIdModal(data.group_id);
        } else {
            alert(data.error);
        }
    });
}
function joinGroup() {
    const group_id = document.getElementById('group_room_id').value.trim();
    const email = localStorage.getItem('email');
    const username = localStorage.getItem('username');
    if (!group_id) {
        alert('Enter Group Room ID');
        return;
    }
    fetch('/join_group', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_id, email, username })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (!groups.find(g => g.id === group_id)) {
                groups.push({ id: group_id, name: data.group_name });
                localStorage.setItem('groups', JSON.stringify(groups));
                renderGroupList();
            }
            localStorage.setItem('room_id', group_id);
            localStorage.setItem('chat_type', 'group');
            window.location.href = '/chat';
        } else {
            alert(data.error);
        }
    });
}

// --- Chat History & Friend Sync ---
function fetchChatHistory(room_id, cb) {
    fetch('/get_history', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && cb) cb(data.messages);
    });
}
function syncFriends() {
    const email = localStorage.getItem('email');
    fetch('/get_friends', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ user_email: email })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            friends = data.friends;
            localStorage.setItem('friends', JSON.stringify(friends));
            renderFriendList();
        }
    });
}
function addFriendBackend(friend_email) {
    const email = localStorage.getItem('email');
    fetch('/add_friend', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ user_email: email, friend_email })
    }).then(() => syncFriends());
}
// Override addFriend to sync with backend
function addFriend() {
    const email = document.getElementById('addFriendEmail').value.trim();
    const myEmail = localStorage.getItem('email');
    const myName = localStorage.getItem('username');
    if (email && !friends.includes(email)) {
        // Notify backend and send socket event
        addFriendBackend(email);
        socket.emit('friend_request', {
            sender_email: myEmail,
            sender_username: myName,
            receiver_email: email
        });
        closeAddFriendModal();
    }
}

// Ensure socket joins email room on connect for chat and friend requests
socket.on('connect', function() {
    const email = localStorage.getItem('email');
    const username = localStorage.getItem('username');
    console.log('[SOCKET] Connected. Registering email:', email, username);
    if (email) {
        socket.emit('register_email', { email: email, username: username });
    }
});

// Enhanced friend request modal
socket.on('receive_friend_request', function(data) {
    console.log('[SOCKET] receive_friend_request', data);
    // Create modal for accept/reject
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class='modal-card'><h3>Friend Request</h3><div><b>${data.sender_username}</b> sent you a friend request!</div><div style='margin-top:12px;display:flex;gap:12px;'><button id='acceptFriendBtn' class='sidebar-btn'>Accept</button><button id='rejectFriendBtn' class='modal-close'>Reject</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('acceptFriendBtn').onclick = function() {
        // Accept: add to backend and notify sender
        addFriendBackend(data.sender_email);
        socket.emit('friend_request_response', {
            sender_email: data.sender_email,
            receiver_email: localStorage.getItem('email'),
            accepted: true
        });
        modal.remove();
        showToast('Friend request accepted!');
    };
    document.getElementById('rejectFriendBtn').onclick = function() {
        socket.emit('friend_request_response', {
            sender_email: data.sender_email,
            receiver_email: localStorage.getItem('email'),
            accepted: false
        });
        modal.remove();
        showToast('Friend request rejected.', 'linear-gradient(90deg,#ff416c,#ff4b2b)');
    };
});
socket.on('friend_request_accepted', function(data) {
    showToast(`${data.receiver_username} accepted your friend request!`);
    syncFriends();
});
socket.on('friend_request_rejected', function(data) {
    showToast(`${data.receiver_username} rejected your friend request.`, 'linear-gradient(90deg,#ff416c,#ff4b2b)');
});

// Handle incoming chat request (for receiver) on home page
socket.on('receive_chat_request', function(data) {
    console.log('[SOCKET] receive_chat_request', data);
    // Show a modal for accept/reject
    let modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `
    <div class='modal-card'>
        <h3>Chat Request</h3>
        <div style='margin-bottom:10px;'>${data.sender_username} wants to chat with you.</div>
        <button id='acceptChatReqBtn' class='sidebar-btn'>Accept</button>
        <button id='rejectChatReqBtn' class='sidebar-btn' style='margin-left:10px;'>Reject</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('acceptChatReqBtn').onclick = function() {
        socket.emit('chat_request_response', {
            sender_email: data.sender_email,
            receiver_email: localStorage.getItem('email'),
            room_id: data.room_id,
            accepted: true
        });
        modal.remove();
        showToast('Chat request accepted! Redirecting...');
        setTimeout(() => {
            localStorage.setItem('room_id', data.room_id);
            localStorage.setItem('chat_type', 'single');
            window.location.href = '/chat';
        }, 1000);
    };
    document.getElementById('rejectChatReqBtn').onclick = function() {
        socket.emit('chat_request_response', {
            sender_email: data.sender_email,
            receiver_email: localStorage.getItem('email'),
            room_id: data.room_id,
            accepted: false
        });
        modal.remove();
        showToast('Chat request rejected.');
    };
});