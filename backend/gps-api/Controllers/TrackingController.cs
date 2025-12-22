using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TrackingAPI.Data;
using TrackingAPI.Hubs;
using TrackingAPI.Models;
using TrackingAPI.Dtos; // ✅ thêm DTO

namespace TrackingAPI.Controllers
{
    [Route("api/GPS_DeviceTracking")]
    [ApiController]
    public class TrackingController : ControllerBase
    {
        private readonly TrackingDbContext _context;
        private readonly IHubContext<LocationHub> _hubContext;

        public TrackingController(
            TrackingDbContext context,
            IHubContext<LocationHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok("Tracking API is alive!");
        }

        [HttpPost]
        public async Task<IActionResult> PostTracking(
            [FromBody] GPSDeviceTracking tracking)
        {
            if (tracking == null)
                return BadRequest("Invalid tracking payload.");

            // ⏱️ Chuẩn hoá thời gian (server là nguồn sự thật)
            if (tracking.RecordDate == default)
                tracking.RecordDate = DateTime.UtcNow.AddHours(7);

            // 1️ LUÔN lưu DB (offline hay realtime đều lưu)
            _context.GPS_DeviceTracking.Add(tracking);
            await _context.SaveChangesAsync();

            // ⭐ 2️ CHỈ phát SignalR nếu là realtime
            if (!tracking.IsOffline)
            {
                // Map Entity → DTO cho realtime
                var realtimeDto = new LocationRealtimeDto
                {
                    DeviceId = tracking.DeviceID,
                    UserName = tracking.UserName,
                    Latitude = tracking.Latitude,
                    Longitude = tracking.Longitude,
                    Timestamp = tracking.RecordDate
                };

                // Broadcast SignalR (DTO ONLY)
                await _hubContext
                    .Clients
                    .All
                    .SendAsync("ReceiveLocationUpdate", realtimeDto);
            }
            else
            {
                // 🔕 Offline data → KHÔNG broadcast
                // Chỉ lưu DB để phục vụ history / replay
            }

            // 3️ Response cho client gửi GPS (android / device)
            return Ok(new
            {
                message = tracking.IsOffline
                    ? "Inserted offline data (no realtime broadcast)"
                    : "Inserted & broadcasted realtime successfully",
                id = tracking.Oid
            });
        }
    }
}
