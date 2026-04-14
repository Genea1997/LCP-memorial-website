const donationStatus = document.querySelector("#donation-status");
const donationAmount = document.querySelector("#donation-amount");
const donationForm = document.querySelector("#donation-form");
const amountButtons = document.querySelectorAll("[data-amount]");

const galleryForm = document.querySelector("#gallery-form");
const galleryCaption = document.querySelector("#gallery-caption");
const galleryImage = document.querySelector("#gallery-image");
const galleryGrid = document.querySelector("#gallery-grid");
const galleryTemplate = document.querySelector("#gallery-card-template");

const notificationForm = document.querySelector("#notification-form");
const notificationInput = document.querySelector("#notification-input");
const notificationList = document.querySelector("#notification-list");
const notificationTemplate = document.querySelector("#notification-template");
const roadmapList = document.querySelector("#roadmap-list");
const roadmapTemplate = document.querySelector("#roadmap-template");
const donationList = document.querySelector("#donation-list");
const donationTemplate = document.querySelector("#donation-template");
const adminForm = document.querySelector("#admin-form");
const adminKeyInput = document.querySelector("#admin-key");

let galleryItems = [];
let notifications = [];
let roadmapItems = [];
let donations = [];

const adminStorageKey = "lcp-memorial-admin-key";
let adminKey = localStorage.getItem(adminStorageKey) || "";

const api = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (adminKey) {
    headers.set("x-admin-key", adminKey);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
};

const updateDonationStatus = (message) => {
  donationStatus.textContent = message;
};

const renderGallery = () => {
  galleryGrid.innerHTML = "";

  if (!galleryItems.length) {
    galleryGrid.innerHTML =
      '<p class="hero-text">Upload impact photos to start building the LCP Memorial gallery.</p>';
    return;
  }

  galleryItems.forEach((item) => {
    const node = galleryTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector("img");
    const caption = node.querySelector(".gallery-caption");
    const removeButton = node.querySelector(".text-button");

    image.src = item.imageUrl;
    image.alt = item.caption;
    caption.textContent = item.caption;
    removeButton.addEventListener("click", async () => {
      try {
        await api(`/api/gallery/${item.id}`, {
          method: "DELETE",
        });
        galleryItems = galleryItems.filter((galleryItem) => galleryItem.id !== item.id);
        renderGallery();
      } catch (error) {
        updateDonationStatus(error.message);
      }
    });

    galleryGrid.appendChild(node);
  });
};

const renderNotifications = () => {
  notificationList.innerHTML = "";

  notifications.forEach((item) => {
    const node = notificationTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".notification-type").textContent = item.type;
    node.querySelector(".notification-text").textContent = item.text;
    node.querySelector(".notification-date").textContent = item.date;
    notificationList.appendChild(node);
  });
};

const renderRoadmap = () => {
  roadmapList.innerHTML = "";

  roadmapItems.forEach((item) => {
    const node = roadmapTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".roadmap-phase").textContent = item.phase;
    node.querySelector(".roadmap-title").textContent = item.title;
    node.querySelector(".roadmap-copy").textContent = item.copy;
    roadmapList.appendChild(node);
  });
};

const renderDonations = () => {
  donationList.innerHTML = "";

  if (!donations.length) {
    donationList.innerHTML =
      '<p class="hero-text">Verified donations will appear here once payments start coming in.</p>';
    return;
  }

  donations.forEach((item) => {
    const node = donationTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".donation-name").textContent = item.donorName;
    node.querySelector(".donation-meta").textContent =
      `${item.status.toUpperCase()} • ${item.createdAtLabel}`;
    node.querySelector(".donation-amount").textContent = `INR ${Number(
      item.amount
    ).toLocaleString("en-IN")}`;
    donationList.appendChild(node);
  });
};

const loadGallery = async () => {
  galleryItems = await api("/api/gallery");
  renderGallery();
};

const loadNotifications = async () => {
  notifications = await api("/api/notifications");
  renderNotifications();
};

const loadRoadmap = async () => {
  roadmapItems = await api("/api/roadmap");
  renderRoadmap();
};

const loadDonations = async () => {
  donations = await api("/api/donations");
  renderDonations();
};

amountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    donationAmount.value = button.dataset.amount;
  });
});

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  adminKey = adminKeyInput.value.trim();
  localStorage.setItem(adminStorageKey, adminKey);
  updateDonationStatus(adminKey ? "Admin key saved for this browser." : "Admin key cleared.");
});

donationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const donorName = document.querySelector("#donor-name").value.trim();
  const donorEmail = document.querySelector("#donor-email").value.trim();
  const amount = Number(donationAmount.value);

  if (!donorName || !donorEmail || !amount) {
    updateDonationStatus("Please fill in your details before continuing.");
    return;
  }

  try {
    updateDonationStatus("Creating secure payment order...");
    const order = await api("/api/donations/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: donorName,
        email: donorEmail,
        amount,
      }),
    });

    if (!window.Razorpay) {
      throw new Error("Razorpay checkout script failed to load.");
    }

    const checkout = new window.Razorpay({
      key: order.key,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: "Donation to LCP Memorial",
      order_id: order.orderId,
      prefill: {
        name: order.donorName,
        email: order.donorEmail,
      },
      theme: {
        color: "#1f4f46",
      },
      handler: async (response) => {
        try {
          await api("/api/donations/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              donationId: order.donationId,
              ...response,
            }),
          });

          updateDonationStatus(
            `Payment verified. Reference: ${response.razorpay_payment_id}`
          );
          donationForm.reset();
          await loadDonations();
        } catch (error) {
          updateDonationStatus(error.message);
        }
      },
    });

    checkout.open();
    updateDonationStatus("Secure payment window opened.");
  } catch (error) {
    updateDonationStatus(error.message);
  }
});

galleryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = galleryImage.files?.[0];
  const caption = galleryCaption.value.trim();

  if (!file || !caption) {
    return;
  }

  try {
    const formData = new FormData();
    formData.append("caption", caption);
    formData.append("image", file);

    const item = await api("/api/gallery", {
      method: "POST",
      body: formData,
    });

    galleryItems.unshift(item);
    renderGallery();
    galleryForm.reset();
  } catch (error) {
    updateDonationStatus(error.message);
  }
});

notificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = notificationInput.value.trim();

  if (!text) {
    return;
  }

  try {
    const item = await api("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    notifications.unshift(item);
    renderNotifications();
    notificationForm.reset();
  } catch (error) {
    updateDonationStatus(error.message);
  }
});

const boot = async () => {
  try {
    adminKeyInput.value = adminKey;
    await Promise.all([
      loadGallery(),
      loadNotifications(),
      loadRoadmap(),
      loadDonations(),
    ]);
  } catch (error) {
    updateDonationStatus(error.message);
  }
};

boot();
