// --- signalrClient.js ---
let connection = null;

export async function startSignalR(hubUrl, handlers = {}) {
  if (!hubUrl) throw new Error("❌ Hub URL is required");

  if (connection) {
    try {
      await connection.stop();
    } catch {}
    connection = null;
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      withCredentials: true, // 🔥 cookie login
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

  // Register handlers
  for (const [eventName, handler] of Object.entries(handlers)) {
    connection.on(eventName, (payload) => {
      console.debug(`[signalr] ${eventName}`, payload);
      try {
        handler(payload);
      } catch (err) {
        console.error(`[signalr] handler error`, err);
      }
    });
  }

  connection.onreconnecting((err) => {
    console.warn("⚠️ SignalR reconnecting:", err);
  });

  connection.onreconnected((id) => {
    console.log("🔁 SignalR reconnected:", id);
  });

  connection.onclose((err) => {
    console.warn("⚠️ SignalR closed:", err);
  });

  try {
    await connection.start();
    console.log("✅ SignalR connected:", hubUrl);
  } catch (err) {
    console.error("❌ SignalR connect failed:", err);
    setTimeout(() => startSignalR(hubUrl, handlers), 5000);
  }

  return connection;
}

export function getConnection() {
  return connection;
}
