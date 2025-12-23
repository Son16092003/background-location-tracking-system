// auth.js
import { API_BASE } from "./config.js";

// =======================
// Fetch có auth (cookie)
// =======================
export async function authFetch(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    credentials: "include", // 🔥 bắt buộc cho cookie auth
    cache: "no-store",      // ❗ tránh cache login state
    ...options,
  });

  if (res.status === 401) {
    // ❌ Mất login → đá về login
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  return res;
}

// =======================
// Check login
// =======================
export async function checkLogin() {
  await authFetch("/api/admin/me");
}

// =======================
// Logout
// =======================
export async function logout() {
  await authFetch("/api/admin/logout", {
    method: "POST",
  });

  redirectToLogin();
}

// =======================
// Helper redirect
// =======================
function redirectToLogin() {
  // luôn quay về root login.html
  window.location.replace("/login.html");
}
