using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TrackingAPI.Data;
using TrackingAPI.Hubs;

var builder = WebApplication.CreateBuilder(args);

// =======================
// Services
// =======================

// Controllers + JSON camelCase
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
    });

// DbContext
builder.Services.AddDbContext<TrackingDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")
    )
);

// SignalR + camelCase payload
builder.Services
    .AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy =
            JsonNamingPolicy.CamelCase;
    });

// CORS – dùng cho Web Admin / SignalR
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            .SetIsOriginAllowed(_ => true); // ⚠️ dev / tunnel only
    });
});

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Logging (nếu bạn có package Serilog/File logging)
// builder.Logging.AddFile("Logs/tracking-{Date}.log");

var app = builder.Build();

// =======================
// Middleware
// =======================

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// ⚠️ Nếu dùng Cloudflare/ngrok HTTP → có thể comment dòng này
app.UseHttpsRedirection();

// ✅ Áp dụng CORS trước khi map SignalR Hub
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();

// SignalR Hub
app.MapHub<LocationHub>("/hubs/location");

app.Run();
