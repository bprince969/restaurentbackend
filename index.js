const app = require("./src/app");
const { createServer } = require("http");
const WebSocket = require("ws");
const { CONFIG } = require("./src/config");
const { getTenantIdFromQRCode } = require("./src/services/settings.service");

const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server: httpServer });

// Map to store tenant-specific connections
const tenantRooms = new Map();

wss.on("connection", (ws, req) => {
    console.log("New client connected");

    ws.on("message", async (message) => {
        try {
            const { event, payload, tenantId, qrcode } = JSON.parse(message);

            switch (event) {
                case "authenticate":
                    if (!tenantRooms.has(tenantId)) {
                        tenantRooms.set(tenantId, new Set());
                    }
                    tenantRooms.get(tenantId).add(ws);
                    console.log(`Client joined room: ${tenantId}`);
                    break;

                case "new_order_backend":
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
        tenantRooms.forEach((clients, tenantId) => {
            clients.delete(ws);
            if (clients.size === 0) {
                tenantRooms.delete(tenantId);
            }
        });
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server started on PORT: ${PORT}`);
});
