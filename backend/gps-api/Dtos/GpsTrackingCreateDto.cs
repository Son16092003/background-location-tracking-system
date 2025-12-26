using System.ComponentModel.DataAnnotations;

namespace TrackingAPI.Dtos
{
    public class GpsTrackingCreateDto
    {
        [Required]
        public double Latitude { get; set; }

        [Required]
        public double Longitude { get; set; }

        public string? UserName { get; set; }

        public string? Title { get; set; }

        public DateTime? RecordDate { get; set; }

        public bool IsOffline { get; set; } = false;
    }
}
