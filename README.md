\# Background Location Tracking System



A system for tracking device location in real time using Android background services, Web API, and Web Admin dashboard.



---



\## 📌 Overview



This project provides a complete solution for background GPS tracking on Android devices.  

The system collects location data from Android devices and sends it to a backend API, where the data is stored and displayed in real time via a web-based admin dashboard.



---



\## 🧩 System Components



\- \*\*Android App\*\*

&nbsp; - Runs as a background/foreground service

&nbsp; - Uses Google Fused Location Provider

&nbsp; - Sends GPS data periodically to the backend API



\- \*\*Backend API\*\*

&nbsp; - Built with ASP.NET Core

&nbsp; - Handles authentication and data processing

&nbsp; - Pushes real-time updates using SignalR

&nbsp; - Stores data in SQL Server



\- \*\*Web Admin\*\*

&nbsp; - Web-based dashboard

&nbsp; - Displays real-time device location and history

&nbsp; - Used by administrators for monitoring



\- \*\*Database\*\*

&nbsp; - SQL Server

&nbsp; - Stores device, location, and tracking logs



---



\## 🏗 Project Structure



```text

mobile/

&nbsp;└── android/



backend/

&nbsp;└── gps-device-api/



frontend/

&nbsp;└── web-admin/



database/

&nbsp;└── sql-server/



scripts/

&nbsp;└── adb/



