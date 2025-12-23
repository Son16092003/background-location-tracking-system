using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace TrackingAPI.Hubs
{
    [Authorize] // 🔥 BẮT BUỘC
    public class LocationHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            var user = Context.User?.Identity?.Name ?? "Anonymous";

            Console.WriteLine($"🔗 Client connected: {user} | {Context.ConnectionId}");

            await Clients.Caller.SendAsync("Connected", new
            {
                connectionId = Context.ConnectionId,
                user,
                connectedAt = DateTime.UtcNow
            });

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            Console.WriteLine($"❌ Client disconnected: {Context.ConnectionId}");
            await base.OnDisconnectedAsync(exception);
        }

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
