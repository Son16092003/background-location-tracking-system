// --- main.js ---
import { createMap } from "./map/mapInit.js";
import { devices, getColorFromId, updateDeviceList } from "./map/devices.js";
import { startIcon, pauseIcon, liveIcon, endIcon } from "./map/icons.js";
import { startSignalR } from "./signalrClient.js";
import { checkLogin, logout } from "./auth.js";
import { API_BASE } from "./config.js";

// URL của SignalR Hub (.NET Web API)
const HUB_URL = `${API_BASE}/hubs/location`;

let mapLive = null;
let mapSummary = null;

// Auto-fit configuration and debounce timer
let _autoFitTimer = null;
const autoFitConfig = {
  delay: 2000, // ms debounce for non-immediate fits
  padding: [50, 50], // pixels padding passed to fitBounds
  onlyFitWhenToggled: true, // if true, only fit when a device is toggled on (or explicit 'toggle' reason). Set to true so updates don't re-center map.
  minDevices: 1, // minimum number of devices to trigger fitBounds (if >1 will only fit bounds)
  singleDeviceZoom: 16, // zoom level when centering a single device
};

// Expose a runtime API to adjust auto-fit behavior
window.setAutoFitOptions = function (opts = {}) {
  Object.assign(autoFitConfig, opts || {});
  console.info("[main] autoFitConfig updated:", autoFitConfig);
};

window.getAutoFitOptions = function () {
  return Object.assign({}, autoFitConfig);
};

// Allow other modules or console to trigger fit
window.fitMapToActiveDevices = function (reason) {
  try {
    autoFitActiveDevices(reason);
  } catch (e) {
    console.error("[main] fitMapToActiveDevices error", e);
  }
};

window.saveDeviceVisibility = saveDeviceVisibility; // để devices.js có thể gọi

// ================================================
// 1️⃣ Khởi tạo map & tab giao diện
// ================================================
document.addEventListener("DOMContentLoaded", async () => {
  await checkLogin(); // 🔐 đợi xác thực xong mới cho load app

  // LOGOUT BUTTON
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      console.log("Logout clicked");
    });
  }

  // Tạo 2 map Leaflet
  mapLive = createMap("map-live");
  mapSummary = createMap("map-summary");

  // Leaflet sometimes needs an explicit invalidateSize after the container is laid out
  // give the browser a tick to finish layout then invalidate
  setTimeout(() => {
    try {
      mapLive?.invalidateSize();
    } catch (e) {
      console.warn("Could not invalidate mapLive size", e);
    }
  }, 200);

  // Tab switching
  const tabLive = document.getElementById("tab-live");
  const tabSummary = document.getElementById("tab-summary");

  tabLive.addEventListener("click", () => switchTab("live"));
  tabSummary.addEventListener("click", () => switchTab("summary"));

  // Hướng dẫn dialog
  const guideBtn = document.getElementById("btn-guide");
  const guideDialog = document.getElementById("guide-dialog");
  const closeGuide = document.getElementById("close-guide");
  guideBtn.onclick = () => (guideDialog.style.display = "flex");
  closeGuide.onclick = () => (guideDialog.style.display = "none");

  // Load trạng thái hiển thị thiết bị từ localStorage
  loadDeviceVisibility();

  // Khôi phục trạng thái thiết bị (last known positions) từ localStorage
  restoreDevicesFromStorage();

  // After restoring from storage, ensure map layout is ready and fit to active devices
  setTimeout(() => {
    try {
      mapLive?.invalidateSize();
    } catch (e) {}
    try {
      // On refresh we want to fit to all devices present on the interface
      fitMapToAllDevices();
    } catch (e) {
      console.warn("[main] fitMapToAllDevices after restore failed", e);
    }
  }, 300);

  // Kết nối SignalR realtime
  initSignalR();
});

function switchTab(tab) {
  const liveMap = document.getElementById("map-live");
  const summaryMap = document.getElementById("map-summary");
  const liveSidebar = document.getElementById("live-sidebar");
  const summarySidebar = document.getElementById("summary-sidebar");
  const tabLive = document.getElementById("tab-live");
  const tabSummary = document.getElementById("tab-summary");

  if (tab === "live") {
    tabLive.classList.add("active");
    tabSummary.classList.remove("active");
    liveMap.style.display = "block";
    summaryMap.style.display = "none";
    liveSidebar.style.display = "block";
    summarySidebar.style.display = "none";
  } else {
    tabSummary.classList.add("active");
    tabLive.classList.remove("active");
    summaryMap.style.display = "block";
    liveMap.style.display = "none";
    summarySidebar.style.display = "block";
    liveSidebar.style.display = "none";
  }

  // Invalidate sizes for whichever map is now visible (allow layout)
  setTimeout(() => {
    try {
      if (tab === "live") {
        mapLive?.invalidateSize();
      } else {
        mapSummary?.invalidateSize();
      }
    } catch (e) {
      console.warn("Could not invalidate map size after tab switch", e);
    }
  }, 150);
}

// ================================================
// 2️⃣ SignalR handlers (clean version)
// ================================================
let signalRStarted = false;

function initSignalR() {
  if (signalRStarted) {
    console.warn("[main] SignalR already started, skip init");
    return;
  }
  signalRStarted = true;

  const handlers = {
    ReceiveLocationUpdate: (data) => {
      if (!data) return;
      console.debug("[main] ReceiveLocationUpdate payload:", data);
      onSignalRLocationReceived(data);
    },

    Connected: (payload) => {
      console.info("[main] server -> connected:", payload);
    },
  };

  startSignalR(HUB_URL, handlers)
    .then(() => console.log("[main] SignalR connected"))
    .catch((err) => console.error("[main] SignalR error", err));
}

function onSignalRLocationReceived(payload) {
  // 1️⃣ Bắt buộc phải có timestamp
  const timestamp = parseTimestamp(payload.timestamp);
  if (!timestamp) {
    console.warn("[gate] Missing timestamp, drop", payload);
    return;
  }

  // 2️⃣ Chỉ nhận data trong thời gian LIVE (ví dụ ≤ 10s)
  const now = Date.now();
  const diffMs = Math.abs(now - timestamp.getTime());

  if (diffMs > 15_000) {
    console.warn(
      "[gate] Non-realtime payload dropped",
      "diff(ms):",
      diffMs,
      payload
    );
    return;
  }

  // 3️⃣ OK → mới cho đi vào map live
  console.log("Payload received:", payload);
  handleRealtimeTracking(payload);
}


// ================================================
// 3️⃣ Xử lý sự kiện Realtime từ Hub
// ================================================
function handleRealtimeTracking(data) {
  /* ===============================
   * 1. Parse payload
   * =============================== */
  const deviceId = data.deviceId;
  const userName = data.userName;
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const timestamp = parseTimestamp(data.timestamp);
  const isOfflinePayload = data.isOffline === true; // ⭐ QUYẾT ĐỊNH SỐ PHẬN

  if (!deviceId || isNaN(latitude) || isNaN(longitude) || !timestamp) {
    return;
  }

  /* =====================================================
   * ⛔ OFFLINE → MAP LIVE KHÔNG QUAN TÂM
   * ===================================================== */
  if (isOfflinePayload) {
    // ❌ Không tạo device
    // ❌ Không lưu coords
    // ❌ Không vẽ trail
    // ❌ Không update marker
    // ❌ Không autoFit
    // ❌ Không update UI
    return;
  }

  /* ===============================
   * 2. Get or create device (REALTIME ONLY)
   * =============================== */
  let device = devices[deviceId];
  const isNewDevice = !device;

  if (!device) {
    device = {
      deviceId,
      userName,
      color: getColorFromId(deviceId),
      coords: [],
      trailMarkers: [],
      visible: true,
      isOffline: false,
      lastTimestamp: null,
      status: "realtime",
    };
    devices[deviceId] = device;
  }

  /* ===============================
   * 3. Drop out-of-order realtime
   * =============================== */
  if (device.lastTimestamp && timestamp <= device.lastTimestamp) {
    return;
  }

  const latLng = L.latLng(latitude, longitude);

  /* ===============================
   * 4. Realtime history (for trail)
   * =============================== */
  device.coords.push({
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    timestamp: timestamp.getTime(),
  });

  if (device.coords.length > 500) {
    device.coords.splice(0, device.coords.length - 500);
  }

  /* ===============================
   * 5. Vẽ TRAIL (REALTIME ONLY)
   * =============================== */
  if (device.visible) {
    const trailPoint = L.circleMarker(latLng, {
      radius: 4,
      color: device.color,
    });
    trailPoint.addTo(mapLive);
    device.trailMarkers.push(trailPoint);
  }

  /* ===============================
   * 6. Live marker
   * =============================== */
  if (device.liveMarker) {
    device.liveMarker.setLatLng(latLng);
  } else {
    device.liveMarker = L.marker(latLng, { icon: liveIcon })
      .addTo(mapLive)
      .bindPopup(
        `<b>${userName || deviceId}</b><br>${timestamp.toLocaleTimeString()}`
      );
  }

  /* ===============================
   * 7. Update realtime state
   * =============================== */
  device.lastLatLng = latLng;
  device.lastTimestamp = timestamp;
  device.lastUpdate = Date.now();
  device.isOffline = false;
  device.status = "realtime";

  try {
    device.liveMarker.setIcon(liveIcon);
  } catch {}

  /* ===============================
    * 8. Status timer (3-phase)
    * =============================== */
  if (!device.liveTimer) {
    device.liveTimer = setInterval(() => {
      if (!device.lastTimestamp) return;

      const diffSec = (Date.now() - device.lastTimestamp.getTime()) / 1000;

      // ===== 1️⃣ REALTIME (< 60s)
      if (diffSec < 60) {
        if (device.status !== "realtime") {
          device.status = "realtime";
          device.isOffline = false;

          try {
            device.liveMarker?.setIcon(liveIcon);
          } catch {}

          updateDeviceList(mapLive);
        }
        return;
      }

      // ===== 2️⃣ PAUSE (60s → <180s)
      if (diffSec >= 60 && diffSec < 180) {
        if (device.status !== "pause") {
          device.status = "pause";
          device.isOffline = false;

          try {
            device.liveMarker?.setIcon(pauseIcon);
          } catch {}

          updateDeviceList(mapLive);
        }
        return;
      }

      // ===== 3️⃣ DISCONNECT (180s → <240s)
      if (diffSec >= 180 && diffSec < 240) {
        if (device.status !== "disconnect") {
          device.status = "disconnect";
          device.isOffline = true;

          try {
            device.liveMarker?.setIcon(endIcon);
          } catch {}

          updateDeviceList(mapLive);
        }
        return;
      }

      // ===== 4️⃣ REMOVE (> 240s)
      if (diffSec >= 240) {
        console.warn(
          "[realtime] Remove device (no data >240s):",
          device.deviceId
        );

        // Remove marker
        try {
          device.liveMarker?.remove();
        } catch {}

        // Remove trail
        try {
          device.trailMarkers?.forEach((m) => m.remove());
        } catch {}

        // Clear timer
        clearInterval(device.liveTimer);
        device.liveTimer = null;

        // Remove device
        delete devices[device.deviceId];

        updateDeviceList(mapLive);
        schedulePersist();
      }
    }, 5000);
  }

  /* ===============================
   * 9. UI + autofit (REALTIME ONLY)
   * =============================== */
  updateDeviceList(mapLive);
  autoFitActiveDevices(isNewDevice ? "new" : "update");
  schedulePersist();
}


// Remove device visuals (live marker and trail) from the map and mark device as hidden.
function removeDeviceVisuals(deviceId) {
  try {
    const device = devices[deviceId];
    if (!device) return;

    // Remove live marker
    try {
      if (device.liveMarker) {
        device.liveMarker.remove();
        device.liveMarker = null;
      }
    } catch (e) {}

    // Remove trail markers
    try {
      if (device.trailMarkers && device.trailMarkers.length) {
        device.trailMarkers.forEach((m) => {
          try {
            m.remove();
          } catch (e) {}
        });
        device.trailMarkers = [];
      }
    } catch (e) {}

    // Clear any timers
    try {
      if (device.liveTimer) {
        clearInterval(device.liveTimer);
        device.liveTimer = null;
      }
    } catch (e) {}
    try {
      if (device.removeTimer) {
        clearTimeout(device.removeTimer);
        device.removeTimer = null;
      }
    } catch (e) {}

    // Mark as not visible so it won't be shown on refresh
    // Remove device object entirely to free memory and ensure it won't be restored
    try {
      delete devices[deviceId];
    } catch (e) {
      // fallback: mark not visible if delete fails
      try {
        device.visible = false;
      } catch (ee) {}
    }

    updateDeviceList(mapLive);

    // Persist state so removal persists across refresh (device will no longer be in devices)
    schedulePersist();
  } catch (e) {
    console.warn("[main] removeDeviceVisuals error for", deviceId, e);
  }
}

// ================================================
// 4️⃣ Các tiện ích
// ================================================
function autoFitActiveDevices() {
  // legacy signature support: if first arg is a reason, use it
  const args = Array.from(arguments);
  const reason = typeof args[0] === "string" ? args[0] : null; // 'new' | 'update' | 'toggle'

  const performFit = () => {
    const activeLatLngs = Object.values(devices)
      .filter((d) => d.visible && d.liveMarker && !d.isOffline)
      .map((d) => d.liveMarker.getLatLng());

    if (activeLatLngs.length === 0) return;

    // If autoFitConfig.onlyFitWhenToggled is true and reason is not 'toggle' or 'new', skip
    if (
      autoFitConfig.onlyFitWhenToggled &&
      reason !== "toggle" &&
      reason !== "new"
    ) {
      return;
    }

    // If fewer than minDevices and only one device, center and zoom
    if (activeLatLngs.length <= autoFitConfig.minDevices) {
      const latlng = activeLatLngs[0];
      mapLive.setView(latlng, autoFitConfig.singleDeviceZoom);
      return;
    }

    const bounds = L.latLngBounds(activeLatLngs);
    // padding: allow either number or array
    const pad = autoFitConfig.padding || [50, 50];
    mapLive.fitBounds(bounds, { padding: pad });
  };

  // Debounce behavior
  if (reason === "new") {
    // immediate fit for new device first point
    performFit();
    return;
  }

  if (_autoFitTimer) clearTimeout(_autoFitTimer);
  _autoFitTimer = setTimeout(performFit, autoFitConfig.delay);
}

// Small helper: produce the label content shown above the marker (username • time)
function getDeviceLabel(device) {
  const name = device.userName || device.deviceId || "unknown";
  let timeStr = "";
  try {
    const ts =
      device.lastTimestamp instanceof Date
        ? device.lastTimestamp
        : new Date(device.lastTimestamp);
    if (!isNaN(ts.getTime())) timeStr = ts.toLocaleTimeString();
  } catch (e) {
    timeStr = "";
  }
  return timeStr ? `${name} • ${timeStr}` : `${name}`;
}

// Fit map to all devices currently known/visible (used on refresh to show full area)
function fitMapToAllDevices() {
  try {
    const latLngs = Object.values(devices)
      .filter((d) => d && d.visible)
      .map((d) => {
        if (
          d.lastLatLng &&
          d.lastLatLng.lat != null &&
          d.lastLatLng.lng != null
        )
          return d.lastLatLng;
        if (d.coords && d.coords.length > 0) {
          const last = d.coords[d.coords.length - 1];
          if (last && (last.lat != null || last.latitude != null)) {
            return L.latLng(
              Number(last.lat != null ? last.lat : last.latitude),
              Number(last.lon != null ? last.lon : last.longitude)
            );
          }
        }
        return null;
      })
      .filter(Boolean);

    if (!mapLive || latLngs.length === 0) return;

    if (latLngs.length === 1) {
      mapLive.setView(latLngs[0], autoFitConfig.singleDeviceZoom);
      return;
    }

    const bounds = L.latLngBounds(latLngs);
    const pad = autoFitConfig.padding || [50, 50];
    mapLive.fitBounds(bounds, { padding: pad });
  } catch (e) {
    console.warn("[main] fitMapToAllDevices error", e);
  }
}

// Robust timestamp parser: accepts Date, ms number, seconds number, ISO/string. Returns a Date.
function parseTimestamp(ts) {
  try {
    if (!ts && ts !== 0) return new Date();
    if (ts instanceof Date) {
      if (!isNaN(ts.getTime())) return ts;
      return new Date();
    }
    // numeric: could be seconds or milliseconds
    if (typeof ts === "number") {
      // if seconds (<=1e10), convert to ms
      if (ts > 0 && ts < 1e11) {
        // likely seconds
        if (ts < 1e10) return new Date(ts * 1000);
      }
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
      return new Date();
    }
    if (typeof ts === "string") {
      // try numeric string first
      const n = Number(ts);
      if (!isNaN(n)) {
        return parseTimestamp(n);
      }
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
      return new Date();
    }
  } catch (e) {
    /* fallback */
  }
  return new Date();
}

function saveDeviceVisibility() {
  const visibility = {};
  Object.keys(devices).forEach((id) => {
    visibility[id] = devices[id].visible;
  });
  localStorage.setItem("deviceVisibility", JSON.stringify(visibility));
}

function loadDeviceVisibility() {
  const saved = localStorage.getItem("deviceVisibility");
  if (!saved) return;
  const visibility = JSON.parse(saved);
  Object.keys(visibility).forEach((id) => {
    if (devices[id]) devices[id].visible = visibility[id];
  });
}

// Persist last-known device positions to localStorage so UI can restore after refresh
function persistDevicesState() {
  try {
    const state = {};
    Object.keys(devices).forEach((id) => {
      const d = devices[id];
      if (!d) return;
      // only persist if we have a lastLatLng
      const latLng = d.lastLatLng || (d.liveMarker && d.liveMarker.getLatLng());
      if (!latLng) return;
      state[id] = {
        deviceId: d.deviceId,
        userName: d.userName,
        latitude: latLng.lat,
        longitude: latLng.lng,
        // store timestamp as milliseconds to make restore parsing deterministic
        timestamp:
          d.lastTimestamp instanceof Date
            ? d.lastTimestamp.getTime()
            : typeof d.lastTimestamp === "number"
            ? d.lastTimestamp
            : d.lastUpdate || Date.now(),
        visible: !!d.visible,
        color: d.color,
        // normalize coords for persistence: ensure latitude/longitude/timestamp(ms)
        coords: (d.coords || []).slice(-500).map((c) => ({
          latitude:
            c.latitude != null
              ? Number(c.latitude)
              : c.lat != null
              ? Number(c.lat)
              : null,
          longitude:
            c.longitude != null
              ? Number(c.longitude)
              : c.lon != null
              ? Number(c.lon)
              : null,
          timestamp:
            c.timestamp instanceof Date
              ? c.timestamp.getTime()
              : typeof c.timestamp === "number"
              ? c.timestamp
              : Number(c.timestamp) || Date.now(),
        })), // last up to 500 points
      };
    });
    localStorage.setItem("deviceLastState", JSON.stringify(state));
  } catch (e) {
    console.warn("[main] persistDevicesState error", e);
  }
}

function restoreDevicesFromStorage() {
  try {
    const raw = localStorage.getItem("deviceLastState");
    if (!raw) return;
    const state = JSON.parse(raw);
    const keys = Object.keys(state);
    keys.forEach((k) => {
      const s = state[k];
      try {
        const id = s.deviceId;
        const color = s.color || getColorFromId(id);
        // normalize restored coords: ensure each entry has latitude, longitude, lat, lon and numeric timestamp (ms)
        const restoredCoords = Array.isArray(s.coords)
          ? s.coords.slice(-500).map((c) => {
              const lat =
                c.latitude != null
                  ? Number(c.latitude)
                  : c.lat != null
                  ? Number(c.lat)
                  : null;
              const lon =
                c.longitude != null
                  ? Number(c.longitude)
                  : c.lon != null
                  ? Number(c.lon)
                  : null;
              const tsNum =
                typeof c.timestamp === "number"
                  ? c.timestamp
                  : c.timestamp
                  ? Number(c.timestamp)
                  : NaN;
              const timestampMs =
                !isNaN(tsNum) && tsNum > 0 ? tsNum : new Date().getTime();
              if (lat == null || lon == null) {
                console.warn("[main] restore coord missing lat/lon for", id, c);
              }
              return {
                latitude: lat,
                longitude: lon,
                lat: lat,
                lon: lon,
                timestamp: timestampMs,
              };
            })
          : [];

        const device = {
          deviceId: id,
          userName: s.userName,
          color,
          coords: restoredCoords,
          trailMarkers: [],
          visible: s.visible !== false,
          isOffline: false,
          liveMarker: null,
          lastLatLng: null,
        };
        devices[id] = device;

        // recreate trail polyline if coords exist
        if (device.coords && device.coords.length > 0) {
          // recreate trail as circle markers (last up to 500 points)
          try {
            device.coords.forEach((c) => {
              try {
                const m = L.circleMarker([c.latitude, c.longitude], {
                  radius: 4,
                  color: device.color,
                });
                if (device.visible) m.addTo(mapLive);
                device.trailMarkers.push(m);
              } catch (e) {
                /* ignore individual marker errors */
              }
            });
          } catch (e) {
            console.warn("[main] error restoring trail markers for", id, e);
          }

          // add live marker at last point
          const last = device.coords[device.coords.length - 1];
          try {
            const lastLatLng = L.latLng(last.latitude, last.longitude);
            device.lastLatLng = lastLatLng;

            // determine lastTimestamp and status based on stored timestamp
            let lastTs = null;
            // Parse stored timestamp and validate; fallback to local time if invalid
            if (last.timestamp) {
              lastTs = new Date(last.timestamp);
              if (isNaN(lastTs.getTime())) {
                console.warn(
                  "[main] restored timestamp invalid for",
                  id,
                  last.timestamp,
                  "— using now"
                );
                lastTs = new Date();
              }
            } else {
              lastTs = new Date();
            }
            device.lastTimestamp = lastTs;

            // compute status: realtime (<60s), pause (60-180s), offline (>180s)
            const now = new Date();
            const diffSec = (now - device.lastTimestamp) / 1000;
            let status = "realtime";
            if (diffSec > 180) status = "offline";
            else if (diffSec > 60) status = "pause";
            device.status = status;
            device.isOffline = status === "offline";

            // pick icon according to status
            let icon = liveIcon;
            if (status === "pause") icon = pauseIcon;
            else if (status === "offline") icon = endIcon;

            device.liveMarker = L.marker(lastLatLng, { icon })
              .addTo(mapLive)
              .bindPopup(
                `<b>${device.userName || id}</b><br>${new Date(
                  device.lastTimestamp
                ).toLocaleTimeString()}`
              );

            // bind a permanent tooltip label showing username and time
            try {
              const label = getDeviceLabel(device);
              device.liveMarker
                .bindTooltip(label, {
                  permanent: true,
                  direction: "top",
                  offset: [0, -20],
                  className: "device-label",
                })
                .openTooltip();
            } catch (e) {
              /* ignore tooltip binding errors */
            }

            // start liveTimer to monitor status transitions (unless already offline)
            if (!device.isOffline) {
              device.liveTimer = setInterval(() => {
                try {
                  const now2 = new Date();
                  const diff = (now2 - (device.lastTimestamp || now2)) / 1000;
                  let newStatus = "realtime";
                  if (diff > 180) newStatus = "offline";
                  else if (diff > 60) newStatus = "pause";

                  // optional debug logging (enable by setting window.DEBUG_STATUS = true in console)
                  if (window.DEBUG_STATUS) {
                    console.debug(
                      "[main] statusTimer",
                      id,
                      "diffSec=",
                      Math.round(diff),
                      "current=",
                      device.status,
                      "new=",
                      newStatus
                    );
                  }

                  if (newStatus !== device.status) {
                    device.status = newStatus;
                    device.isOffline = newStatus === "offline";
                    try {
                      if (device.liveMarker) {
                        if (newStatus === "realtime")
                          device.liveMarker.setIcon(liveIcon);
                        else if (newStatus === "pause")
                          device.liveMarker.setIcon(pauseIcon);
                        else if (newStatus === "offline")
                          device.liveMarker.setIcon(endIcon);
                      }
                    } catch (e) {}
                    updateDeviceList(mapLive);
                    if (newStatus === "offline") {
                      clearInterval(device.liveTimer);
                      device.liveTimer = null;
                    }
                  }
                } catch (e) {
                  /* ignore */
                }
              }, 5000);
            }

            // If already offline when restored, schedule removal after 60s
            if (device.isOffline) {
              try {
                if (device.removeTimer) clearTimeout(device.removeTimer);
                device.removeTimer = setTimeout(() => {
                  removeDeviceVisuals(id);
                }, 60 * 1000);
              } catch (e) {}
            }
          } catch (e) {
            console.warn("[main] error restoring liveMarker for", id, e);
          }
        }
      } catch (e) {
        console.warn("[main] restoreDevicesFromStorage entry error", e);
      }
    });

    updateDeviceList(mapLive);
    console.info(
      "[main] Restored devices from storage:",
      Object.keys(state).length
    );
  } catch (e) {
    console.warn("[main] restoreDevicesFromStorage error", e);
  }
}

// Persist state periodically and on unload
window.addEventListener("beforeunload", () => {
  persistDevicesState();
});

// Also persist when devices change (throttle to avoid excessive writes)
let _persistTimer = null;
function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    persistDevicesState();
  }, 500);
}


