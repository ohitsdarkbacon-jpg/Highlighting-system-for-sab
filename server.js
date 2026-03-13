const WebSocket = require('ws');
const http = require('http');

// Create HTTP server (required for Render)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Script User Network WebSocket Server Running\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected script users
const scriptUsers = new Map(); // userId -> {ws, username, position, lastUpdate}

wss.on('connection', (ws) => {
    console.log('New script user connected');
    let currentUserId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'identify':
                    // Store user info
                    currentUserId = data.userId;
                    scriptUsers.set(data.userId, {
                        ws: ws,
                        username: data.username,
                        position: null,
                        lastUpdate: Date.now()
                    });
                    
                    console.log(`User identified: ${data.username} (${data.userId})`);
                    
                    // Send current user list to new user
                    const currentUsers = [];
                    for (let [id, user] of scriptUsers) {
                        if (id !== data.userId && user.position) {
                            currentUsers.push({
                                userId: id,
                                username: user.username,
                                position: user.position
                            });
                        }
                    }
                    
                    ws.send(JSON.stringify({
                        type: 'userList',
                        users: currentUsers
                    }));
                    
                    // Notify others about new user
                    for (let [id, user] of scriptUsers) {
                        if (id !== data.userId) {
                            user.ws.send(JSON.stringify({
                                type: 'userJoined',
                                userId: data.userId,
                                username: data.username
                            }));
                        }
                    }
                    break;
                    
                case 'position':
                    // Update user position
                    if (currentUserId) {
                        const user = scriptUsers.get(currentUserId);
                        if (user) {
                            user.position = data.position;
                            user.lastUpdate = Date.now();
                            
                            // Broadcast position to all other users
                            for (let [id, otherUser] of scriptUsers) {
                                if (id !== currentUserId) {
                                    otherUser.ws.send(JSON.stringify({
                                        type: 'positionUpdate',
                                        userId: currentUserId,
                                        username: user.username,
                                        position: data.position
                                    }));
                                }
                            }
                        }
                    }
                    break;
                    
                case 'ping':
                    // Keep-alive
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        if (currentUserId) {
            scriptUsers.delete(currentUserId);
            console.log(`User disconnected: ${currentUserId}`);
            
            // Notify other users
            for (let [id, user] of scriptUsers) {
                user.ws.send(JSON.stringify({
                    type: 'userLeft',
                    userId: currentUserId
                }));
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Clean up stale users (no update for 30 seconds)
setInterval(() => {
    const now = Date.now();
    for (let [id, user] of scriptUsers) {
        if (now - user.lastUpdate > 30000) {
            scriptUsers.delete(id);
            console.log(`Removed stale user: ${id}`);
            
            // Notify others
            for (let [_, otherUser] of scriptUsers) {
                otherUser.ws.send(JSON.stringify({
                    type: 'userLeft',
                    userId: id
                }));
            }
        }
    }
}, 10000);

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Script User Network WebSocket server running on port ${PORT}`);
});