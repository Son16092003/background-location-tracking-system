namespace TrackingAPI.Dtos
{
    public class LocationRealtimeDto
    {
        public string DeviceId { get; set; } = null!;
        public string UserName { get; set; } = null!;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
