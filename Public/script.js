// Use local chat behavior when no live Socket.io server is configured.
const socket = typeof io === 'function' ? io() : null;

// --- AUTH & SETUP ---
let currentUser = { name: "", team: "" };
let isLoggedIn = false;
let userTickets = 0;

window.onload = function() {
    const savedName = localStorage.getItem("elclassico_username");
    const savedTeam = localStorage.getItem("elclassico_team");
    userTickets = parseInt(localStorage.getItem("elclassico_tickets")) || 0;

    if (savedName && savedTeam) {
        currentUser.name = savedName;
        currentUser.team = savedTeam;
        isLoggedIn = true;

        const loginBtn = document.getElementById('nav-login-btn');
        if (loginBtn) {
            loginBtn.innerText = "Logout";
            loginBtn.href = "#";
            loginBtn.onclick = logoutUser;
        }

        // Setup Chat Page UI if logged in
        if (document.getElementById('chat-input-area')) {
            document.getElementById('chat-input-area').style.display = 'flex';
            document.getElementById('ticket-bar').style.display = 'flex';
            updateTicketUI();
        }
    } else {
        // Hide chat inputs and ticket bar if not logged in
        if (document.getElementById('chat-input-area')) {
            document.getElementById('chat-input-area').style.display = 'none';
            document.getElementById('ticket-bar').style.display = 'none';
        }
    }
};

function logoutUser() {
    localStorage.removeItem("elclassico_username");
    localStorage.removeItem("elclassico_team");
    window.location.reload(); 
}

// --- VOTING SYSTEM ---
function castVote(team) {
    if (team !== 'barca' && team !== 'madrid') return;

    if (localStorage.getItem('elclassico_has_voted')) {
        alert("You have already voted! One fan, one vote.");
        window.location.href = "result.html";
        return;
    }

    // Send vote to live server
    if (socket) {
        socket.emit('castVote', team);
    } else {
        console.warn("Socket.io not connected. Vote saved locally only.");
    }

    // Save to local storage to lock out future votes
    localStorage.setItem('elclassico_has_voted', 'true');

    setTimeout(() => {
        if (team === 'madrid') {
            alert("Hala Madrid! 🤍👑 Thanks for voting.");
        } else if (team === 'barca') {
            alert("Visca el Barça! 💙❤️ Thanks for voting.");
        }
        window.location.href = "result.html";
    }, 100);
}

// Listen for live vote updates across all connected windows
if (socket) {
    socket.on('updateVotes', (votes) => {
        const total = votes.barca + votes.madrid;
        let barcaPercentage = total === 0 ? 50 : Math.round((votes.barca / total) * 100);
        let madridPercentage = total === 0 ? 50 : Math.round((votes.madrid / total) * 100);

        // Update Progress Bars on Index or Result pages
        const barcaBar = document.getElementById('barca-bar');
        const madridBar = document.getElementById('madrid-bar');

        if (barcaBar && madridBar) {
            barcaBar.style.width = barcaPercentage + '%';
            madridBar.style.width = madridPercentage + '%';
            
            const barcaText = document.getElementById('barca-text');
            const madridText = document.getElementById('madrid-text');

            if (barcaText && madridText) {
                barcaText.innerText = barcaPercentage + '%';
                madridText.innerText = madridPercentage + '%';
            } else {
                barcaBar.innerText = barcaPercentage + '%';
                madridBar.innerText = madridPercentage + '%';
            }

            const totalVotesEl = document.getElementById('total-votes');
            if (totalVotesEl) totalVotesEl.innerText = `Total Votes: ${total}`;
        }
    });
}

// --- CHAT & TICKET SYSTEM ---
function updateTicketUI() {
    const countDisplay = document.getElementById('ticket-count');
    if (countDisplay) countDisplay.innerText = userTickets;
}

function watchAd() {
    const overlay = document.getElementById('ad-overlay');
    const timerText = document.getElementById('ad-timer');
    const watchAdButton = document.querySelector('.watch-ad-btn');

    if (!overlay || !timerText || watchAdButton?.disabled) return;
    
    watchAdButton.disabled = true;
    overlay.style.display = 'flex';
    let timeLeft = 5;
    timerText.innerText = timeLeft;

    const adInterval = setInterval(() => {
        timeLeft--;
        timerText.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(adInterval);
            overlay.style.display = 'none';
            userTickets++;
            localStorage.setItem("elclassico_tickets", userTickets);
            updateTicketUI();
            watchAdButton.disabled = false;
            alert("Thanks for watching! You earned 1 Ticket 🎟️");
        }
    }, 1000);
}

function sendMessage() {
    const inputField = document.getElementById('chat-input');
    const messageText = inputField.value.trim();

    if (messageText !== "") {
        if (userTickets <= 0) {
            alert("You need a ticket to send a message! Please watch an ad. 📺");
            return;
        }

        userTickets--;
        localStorage.setItem("elclassico_tickets", userTickets);
        updateTicketUI(); 

        if (socket) {
            socket.emit('sendMessage', {
                user: currentUser.name,
                team: currentUser.team,
                text: messageText
            });
        } else {
            const chatBox = document.getElementById('chat-box');
            const newMessage = document.createElement('div');
            newMessage.className = 'message';
            newMessage.innerHTML = `<span class="user" style="color:#e2b026;">${currentUser.name || 'You'}:</span> ${messageText}`;
            chatBox.appendChild(newMessage);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        
        inputField.value = ""; 
    }
}

function handleKeyPress(event) {
    if (event.key === "Enter") sendMessage();
}

// Receive single new message in real-time
if (socket) {
    socket.on('receiveMessage', (data) => {
        const chatBox = document.getElementById('chat-box');
        if (!chatBox) return;
        
        const newMessage = document.createElement('div');
        newMessage.className = 'message';
        
        const userColor = data.team === 'Barca' ? '#FFED02' : '#ffffff';
        const teamBadge = data.team === 'Barca' ? '🔵🔴' : '⚪👑';
        
        newMessage.innerHTML = `<span class="user" style="color:${userColor};">${data.user} ${teamBadge}:</span> ${data.text}`;
        
        chatBox.appendChild(newMessage);
        chatBox.scrollTop = chatBox.scrollHeight; 
    });

    // --- Load Chat History from Firestore ---
    socket.on('loadChatHistory', (messages) => {
        const chatBox = document.getElementById('chat-box');
        if (!chatBox) return; 

        // Reset chat box to welcome banner before loading history
        chatBox.innerHTML = '<div class="message"><span class="user" style="color: #888;">System:</span> Welcome! You need 1 Ticket 🎟️ to send a message.</div>';

        // Render past messages from Firestore
        messages.forEach((data) => {
            const newMessage = document.createElement('div');
            newMessage.className = 'message';
            const userColor = data.team === 'Barca' ? '#FFED02' : '#ffffff';
            const teamBadge = data.team === 'Barca' ? '🔵🔴' : '⚪👑';

            newMessage.innerHTML = `<span class="user" style="color:${userColor};">${data.user} ${teamBadge}:</span> ${data.text}`;
            chatBox.appendChild(newMessage);
        });

        // Auto-scroll to the bottom of the conversation
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}