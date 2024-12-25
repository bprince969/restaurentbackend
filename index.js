const app = require("./src/app");
const { createServer } = require("http");
const WebSocket = require("ws");
const { CONFIG } = require("./src/config");
const { getTenantIdFromQRCode } = require("./src/services/settings.service");

const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({
    server: httpServer,
    path: "/socket.io/",  // Set the correct endpoint for WebSocket communication
});

// Map to store tenant-specific connections
const tenantRooms = new Map();

wss.on("connection", (ws, req) => {
    console.log("New client connected");

    ws.on("message", async (message) => {
        try {
            const { event, payload, tenantId, qrcode } = JSON.parse(message);

            switch (event) {
                case "authenticate":
                    // Add the client to the tenant's room (if not already added)
                    if (!tenantRooms.has(tenantId)) {
                        tenantRooms.set(tenantId, new Set());
                    }
                    tenantRooms.get(tenantId).add(ws);
                    console.log(`Client joined room: ${tenantId}`);
                    break;

                case "new_order_backend":
                    // Broadcast the new order to all clients in the tenant's room
                    if (tenantRooms.has(tenantId)) {
                        tenantRooms.get(tenantId).forEach((client) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ event: "new_order", payload }));
                            }
                        });
                    }
                    break;

                case "new_qrorder_backend":
                    try {
                        const resolvedTenantId = await getTenantIdFromQRCode(qrcode);
                        // Broadcast the QR code order to the corresponding tenant's room
                        if (tenantRooms.has(resolvedTenantId)) {
                            tenantRooms.get(resolvedTenantId).forEach((client) => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ event: "new_qrorder", payload }));
                                }
                            });
                        }
                    } catch (error) {
                        console.error("Error resolving tenant ID from QR code:", error);
                    }
                    break;

                case "order_update_backend":
                    // Broadcast order updates to all clients in the tenant's room
                    if (tenantRooms.has(tenantId)) {
                        tenantRooms.get(tenantId).forEach((client) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ event: "order_update", payload }));
                            }
                        });
                    }
                    break;

                default:
                    console.warn("Unknown event:", event);
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        // Clean up the tenantRooms map
        tenantRooms.forEach((clients, tenantId) => {
            clients.delete(ws);
            if (clients.size === 0) {
                tenantRooms.delete(tenantId);
            }
        });
    });
});

// Start HTTP server with WebSocket support
httpServer.listen(PORT, () => {
    console.log(`Server started on PORT: ${PORT}`);
});
