using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TrackingAPI.Data;
using TrackingAPI.Models;

namespace TrackingAPI.Controllers
{
    [Route("api/device")]
    [ApiController]
    public class DeviceController : ControllerBase
    {
        private readonly TrackingDbContext _context;
        private readonly IConfiguration _configuration;

        public DeviceController(
            TrackingDbContext context,
            IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        // ============================
        // 🔓 ACTIVATE / RE-ACTIVATE DEVICE
        // ============================
        [AllowAnonymous]
        [HttpPost("activate")]
        public async Task<IActionResult> ActivateDevice(
            [FromBody] ActivateDeviceRequest request)
        {
            if (request == null)
                return BadRequest("Invalid request");

            if (string.IsNullOrWhiteSpace(request.DeviceId) ||
                string.IsNullOrWhiteSpace(request.UserName) ||
                string.IsNullOrWhiteSpace(request.Title))
            {
                return BadRequest("DeviceId, UserName and Title are required");
            }

            if (!Guid.TryParse(request.DeviceId, out var deviceId))
                return BadRequest("Invalid DeviceId format");

            // ============================
            // 1️⃣ FIND OR CREATE DEVICE
            // ============================
            var device = await _context.Devices.FindAsync(deviceId);

            if (device == null)
            {
                device = new Device
                {
                    Id = deviceId,
                    UserName = request.UserName,
                    Title = request.Title,
                    CreatedAt = DateTime.UtcNow.AddHours(7)
                };

                _context.Devices.Add(device);
                await _context.SaveChangesAsync();
            }

            // ============================
            // 2️⃣ GENERATE JWT
            // ============================
            var token = GenerateDeviceJwt(device);

            // ============================
            // 3️⃣ RESPONSE
            // ============================
            return Ok(new
            {
                deviceId = device.Id,
                token
            });
        }

        // ============================
        // 🔐 JWT GENERATOR
        // ============================
        private string GenerateDeviceJwt(Device device)
        {
            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, "device"),
                new Claim("deviceId", device.Id.ToString()),
                new Claim("userName", device.UserName),
                new Claim("title", device.Title),
                new Claim(JwtRegisteredClaimNames.Iat,
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                    ClaimValueTypes.Integer64)
            };

            var secretKey = _configuration["Jwt:SecretKey"]
            ?? throw new Exception("Jwt:SecretKey is missing");

            var issuer = _configuration["Jwt:Issuer"];
            var audience = _configuration["Jwt:Audience"];
            var expireMinutes =
                int.Parse(_configuration["Jwt:AccessTokenExpirationMinutes"]!);

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(secretKey)
            );

            var creds = new SigningCredentials(
                key, SecurityAlgorithms.HmacSha256
            );

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(expireMinutes),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    // ============================
    // 📦 DTO
    // ============================
    public class ActivateDeviceRequest
    {
        public string DeviceId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
    }
}
