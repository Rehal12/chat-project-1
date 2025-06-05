import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, join_room, emit
import uuid
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['UPLOAD_FOLDER'] = 'static/uploads'

socketio = SocketIO(app, async_mode='eventlet')

connected_users = {}  
online_users = {}     #coming soon 
rooms = {}            
messages = {}      

# --- Friend System ---
friends = {}  # friends[email] = [friend_email, ...]

def add_friend(user_email, friend_email):
    if user_email not in friends:
        friends[user_email] = []
    if friend_email not in friends[user_email]:
        friends[user_email].append(friend_email)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def register():
    return render_template('register.html')

@app.route('/home')
def home():
    return render_template('home.html')

@app.route('/chat')
def chat():
    return render_template('chat.html')

@app.route('/register', methods=['POST'])
def register_user():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    if not username or not email:
        return jsonify({'success': False, 'error': 'Username and Email required'}), 400
    # Save user info (aap apni storage logic yahan laga sakte hain)
    connected_users[email] = username
    online_users[email] = {'username': username}
    emit_online_users()
    return jsonify({'success': True})

@app.route('/create_room', methods=['POST'])
def create_room():
    data = request.json
    email = data.get('email')
    chat_type = data.get('chat_type')
    partner_email = data.get('partner_email', None)
    group_name = data.get('group_name', None)
    username = data.get('username', None)

    if chat_type == 'single':
        if not partner_email or not email:
            return jsonify({'success': False, 'error': 'Both emails required'}), 400
        room_id = '_'.join(sorted([email, partner_email]))
        rooms[room_id] = {
            'type': 'single',
            'members': [email, partner_email],
            'member_names': {email: username},
            'name': None
        }
        if username and email not in connected_users:
            connected_users[email] = username
            online_users[email] = {'username': username}
        return jsonify({'success': True, 'room_id': room_id})

    # ...group logic yahan...

@app.route('/join_room', methods=['POST'])
def join_room_api():
    data = request.json
    email = data.get('email')
    partner_email = data.get('partner_email')
    room_id = data.get('room_id')
    username = data.get('username')

    if room_id not in rooms:
        return jsonify({'success': False, 'error': 'Room not found'}), 404

    if email not in rooms[room_id]['members']:
        rooms[room_id]['members'].append(email)
    if 'member_names' not in rooms[room_id]:
        rooms[room_id]['member_names'] = {}
    if username:
        rooms[room_id]['member_names'][email] = username

    room_info = {
        'room_id': room_id,
        'type': rooms[room_id]['type'],
        'name': rooms[room_id].get('name', ''),
        'member_info': [
            {'email': member_email, 'username': rooms[room_id]['member_names'].get(member_email, member_email)}
            for member_email in rooms[room_id]['members']
        ]
    }
    return jsonify({'success': True, 'room_id': room_id, 'room_info': room_info})

# upload image wala system laage jo data java scrip yani chat..js se upload image se aa rhi he . jo uplaod ffolder me rkhi he and waha se lekr chat per show hoag 
@app.route('/upload_image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image part'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)
    return jsonify({'success': True, 'url': f'/static/uploads/{filename}'})

# --- Chat History ---
@app.route('/get_history', methods=['POST'])
def get_history():
    data = request.json
    room_id = data.get('room_id')
    return jsonify({'success': True, 'messages': messages.get(room_id, [])})

# --- Group Chat ---
@app.route('/create_group', methods=['POST'])
def create_group():
    data = request.json
    group_name = data.get('group_name')
    creator_email = data.get('email')
    username = data.get('username')
    if not group_name or not creator_email:
        return jsonify({'success': False, 'error': 'Group name and creator required'})
    group_id = f"group_{uuid.uuid4().hex[:8]}"
    rooms[group_id] = {
        'type': 'group',
        'members': [creator_email],
        'member_names': {creator_email: username},
        'name': group_name
    }
    return jsonify({'success': True, 'group_id': group_id, 'group_name': group_name})

@app.route('/join_group', methods=['POST'])
def join_group():
    data = request.json
    group_id = data.get('group_id')
    email = data.get('email')
    username = data.get('username')
    if group_id not in rooms or rooms[group_id]['type'] != 'group':
        return jsonify({'success': False, 'error': 'Group not found'})
    if email not in rooms[group_id]['members']:
        rooms[group_id]['members'].append(email)
    rooms[group_id]['member_names'][email] = username
    return jsonify({'success': True, 'group_id': group_id, 'group_name': rooms[group_id]['name']})

@app.route('/search_user', methods=['POST'])
def search_user():
    data = request.json
    query = data.get('query', '').lower()
    results = []
    for email, username in connected_users.items():
        if query in email.lower() or query in username.lower():
            results.append({'email': email, 'username': username})
    return jsonify({'success': True, 'users': results})

@app.route('/get_group_info', methods=['POST'])
def get_group_info():
    data = request.json
    group_id = data.get('group_id')
    if group_id in rooms and rooms[group_id]['type'] == 'group':
        return jsonify({'success': True, 'group_id': group_id, 'group_name': rooms[group_id]['name']})
    return jsonify({'success': False, 'error': 'Group not found'})

@app.route('/add_friend', methods=['POST'])
def add_friend_api():
    data = request.json
    user_email = data.get('user_email')
    friend_email = data.get('friend_email')
    if not user_email or not friend_email:
        return jsonify({'success': False, 'error': 'Both emails required'}), 400
    add_friend(user_email, friend_email)
    add_friend(friend_email, user_email)
    return jsonify({'success': True})

@app.route('/get_friends', methods=['POST'])
def get_friends_api():
    data = request.json
    user_email = data.get('user_email')
    if not user_email:
        return jsonify({'success': False, 'error': 'Email required'}), 400
    return jsonify({'success': True, 'friends': friends.get(user_email, [])})

# SocketIO  yaha per bataeye hein jaha per user coonect dissconet  send msgs join room 

@socketio.on('connect')
def on_connect():
    sid = request.sid
    print(f'User connected: {sid}')

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    print(f'User disconnected: {sid}')
    emit_online_users()

@socketio.on('join_room')
def on_join(data):
    room_id = data.get('room_id')
    sid = request.sid
    username = data.get('username')

    if room_id not in rooms:
        return emit('error', {'error': 'Room does not exist'})

    if sid not in rooms[room_id]['members']:
        rooms[room_id]['members'].append
    if 'member_names' not in rooms[room_id]:
        rooms[room_id]['member_names'] = {}
    if username:
        rooms[room_id]['member_names'][sid] = username

    join_room(room_id)

    room = rooms.get(room_id, {})
    member_info = [
        {'sid': member_sid, 'username': rooms[room_id]['member_names'].get(member_sid, member_sid)}
        for member_sid in room.get('members', [])
    ]
    emit('room_info', {
        'room_id': room_id,
        'type': room['type'],
        'name': room.get('name', ''),
        'member_info': member_info
    }, room=room_id)

@socketio.on('send_message')
def handle_message(data):
    room_id = data.get('room_id')
    message = data.get('message')
    sender = data.get('sender')
    msg_type = data.get('type', 'text')  # Default to 'text' if not specified

    if room_id not in messages:
        messages[room_id] = []

    messages[room_id].append({
        'sender': sender, 
        'message': message,
        'type': msg_type
    })
    
    emit('new_message', {
        'sender': sender, 
        'message': message,
        'type': msg_type
    }, room=room_id)

# --- Chat Request System ---
@socketio.on('chat_request')
def handle_chat_request(data):
    sender_email = data.get('sender_email')
    sender_username = data.get('sender_username')
    receiver_email = data.get('receiver_email')
    room_id = data.get('room_id')
    print(f'[SOCKET] chat_request: {sender_email=} {sender_username=} {receiver_email=} {room_id=}')
    # Always check and update sender info
    if sender_email and sender_username:
        connected_users[sender_email] = sender_username
        online_users[sender_email] = {'username': sender_username}
    # Notify the receiver if online
    if receiver_email in online_users:
        print(f'[SOCKET] Emitting receive_chat_request to room: {receiver_email}')
        emit('receive_chat_request', {
            'sender_email': sender_email,
            'sender_username': sender_username,
            'room_id': room_id
        }, room=receiver_email)
    else:
        print(f'[SOCKET] chat_request_failed: {receiver_email} not online')
        emit('chat_request_failed', {'error': 'User is not online'}, room=sender_email)

@socketio.on('chat_request_response')
def handle_chat_request_response(data):
    sender_email = data.get('sender_email')
    receiver_email = data.get('receiver_email')
    room_id = data.get('room_id')
    accepted = data.get('accepted')
    if accepted:
        # Add both users to the room if not already present
        if room_id not in rooms:
            rooms[room_id] = {
                'type': 'single',
                'members': [sender_email, receiver_email],
                'member_names': {},
                'name': None
            }
        for email in [sender_email, receiver_email]:
            if email not in rooms[room_id]['members']:
                rooms[room_id]['members'].append(email)
        emit('chat_request_accepted', {'room_id': room_id}, room=sender_email)
        emit('chat_request_accepted', {'room_id': room_id}, room=receiver_email)
    else:
        emit('chat_request_rejected', {'room_id': room_id}, room=sender_email)

@socketio.on('register_email')
def handle_register_email(data):
    email = data.get('email')
    username = data.get('username')
    print(f'[SOCKET] register_email: {email=} {username=}')
    if email:
        join_room(email)
        print(f'[SOCKET] Joined room: {email}')
        # Always update username mapping
        connected_users[email] = username or connected_users.get(email, email)
        online_users[email] = {'username': username or connected_users.get(email, email)}
        emit_online_users()

@socketio.on('friend_request')
def handle_friend_request(data):
    sender_email = data.get('sender_email')
    sender_username = data.get('sender_username')
    receiver_email = data.get('receiver_email')
    print(f'[SOCKET] friend_request: {sender_email=} {sender_username=} {receiver_email=}')
    # Always check and update sender info
    if sender_email and sender_username:
        connected_users[sender_email] = sender_username
        online_users[sender_email] = {'username': sender_username}
    if receiver_email in online_users:
        print(f'[SOCKET] Emitting receive_friend_request to room: {receiver_email}')
        emit('receive_friend_request', {
            'sender_email': sender_email,
            'sender_username': sender_username
        }, room=receiver_email)
    else:
        print(f'[SOCKET] friend_request_failed: {receiver_email} not online')
        emit('friend_request_failed', {'error': 'User is not online'}, room=sender_email)

@socketio.on('friend_request_response')
def handle_friend_request_response(data):
    sender_email = data.get('sender_email')
    receiver_email = data.get('receiver_email')
    accepted = data.get('accepted')
    receiver_username = connected_users.get(receiver_email, receiver_email)
    if accepted:
        # Notify sender of acceptance
        emit('friend_request_accepted', {
            'receiver_email': receiver_email,
            'receiver_username': receiver_username
        }, room=sender_email)
    else:
        emit('friend_request_rejected', {
            'receiver_email': receiver_email,
            'receiver_username': receiver_username
        }, room=sender_email)

def emit_online_users():#coming feature 
    users_list = []
    for sid, info in online_users.items():
        users_list.append({
            'sid': sid,
            'username': info['username'],
        })
    socketio.emit('online_users', users_list) # flaship banega 

def get_local_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"\nOpen this on other devices: http://{local_ip}:5000/\n")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)