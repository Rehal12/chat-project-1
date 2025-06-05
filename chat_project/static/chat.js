const socket = io();
let my_email = localStorage.getItem('email');
let username = localStorage.getItem('username') || "Anonymous";
let room_id = localStorage.getItem('room_id');
let chat_type = localStorage.getItem('chat_type');
let room_info = null;

socket.on('connect', () => {
    socket.emit('register_email', { email: my_email, username: username });
    socket.emit('join_room', {
        room_id: room_id,
        email: my_email,    // Make sure to include this
        username: username
    });
});

socket.on('room_info', function(data) {
    room_info = data;
    const my_email = localStorage.getItem('email');
    let title = '';
    let members = '';

    if (data.type === 'group') {
        title = `Group: ${data.name}`;
        members = 'Members: ' + data.member_info.map(m => m.username).join(', ');
    } else {
        const partner = data.member_info.find(m => m.email !== my_email);
        title = `Chat with: ${partner ? partner.username : 'Unknown'}`;
    }

    document.getElementById('chatTitle').innerText = title;
    document.getElementById('status').innerText = members;
    updateChatHeaderFriendBtn();
});


window.onload = function() {
    if (room_id) {
        fetch('/get_history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ room_id })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && Array.isArray(data.messages)) {
                data.messages.forEach(showMsg);
            }
        });
    }
    // Always show Add Friend button in header
    let btn = document.getElementById('addFriendBtn');
    if (btn) btn.onclick = addPartnerAsFriend;
};

function sendMsg() {
    const msg = document.getElementById('msgInput').value.trim();
    if (!msg) return;
    socket.emit('send_message', {
        room_id: localStorage.getItem('room_id'),
        sender: localStorage.getItem('username'),
        message: msg,
        type: 'text'  
    });
    document.getElementById('msgInput').value = '';
}


document.getElementById('sendImgBtn').addEventListener('click', function() {
    const fileInput = document.getElementById('imgInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert("Please choose an image file first.");
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    fetch('/upload_image', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log("Image uploaded:", data.url);
            socket.emit('send_message', {
                room_id: localStorage.getItem('room_id'),
                sender: localStorage.getItem('username'),
                message: data.url,
                type: 'image'
            });
            fileInput.value = '';
        } else {
            console.error("Upload failed:", data.error);
            alert("Failed to upload image: " + data.error);
        }
    })
    .catch(error => {
        console.error("Upload error:", error);
        alert("Error uploading image");
    });
});


socket.on('new_message', function(data) {
    showMsg(data);
});


function showMsg(data) {
    const myName = localStorage.getItem('username');
    const isMe = data.sender === myName;
    const bubbleClass = isMe ? "chat-bubble my-bubble" : "chat-bubble other-bubble";
    
    let html = '';
    if (data.type === 'image') {
        html = `
            <div class="${isMe ? 'my-message' : 'other-message'}">
                <div class="${bubbleClass}">
                    <b>${data.sender}</b><br>
                    <img src="${data.message}" style="max-width:200px;max-height:200px;cursor:pointer;" 
                         onclick="window.open('${data.message}','_blank')" />
                </div>
            </div>`;
    } else {
        html = `
            <div class="${isMe ? 'my-message' : 'other-message'}">
                <div class="${bubbleClass}">
                    <b>${data.sender}</b> ${data.message}
                </div>
            </div>`;
    }
    
    document.getElementById('chat').innerHTML += html;
    let chatBox = document.getElementById('chat');
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateChatTitle() {
    if (!room_info) return;
    let title = '';
    if (room_info.type === 'single') {
        let my_email= localStorage.getItem('email');
        let partner = (room_info.member_info || []).find(m => m.email !== my_email);
        if (partner) {
            title = `Chat with: ${partner.username}`;
        } else {
            title = "Chat";
        }
    } else if (room_info.type === 'group') {
        title = `Group: ${room_info.name}`;
    }
    document.getElementById('chatTitle').innerText = title;
}

function updateStatus() {
    if (!room_info) return;
    let status = '';
    if (room_info.type === 'single') {
        let my_email = localStorage.getItem('email');
        let partner = (room_info.member_info || []).find(m => m.email !== my_email);
        if (partner) {
            status = `Partner: ${partner.username} (${partner.email})`;
        }
    } else if (room_info.type === 'group') {
        // Yahan sirf naam dikhayein, sid nahi
        let names = (room_info.member_info || []).map(m => m.username).join(', ');
        status = `Members: ${names}`;
    }
    document.getElementById('status').innerText = status;
}

// Handle incoming chat request (for receiver)
socket.on('receive_chat_request', function(data) {
    const accept = confirm(`${data.sender_username} wants to chat with you. Accept?`);
    socket.emit('chat_request_response', {
        sender_email: data.sender_email,
        receiver_email: localStorage.getItem('email'),
        room_id: data.room_id,
        accepted: accept
    });
    if (!accept) {
        alert('You rejected the chat request.');
    }
});

// Toast notification
function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = 1;
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = 0;
        toast.style.transform = 'translateY(-40px)';
    }, 1800);
}

function addPartnerAsFriend() {
    if (!room_info || room_info.type !== 'single') return;
    let my_email = localStorage.getItem('email');
    let partner = (room_info.member_info || []).find(m => m.email !== my_email);
    if (partner && partner.email) {
        fetch('/add_friend', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_email: my_email, friend_email: partner.email })
        }).then(() => showToast('Friend added!'));
    }
}

function updateChatHeaderFriendBtn() {
    if (!room_info || room_info.type !== 'single') return;
    let btn = document.getElementById('addFriendBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'addFriendBtn';
        btn.textContent = 'Add Friend';
        btn.className = 'send-btn';
        btn.style.marginLeft = '16px';
        btn.onclick = addPartnerAsFriend;
        let header = document.querySelector('.chat-header-flex');
        if (header) header.appendChild(btn);
    }
}
