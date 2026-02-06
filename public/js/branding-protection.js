/**
 * Wiku Radius Branding Protection
 * Protects logo and attribution from unauthorized modifications
 *
 * DISCLAIMER: This is client-side protection and can be bypassed by advanced users.
 * For stronger protection, consider server-side rendering or licensing terms.
 */

(function () {
  "use strict";

  // ==================== PROTECTED VALUES ====================
  const PROTECTED_LOGO_URL = "https://wiku.my.id/img/logo/favicon-192x192.png";
  const PROTECTED_FAVICON_URL =
    "https://wiku.my.id/img/logo/favicon-192x192.png";
  const PROTECTED_LINK_URL = "https://wiku.my.id";
  const PROTECTED_BRAND_TEXT = "wiku.my.id";
  const BRAND_NAME = "Wiku Radius";

  // ==================== SELECTORS ====================
  const LOGO_SELECTOR = 'img[src*="wiku.my.id"], img[src*="favicon-192x192"]';
  const ATTRIBUTION_SELECTOR = 'a[href*="wiku.my.id"]';
  const BRAND_TEXT_SELECTOR = ".wiku-brand, [data-wiku-protected]";

  // ==================== INTEGRITY HASH (optional) ====================
  // You can add a hash of critical elements for verification
  const INTEGRITY_CHECK_INTERVAL = 5000; // Check every 5 seconds

  // ==================== PROTECTION CLASS ====================
  class BrandingProtection {
    constructor() {
      this.initialized = false;
      this.observers = [];
      this.protectedElements = new Map();

      this.init();
    }

    init() {
      if (this.initialized) return;

      // Wait for DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.setup());
      } else {
        this.setup();
      }

      this.initialized = true;
    }

    setup() {
      this.protectLogos();
      this.protectAttribution();
      this.protectBrandText();
      this.setupMutationObservers();
      this.startIntegrityChecks();
      this.protectAgainstDevTools();

      console.log(
        "%c🛡️ Wiku Radius Branding Protection Active",
        "color: #6366f1; font-weight: bold; font-size: 14px;",
      );
    }

    // ==================== LOGO PROTECTION ====================
    protectLogos() {
      const logos = document.querySelectorAll(LOGO_SELECTOR);

      logos.forEach((logo, index) => {
        // Store original values
        this.protectedElements.set(`logo-${index}`, {
          element: logo,
          originalSrc: PROTECTED_LOGO_URL,
          originalAlt: logo.alt || "Wiku Logo",
        });

        // Ensure correct source
        if (!logo.src.includes("wiku.my.id")) {
          logo.src = PROTECTED_LOGO_URL;
        }

        // Make it harder to modify via DOM
        this.freezeProperty(logo, "src", PROTECTED_LOGO_URL);
      });

      // Protect favicon
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        this.protectedElements.set("favicon", {
          element: favicon,
          originalHref: PROTECTED_FAVICON_URL,
        });
        this.freezeProperty(favicon, "href", PROTECTED_FAVICON_URL);
      }
    }

    // ==================== ATTRIBUTION PROTECTION ====================
    protectAttribution() {
      const attributionLinks = document.querySelectorAll(ATTRIBUTION_SELECTOR);

      attributionLinks.forEach((link, index) => {
        this.protectedElements.set(`attribution-${index}`, {
          element: link,
          originalHref: PROTECTED_LINK_URL,
          originalText: link.textContent.trim(),
        });

        // Ensure correct href
        if (!link.href.includes("wiku.my.id")) {
          link.href = PROTECTED_LINK_URL;
        }

        // Freeze href property
        this.freezeProperty(link, "href", PROTECTED_LINK_URL);

        // Protect text content
        if (!link.textContent.includes("wiku")) {
          link.textContent = PROTECTED_BRAND_TEXT;
        }
      });

      // Ensure "Powered by wiku.my.id" exists on login page
      this.ensureAttributionExists();
    }

    ensureAttributionExists() {
      const loginPage = document.getElementById("login-page");
      if (!loginPage) return;

      const existingAttribution = loginPage.querySelector(
        'a[href*="wiku.my.id"]',
      );
      if (!existingAttribution) {
        // Attribution was removed, re-add it
        const attributionContainer = loginPage.querySelector(
          ".text-center.text-sm",
        );
        if (attributionContainer) {
          attributionContainer.innerHTML = `Powered by <a href="${PROTECTED_LINK_URL}" target="_blank" class="text-primary-500 hover:text-primary-400 transition-colors">${PROTECTED_BRAND_TEXT}</a>`;
        }
      }
    }

    // ==================== BRAND TEXT PROTECTION ====================
    protectBrandText() {
      // Protect the "Wiku Radius" text in sidebar
      const sidebarBrand = document.querySelector("#sidebar .font-bold");
      if (sidebarBrand && !sidebarBrand.textContent.includes("Wiku")) {
        sidebarBrand.textContent = BRAND_NAME;
      }

      // Protect document title
      if (!document.title.includes("Wiku")) {
        document.title = "Wiku Radius - Dashboard";
      }
    }

    // ==================== MUTATION OBSERVER ====================
    setupMutationObservers() {
      // Observer for logo changes
      this.observeElements(LOGO_SELECTOR, (mutation, target) => {
        if (
          mutation.attributeName === "src" &&
          !target.src.includes("wiku.my.id")
        ) {
          target.src = PROTECTED_LOGO_URL;
        }
      });

      // Observer for attribution link changes
      this.observeElements(ATTRIBUTION_SELECTOR, (mutation, target) => {
        if (
          mutation.attributeName === "href" &&
          !target.href.includes("wiku.my.id")
        ) {
          target.href = PROTECTED_LINK_URL;
        }
      });

      // Observer for removed elements
      this.observeRemovals();

      // Observer for document title
      this.observeTitle();
    }

    observeElements(selector, callback) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            callback(mutation, element);
          });
        });

        observer.observe(element, {
          attributes: true,
          attributeFilter: ["src", "href", "style"],
          childList: true,
          characterData: true,
        });

        this.observers.push(observer);
      });
    }

    observeRemovals() {
      const bodyObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.removedNodes.length > 0) {
            // Check if any protected element was removed
            this.protectedElements.forEach((data, key) => {
              if (!document.contains(data.element)) {
                this.restoreElement(key, data);
              }
            });
          }
        });
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      this.observers.push(bodyObserver);
    }

    observeTitle() {
      const titleObserver = new MutationObserver(() => {
        if (!document.title.includes("Wiku")) {
          document.title = "Wiku Radius - Dashboard";
        }
      });

      const titleElement = document.querySelector("title");
      if (titleElement) {
        titleObserver.observe(titleElement, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        this.observers.push(titleObserver);
      }
    }

    restoreElement(key, data) {
      // Try to restore removed elements
      if (key.startsWith("logo")) {
        const img = document.createElement("img");
        img.src = data.originalSrc;
        img.alt = data.originalAlt;
        img.className = "w-8 h-8";

        // Try to find the original container
        const sidebarHeader = document.querySelector(
          "#sidebar .flex.items-center",
        );
        if (sidebarHeader && !sidebarHeader.querySelector("img")) {
          sidebarHeader.insertBefore(img, sidebarHeader.firstChild);
          this.protectedElements.set(key, { ...data, element: img });
        }
      }

      if (key.startsWith("attribution")) {
        this.ensureAttributionExists();
      }
    }

    // ==================== INTEGRITY CHECKS ====================
    startIntegrityChecks() {
      setInterval(() => {
        this.verifyIntegrity();
      }, INTEGRITY_CHECK_INTERVAL);
    }

    verifyIntegrity() {
      // Check logos
      const logos = document.querySelectorAll(
        'img[alt*="logo" i], img[src*="logo" i], #sidebar img',
      );
      logos.forEach((logo) => {
        if (
          logo.src &&
          !logo.src.includes("wiku.my.id") &&
          logo.closest("#sidebar, .login")
        ) {
          logo.src = PROTECTED_LOGO_URL;
        }
      });

      // Check attribution links
      this.ensureAttributionExists();

      // Check favicon
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon && !favicon.href.includes("wiku.my.id")) {
        favicon.href = PROTECTED_FAVICON_URL;
      }

      // Check brand text in sidebar
      const sidebarBrand = document.querySelector("#sidebar .font-bold");
      if (sidebarBrand && !sidebarBrand.textContent.includes("Wiku")) {
        sidebarBrand.textContent = BRAND_NAME;
      }
    }

    // ==================== PROPERTY FREEZING ====================
    freezeProperty(element, property, value) {
      try {
        Object.defineProperty(element, property, {
          get: function () {
            return value;
          },
          set: function (newValue) {
            console.warn("Branding modification prevented");
            return value;
          },
          configurable: false,
        });
      } catch (e) {
        // Property might already be frozen or non-configurable
      }
    }

    // ==================== DEV TOOLS DETECTION ====================
    protectAgainstDevTools() {
      // Detect when dev tools are open and show warning
      const element = new Image();
      let devtoolsOpen = false;

      Object.defineProperty(element, "id", {
        get: function () {
          devtoolsOpen = true;
        },
      });

      // Check periodically
      setInterval(() => {
        devtoolsOpen = false;
        console.log(element);
        console.clear();

        if (devtoolsOpen) {
          console.log(
            "%c⚠️ Branding Protection Notice",
            "color: #f59e0b; font-weight: bold; font-size: 16px;",
          );
          console.log(
            "%cModifying Wiku Radius branding may violate terms of use.",
            "color: #6b7280; font-size: 12px;",
          );
        }
      }, 1000);

      // Disable right-click on protected elements (optional - can be commented out)
      document
        .querySelectorAll(LOGO_SELECTOR + "," + ATTRIBUTION_SELECTOR)
        .forEach((el) => {
          el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            console.log("Right-click disabled on protected branding elements");
          });
        });
    }
  }

  // ==================== CSS PROTECTION ====================
  // Add styles that make it harder to hide elements via CSS
  const protectionStyles = document.createElement("style");
  protectionStyles.textContent = `
    /* Ensure branding elements are always visible */
    #sidebar img[src*="wiku"],
    a[href*="wiku.my.id"],
    [data-wiku-protected] {
      display: inline-flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    
    /* Protect favicon link */
    link[rel="icon"][href*="wiku"] {
      display: block !important;
    }
  `;
  document.head.appendChild(protectionStyles);

  // ==================== INITIALIZE ====================
  window.WikuBrandingProtection = new BrandingProtection();

  // Prevent easy removal of the protection script
  Object.freeze(window.WikuBrandingProtection);
})();
