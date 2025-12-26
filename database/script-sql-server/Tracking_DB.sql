CREATE DATABASE TrackingDB;
GO
USE TrackingDB;
GO

/* =========================================================
   TABLE: Devices
   ========================================================= */
CREATE TABLE dbo.Devices (
    Id UNIQUEIDENTIFIER NOT NULL,
    UserName NVARCHAR(100) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    CreatedAt DATETIME2(7) NOT NULL,
GO

/* =========================================================
   TABLE: GPS_DeviceTracking
   ========================================================= */
CREATE TABLE dbo.GPS_DeviceTracking (
    Oid UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), -- Khóa chính dạng GUID
    DeviceID NVARCHAR(1000) NOT NULL,        
    Title NVARCHAR(100) NULL,                
    Latitude FLOAT NOT NULL,                 
    Longitude FLOAT NOT NULL,               
    RecordDate DATETIME NOT NULL,            
    OptimisticLockField INT NULL,            
    GCRecord INT NULL,                       
    UserName NVARCHAR(100) NULL,    
    IsOffline BIT NOT NULL          
);

