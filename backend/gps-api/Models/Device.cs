using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TrackingAPI.Models
{
    [Table("Devices")] // 🔥 QUAN TRỌNG
    public class Device
    {
        [Key]
        public Guid Id { get; set; }

        [Required]
        [StringLength(100)]
        public string UserName { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string Title { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; }
    }
}
