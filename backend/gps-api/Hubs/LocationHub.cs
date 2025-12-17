using Microsoft.AspNetCore.SignalR;

namespace TrackingAPI.Hubs
{
    public class LocationHub : Hub
    {
        // Khi client (web admin) kết nối
        public override async Task OnConnectedAsync()
        {
            Console.WriteLine($"🔗 Client connected: {Context.ConnectionId}");

            // Thông báo kết nối thành công cho client (optional)
            await Clients.Caller.SendAsync("Connected", new
            {
                connectionId = Context.ConnectionId,
                connectedAt = DateTime.UtcNow
            });

            await base.OnConnectedAsync();
        }

        // Khi client ngắt kết nối
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            Console.WriteLine($"❌ Client disconnected: {Context.ConnectionId}");
            await base.OnDisconnectedAsync(exception);
        }

        // 🔹 (OPTIONAL – dùng sau này)
        // Cho client join group theo deviceId / userId
        public async Task JoinGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            Console.WriteLine($"➕ {Context.ConnectionId} joined group {groupName}");
        }

        public async Task LeaveGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            Console.WriteLine($"➖ {Context.ConnectionId} left group {groupName}");
        }
    }
}
