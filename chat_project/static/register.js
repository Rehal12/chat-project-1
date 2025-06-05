function registerUser() {
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    if (!username) {
        alert("Please enter your name.");
        return;
    }
    if (!email) {
        alert("Please enter your email.");
        return;
    }
    fetch('/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: username, email: email})
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('username', username);
            localStorage.setItem('email', email);
            window.location.href = "/home";
        } else {
            alert(data.error || "Registration failed.");
        }
    });
}