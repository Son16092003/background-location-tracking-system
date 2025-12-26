using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using TrackingAPI.Data;
using TrackingAPI.Hubs;
using TrackingAPI.Models;
using TrackingAPI.Dtos;

namespace TrackingAPI.Controllers
{
    [Route("api/GPS_DeviceTracking")]
    [ApiController]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)] // 🔐 JWT DEVICE
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

        // ============================
        // 🔓 Health check
        // ============================
        [AllowAnonymous]
        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok("Tracking API is alive!");
        }

        // ============================
        // 📡 POST GPS DATA (JWT DEVICE)
        // ============================
        [HttpPost]
        public async Task<IActionResult> PostTracking(
            [FromBody] GpsTrackingCreateDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // ============================
            // 🔐 LẤY DEVICE ID TỪ JWT
            // ============================
            var deviceId = User.FindFirst("deviceId")?.Value;
            if (string.IsNullOrEmpty(deviceId))
                return Unauthorized("Invalid device token.");

            // ============================
            // MAP DTO → ENTITY
            // ============================
            var tracking = new GPSDeviceTracking
            {
                Oid = Guid.NewGuid(),
                DeviceID = deviceId,          // 🔥 LUÔN từ JWT
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                UserName = dto.UserName,
                Title = dto.Title,
                IsOffline = dto.IsOffline,
                RecordDate = dto.RecordDate ?? DateTime.UtcNow.AddHours(7)
            };

            // ============================
            // 1️⃣ LUÔN LƯU DB
            // ============================
            _context.GPS_DeviceTracking.Add(tracking);
            await _context.SaveChangesAsync();

            // ============================
            // 2️⃣ SIGNALR REALTIME
            // ============================
            if (!tracking.IsOffline)
            {
                var realtimeDto = new LocationRealtimeDto
                {
                    DeviceId = tracking.DeviceID,
                    UserName = tracking.UserName ?? string.Empty,
                    Latitude = tracking.Latitude,
                    Longitude = tracking.Longitude,
                    Timestamp = tracking.RecordDate
                };

                await _hubContext.Clients.All
                    .SendAsync("ReceiveLocationUpdate", realtimeDto);
            }

            // ============================
            // 3️⃣ RESPONSE
            // ============================
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
