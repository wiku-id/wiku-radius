/**
 * Wiku Radius Dashboard - JavaScript Application
 * Handles all frontend interactions with TailwindCSS
 */

class WikuRadiusApp {
  constructor() {
    this.apiUrl = "/api";
    this.token = localStorage.getItem("wiku_radius_token");

    this.init();
  }

  init() {
    this.bindEvents();
    this.checkAuth();
  }

  // ==================== AUTH ====================

  checkAuth() {
    if (this.token) {
      this.showDashboard();
      this.loadDashboardData();
    } else {
      this.showLogin();
    }
  }

  async login(username, password) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.token = data.token;
        localStorage.setItem("wiku_radius_token", data.token);
        this.showDashboard();
        this.loadDashboardData();
        this.showToast("Welcome back!", "success");
      } else {
        this.showToast(data.error || "Login failed", "error");
      }
    } catch (error) {
      this.showToast("Connection error", "error");
    }
  }

  logout() {
    this.token = null;
    localStorage.removeItem("wiku_radius_token");
    this.showLogin();
    this.showToast("Logged out successfully", "info");
  }

  showLogin() {
    document.getElementById("login-page").classList.add("active");
    document.getElementById("dashboard-page").classList.remove("active");
  }

  showDashboard() {
    document.getElementById("login-page").classList.remove("active");
    document.getElementById("dashboard-page").classList.add("active");

    // Set first nav item active
    this.navigateToPage("overview");
  }

  // ==================== API CALLS ====================

  async api(endpoint, options = {}) {
    const defaultOptions = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
    };

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      this.logout();
      throw new Error("Session expired");
    }

    return response.json();
  }

  // ==================== DASHBOARD DATA ====================

  async loadDashboardData() {
    try {
      const stats = await this.api("/dashboard/stats");
      this.updateStats(stats);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    }

    // Load current page data
    const currentPage =
      document.querySelector(".nav-item.active")?.dataset.page || "overview";
    this.loadPageData(currentPage);
  }

  updateStats(stats) {
    document.getElementById("stat-total-users").textContent =
      stats.totalUsers || 0;
    document.getElementById("stat-active-sessions").textContent =
      stats.activeSessions || 0;
    document.getElementById("stat-total-nas").textContent = stats.totalNas || 0;

    // Format bandwidth
    const totalBandwidth =
      (stats.bandwidthToday?.download || 0) +
      (stats.bandwidthToday?.upload || 0);
    document.getElementById("stat-bandwidth").textContent =
      this.formatBytes(totalBandwidth);
  }

  async loadPageData(page) {
    switch (page) {
      case "users":
        await this.loadUsers();
        break;
      case "nas":
        await this.loadNas();
        break;
      case "sessions":
        await this.loadSessions();
        break;
      case "profiles":
        await this.loadProfiles();
        break;
    }
  }

  // ==================== USERS ====================

  async loadUsers(search = "") {
    try {
      const data = await this.api(
        `/users?search=${encodeURIComponent(search)}`,
      );
      this.renderUsersTable(data.users);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  }

  renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");

    if (!users || users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            No users found. Click "Add User" to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users
      .map(
        (user) => `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td class="px-6 py-4">
          <span class="font-medium">${this.escapeHtml(user.username)}</span>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${this.escapeHtml(user.profile || "default")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
            user.is_active
              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
          }">
            ${user.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${user.expired_at ? new Date(user.expired_at).toLocaleDateString() : "Never"}</td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick="app.editUser(${user.id})" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button onclick="app.deleteUser(${user.id})" class="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  showAddUserModal() {
    this.showModal(
      "Add User",
      `
      <form id="add-user-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Username</label>
          <input type="text" name="username" required placeholder="Enter username"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Password</label>
          <input type="password" name="password" required placeholder="Enter password"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Profile</label>
          <input type="text" name="profile" placeholder="default"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Expiry Date (optional)</label>
          <input type="date" name="expired_at"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div class="flex gap-3 pt-4">
          <button type="button" onclick="app.closeModal()" class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-xl transition-colors">Cancel</button>
          <button type="submit" class="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white font-medium rounded-xl transition-all">Create</button>
        </div>
      </form>
    `,
    );

    document.getElementById("add-user-form").onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      try {
        await this.api("/users", {
          method: "POST",
          body: JSON.stringify({
            username: formData.get("username"),
            password: formData.get("password"),
            profile: formData.get("profile") || "default",
            expired_at: formData.get("expired_at") || null,
          }),
        });

        this.showToast("User created successfully", "success");
        this.closeModal();
        this.loadUsers();
        this.loadDashboardData();
      } catch (error) {
        this.showToast("Failed to create user", "error");
      }
    };
  }

  async deleteUser(id) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      await this.api(`/users/${id}`, { method: "DELETE" });
      this.showToast("User deleted", "success");
      this.loadUsers();
      this.loadDashboardData();
    } catch (error) {
      this.showToast("Failed to delete user", "error");
    }
  }

  // ==================== NAS ====================

  async loadNas() {
    try {
      const data = await this.api("/nas");
      this.renderNasTable(data.clients);
    } catch (error) {
      console.error("Error loading NAS:", error);
    }
  }

  renderNasTable(clients) {
    const tbody = document.getElementById("nas-table-body");

    if (!clients || clients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            No NAS clients configured. Click "Add NAS" to add a router.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = clients
      .map(
        (nas) => `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td class="px-6 py-4">
          <span class="font-medium">${this.escapeHtml(nas.name)}</span>
        </td>
        <td class="px-6 py-4">
          <code class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">${this.escapeHtml(nas.ip_address)}</code>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${this.escapeHtml(nas.type || "mikrotik")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
            nas.is_active
              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
          }">
            ${nas.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td class="px-6 py-4">
          <button onclick="app.deleteNas(${nas.id})" class="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  showAddNasModal() {
    this.showModal(
      "Add NAS Client",
      `
      <form id="add-nas-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Name</label>
          <input type="text" name="name" required placeholder="e.g., Main Router"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">IP Address</label>
          <input type="text" name="ip_address" required placeholder="e.g., 192.168.1.1"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">RADIUS Secret</label>
          <input type="password" name="secret" required placeholder="Enter shared secret"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Type</label>
          <input type="text" name="type" value="mikrotik" placeholder="mikrotik"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div class="flex gap-3 pt-4">
          <button type="button" onclick="app.closeModal()" class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-xl transition-colors">Cancel</button>
          <button type="submit" class="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white font-medium rounded-xl transition-all">Add NAS</button>
        </div>
      </form>
    `,
    );

    document.getElementById("add-nas-form").onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      try {
        await this.api("/nas", {
          method: "POST",
          body: JSON.stringify({
            name: formData.get("name"),
            ip_address: formData.get("ip_address"),
            secret: formData.get("secret"),
            type: formData.get("type") || "mikrotik",
          }),
        });

        this.showToast("NAS client added", "success");
        this.closeModal();
        this.loadNas();
        this.loadDashboardData();
      } catch (error) {
        this.showToast("Failed to add NAS", "error");
      }
    };
  }

  async deleteNas(id) {
    if (!confirm("Are you sure you want to delete this NAS client?")) return;

    try {
      await this.api(`/nas/${id}`, { method: "DELETE" });
      this.showToast("NAS deleted", "success");
      this.loadNas();
      this.loadDashboardData();
    } catch (error) {
      this.showToast("Failed to delete NAS", "error");
    }
  }

  // ==================== SESSIONS ====================

  async loadSessions() {
    try {
      const data = await this.api("/sessions");
      this.renderSessionsTable(data.sessions);
    } catch (error) {
      console.error("Error loading sessions:", error);
    }
  }

  renderSessionsTable(sessions) {
    const tbody = document.getElementById("sessions-table-body");

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            No active sessions
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = sessions
      .map(
        (session) => `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td class="px-6 py-4">
          <span class="font-medium">${this.escapeHtml(session.username)}</span>
        </td>
        <td class="px-6 py-4">
          <code class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">${this.escapeHtml(session.framed_ip || "-")}</code>
        </td>
        <td class="px-6 py-4">
          <code class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">${this.escapeHtml(session.mac_address || "-")}</code>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${this.formatDuration(session.session_time)}</td>
        <td class="px-6 py-4 text-emerald-600 dark:text-emerald-400">${this.formatBytes(session.input_octets || 0)}</td>
        <td class="px-6 py-4 text-blue-600 dark:text-blue-400">${this.formatBytes(session.output_octets || 0)}</td>
      </tr>
    `,
      )
      .join("");
  }

  // ==================== PROFILES ====================

  async loadProfiles() {
    try {
      const data = await this.api("/profiles");
      this.renderProfilesTable(data.profiles);
    } catch (error) {
      console.error("Error loading profiles:", error);
    }
  }

  renderProfilesTable(profiles) {
    const tbody = document.getElementById("profiles-table-body");

    if (!profiles || profiles.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            No profiles configured
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = profiles
      .map(
        (profile) => `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td class="px-6 py-4">
          <span class="font-medium">${this.escapeHtml(profile.name)}</span>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${this.escapeHtml(profile.rate_limit || "No limit")}</td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${profile.session_timeout ? profile.session_timeout + "s" : "No limit"}</td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${this.escapeHtml(profile.description || "-")}</td>
      </tr>
    `,
      )
      .join("");
  }

  showAddProfileModal() {
    this.showModal(
      "Add Profile",
      `
      <form id="add-profile-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Profile Name</label>
          <input type="text" name="name" required placeholder="e.g., 10Mbps"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Rate Limit (MikroTik format)</label>
          <input type="text" name="rate_limit" placeholder="e.g., 10M/10M"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Session Timeout (seconds)</label>
          <input type="number" name="session_timeout" placeholder="e.g., 3600"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Description</label>
          <input type="text" name="description" placeholder="Optional description"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
        </div>
        <div class="flex gap-3 pt-4">
          <button type="button" onclick="app.closeModal()" class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-xl transition-colors">Cancel</button>
          <button type="submit" class="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white font-medium rounded-xl transition-all">Create</button>
        </div>
      </form>
    `,
    );

    document.getElementById("add-profile-form").onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      try {
        await this.api("/profiles", {
          method: "POST",
          body: JSON.stringify({
            name: formData.get("name"),
            rate_limit: formData.get("rate_limit") || null,
            session_timeout: formData.get("session_timeout") || null,
            description: formData.get("description"),
          }),
        });

        this.showToast("Profile created", "success");
        this.closeModal();
        this.loadProfiles();
      } catch (error) {
        this.showToast("Failed to create profile", "error");
      }
    };
  }

  // ==================== UI HELPERS ====================

  bindEvents() {
    // Login form
    document.getElementById("login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("login-username").value;
      const password = document.getElementById("login-password").value;
      this.login(username, password);
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", () => {
      this.logout();
    });

    // Navigation
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateToPage(page);
      });
    });

    // Add buttons
    document
      .getElementById("add-user-btn")
      ?.addEventListener("click", () => this.showAddUserModal());
    document
      .getElementById("add-nas-btn")
      ?.addEventListener("click", () => this.showAddNasModal());
    document
      .getElementById("add-profile-btn")
      ?.addEventListener("click", () => this.showAddProfileModal());
    document
      .getElementById("refresh-sessions-btn")
      ?.addEventListener("click", () => this.loadSessions());

    // User search
    document.getElementById("user-search")?.addEventListener("input", (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.loadUsers(e.target.value);
      }, 300);
    });

    // Modal close
    document
      .getElementById("modal-close")
      .addEventListener("click", () => this.closeModal());
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  }

  navigateToPage(page) {
    // Update nav - remove active from all, add to current
    document.querySelectorAll(".nav-item").forEach((item) => {
      if (item.dataset.page === page) {
        item.classList.add(
          "bg-gradient-to-r",
          "from-primary-500/10",
          "to-purple-500/10",
          "text-primary-500",
          "dark:text-primary-400",
        );
        item.classList.remove("text-gray-600", "dark:text-gray-300");
      } else {
        item.classList.remove(
          "bg-gradient-to-r",
          "from-primary-500/10",
          "to-purple-500/10",
          "text-primary-500",
          "dark:text-primary-400",
        );
        item.classList.add("text-gray-600", "dark:text-gray-300");
      }
    });

    // Update content
    document.querySelectorAll(".content-section").forEach((section) => {
      section.classList.toggle("active", section.id === `content-${page}`);
    });

    // Update title
    const titles = {
      overview: "Overview",
      users: "Users",
      nas: "NAS Clients",
      sessions: "Active Sessions",
      profiles: "Bandwidth Profiles",
    };
    document.getElementById("page-title").textContent =
      titles[page] || "Dashboard";

    // Close mobile sidebar
    if (typeof closeSidebar === "function") closeSidebar();

    // Load page data
    this.loadPageData(page);
  }

  showModal(title, content) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = content;
    const overlay = document.getElementById("modal-overlay");
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  }

  closeModal() {
    const overlay = document.getElementById("modal-overlay");
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");

    const colors = {
      success: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
      error: "border-l-red-500 bg-red-50 dark:bg-red-500/10",
      info: "border-l-blue-500 bg-blue-50 dark:bg-blue-500/10",
    };

    const icons = {
      success:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      error:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    };

    toast.className = `flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border-l-4 ${colors[type]} shadow-lg animate-slide-in`;
    toast.innerHTML = `
      <svg class="w-5 h-5 ${type === "success" ? "text-emerald-500" : type === "error" ? "text-red-500" : "text-blue-500"}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${icons[type]}
      </svg>
      <span class="text-gray-700 dark:text-gray-200">${message}</span>
    `;

    // Add animation styles
    toast.style.animation = "slideIn 0.3s ease";
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==================== UTILITIES ====================

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  formatDuration(seconds) {
    if (!seconds || seconds === 0) return "0s";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = "";
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    result += `${secs}s`;

    return result.trim();
  }

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Add animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(100%); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideOut {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(100%); }
  }
`;
document.head.appendChild(style);

// Initialize app
const app = new WikuRadiusApp();
