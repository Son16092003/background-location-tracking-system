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

            // 1️ Lưu DB (Entity)
            _context.GPS_DeviceTracking.Add(tracking);
            await _context.SaveChangesAsync();

            // 2️ Map Entity → DTO cho realtime
            var realtimeDto = new LocationRealtimeDto
            {
                DeviceId = tracking.DeviceID,
                UserName = tracking.UserName,
                Latitude = tracking.Latitude,
                Longitude = tracking.Longitude,
                Timestamp = tracking.RecordDate
            };

            // 3️ Broadcast SignalR (DTO ONLY)
            await _hubContext
                .Clients
                .All
                .SendAsync("ReceiveLocationUpdate", realtimeDto);

            // 4️ Response cho client gửi GPS (android / device)
            return Ok(new
            {
                message = "Inserted & broadcasted successfully",
                id = tracking.Oid
            });
        }
    }
}
