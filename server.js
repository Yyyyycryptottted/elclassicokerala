const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// 1. Firebase Admin Initialization (Secure for Render & Local)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Reads from Render Environment Variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Falls back to local serviceAccountKey.json during local testing
    serviceAccount = require('./serviceAccountKey.json');
}

initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id
});

// Explicitly pass 'default' to match your Firestore database name instance
const db = getFirestore('default');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend files
app.use(express.static('public'));

// Load permanent votes from Firestore
let liveVotes = { barca: 0, madrid: 0 };
const votesDoc = db.collection('stats').doc('total_votes');

votesDoc.get().then((doc) => {
    if (doc.exists) {
        liveVotes = doc.data();
        console.log("Loaded votes from Firebase:", liveVotes);
    } else {
        votesDoc.set(liveVotes);
    }
}).catch(err => console.log("Error loading Firebase data:", err));

io.on('connection', (socket) => {
    console.log('A fan entered the stadium.');

    // 1. Send live votes
    socket.emit('updateVotes', liveVotes);

    // 2. Fetch and send recent chat history (last 30 messages)
    db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(30)
        .get()
        .then((snapshot) => {
            const history = [];
            snapshot.forEach((doc) => history.push(doc.data()));
            // Reverse so older messages show at the top and latest at the bottom
            history.reverse();
            socket.emit('loadChatHistory', history);
        })
        .catch(err => console.log("Error loading chat history:", err));

    // Handle incoming votes
    socket.on('castVote', (team) => {
        if (team === 'barca' || team === 'madrid') {
            liveVotes[team]++;
            io.emit('updateVotes', liveVotes);
            votesDoc.set(liveVotes).catch(err => console.log("Error saving vote:", err));
        }
    });

    // Handle incoming chat messages
    socket.on('sendMessage', async (messageData) => {
        const chatItem = {
            user: messageData.user || 'Fan',
            team: messageData.team || '',
            text: messageData.text,
            timestamp: Date.now() // Numeric timestamp for clean sorting
        };

        // Broadcast immediately so nobody waits
        io.emit('receiveMessage', chatItem);

        // Save permanently to Firestore in the background
        try {
            await db.collection('messages').add(chatItem);
        } catch (err) {
            console.error("Error saving chat message to Firestore:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log('A fan left the stadium.');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running live at http://localhost:${PORT}`);
});