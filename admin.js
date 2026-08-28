(() => {
  "use strict";

  const state = {
    db: null,
    projects: [],
    currentProjectId: null,
    imageSlots: emptyImageSlots(),
    originalStoragePaths: new Set(),
    unsavedStoragePaths: new Set(),
    products: [],
    currentProductId: null,
    productImage: null,
    productOriginalStoragePath: null,
    productUnsavedStoragePath: null
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => Kura.escapeHtml(value);
  const pad = (n) => String(n).padStart(2, "0");

  function emptyImageSlots() {
    return { before: null, after: null, gallery0: null, gallery1: null, gallery2: null };
  }

  function showToast(message, isError = false) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? "#8a3b3b" : "#2f6b2c";
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function setLoginError(message = "") {
    const error = $("adminLoginError");
    error.textContent = message || "Incorrect email or password.";
    error.style.display = message ? "block" : "none";
  }

  function showLogin(message = "") {
    $("adminLogin").style.display = "block";
    $("adminShell").style.display = "none";
    setLoginError(message);
  }

  function showAdmin() {
    $("adminLogin").style.display = "none";
    $("adminShell").style.display = "block";
    setLoginError("");
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString("en-CA");
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleString("en-CA");
  }

  function serviceLabel(value) {
    return value === "in_person" ? "In-person" : "Virtual";
  }

  function monthBounds(value) {
    const [year, month] = value.split("-").map(Number);
    const last = new Date(year, month, 0).getDate();
    return { start: `${value}-01`, end: `${value}-${pad(last)}` };
  }

  async function verifyAdmin() {
    const { data: sessionData, error: sessionError } = await state.db.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return false;
    return Kura.isAdmin();
  }

  async function loadEverything() {
    const jobs = [loadBookings(), loadWaitlist(), loadSlots(), loadSettings(), loadProjects(), loadTestimonials(), loadProducts()];
    const results = await Promise.allSettled(jobs);
    for (const result of results) {
      if (result.status === "rejected") console.error(result.reason);
    }
  }

  window.adminLogin = async function adminLogin() {
    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;
    const button = $("adminLogin").querySelector("button");

    setLoginError("");
    if (!email || !password) {
      setLoginError("Enter the admin email and password.");
      return;
    }

    button.disabled = true;
    button.textContent = "Logging in…";

    try {
      const { error } = await state.db.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (!(await Kura.isAdmin())) {
        await state.db.auth.signOut();
        throw new Error("This account is not listed in admin_users.");
      }

      $("adminPassword").value = "";
      showAdmin();
      await loadEverything();
    } catch (error) {
      console.error(error);
      setLoginError(error.message || "Login failed.");
    } finally {
      button.disabled = false;
      button.textContent = "Log in";
    }
  };

  window.adminLogout = async function adminLogout() {
    try {
      await cleanupUnsavedUploads();
      await cleanupUnsavedProductUpload();
      await state.db.auth.signOut();
    } finally {
      showLogin();
    }
  };

  window.showTab = function showTab(name) {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${name}`);
    });

    const loaders = {
      bookings: loadBookings,
      waitlist: loadWaitlist,
      slots: loadSlots,
      settings: loadSettings,
      portfolio: loadProjects,
      testimonials: loadTestimonials,
      shop: loadProducts
    };
    loaders[name]?.().catch((error) => showToast(error.message, true));
  };

  async function loadBookings() {
    const body = $("bookingsBody");
    body.innerHTML = '<tr><td colspan="9" class="loading-inline">Loading…</td></tr>';

    const { data, error } = await state.db
      .from("bookings")
      .select("*")
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });
    if (error) throw error;

    body.innerHTML = (data || []).length ? data.map((booking) => {
      const nextStatus = booking.status === "confirmed" ? "cancelled" : "confirmed";
      const action = nextStatus === "cancelled" ? "Cancel" : "Restore";
      return `<tr>
        <td>${formatDate(booking.booking_date)}</td>
        <td>${esc(Kura.normalizeTime(booking.booking_time))}</td>
        <td>${esc(serviceLabel(booking.service_type))}</td>
        <td>${esc(booking.name)}</td>
        <td><a href="mailto:${esc(booking.email)}">${esc(booking.email)}</a></td>
        <td>${esc(booking.phone || "—")}</td>
        <td>${esc(booking.status)}</td>
        <td>${esc(booking.notes || "—")}</td>
        <td><button class="btn-outline" onclick="updateBookingStatus(${Number(booking.id)}, '${nextStatus}')">${action}</button></td>
      </tr>`;
    }).join("") : '<tr><td colspan="9">No bookings yet.</td></tr>';
  }

  window.updateBookingStatus = async function updateBookingStatus(id, status) {
    try {
      const { error } = await state.db.rpc("set_booking_status", {
        p_booking_id: id,
        p_status: status
      });
      if (error) throw error;
      showToast("Booking updated.");
      await Promise.all([loadBookings(), loadSlots()]);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not update the booking.", true);
    }
  };

  async function loadWaitlist() {
    const body = $("waitlistBody");
    body.innerHTML = '<tr><td colspan="6" class="loading-inline">Loading…</td></tr>';

    const { data, error } = await state.db
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    body.innerHTML = (data || []).length ? data.map((entry) => `<tr>
      <td>${formatDateTime(entry.created_at)}</td>
      <td>${esc(serviceLabel(entry.service_type))}</td>
      <td>${esc(entry.name)}</td>
      <td><a href="mailto:${esc(entry.email)}">${esc(entry.email)}</a></td>
      <td>${esc(entry.phone || "—")}</td>
      <td><button class="btn-outline danger" onclick="deleteWaitlistEntry(${Number(entry.id)})">Delete</button></td>
    </tr>`).join("") : '<tr><td colspan="6">The waitlist is empty.</td></tr>';
  }

  window.deleteWaitlistEntry = async function deleteWaitlistEntry(id) {
    if (!window.confirm("Delete this waitlist entry?")) return;
    try {
      const { error } = await state.db.from("waitlist").delete().eq("id", id);
      if (error) throw error;
      showToast("Waitlist entry deleted.");
      await loadWaitlist();
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  async function loadSlots() {
    const month = $("slotsMonthFilter").value;
    const body = $("slotsBody");
    body.innerHTML = '<tr><td colspan="4" class="loading-inline">Loading…</td></tr>';

    let query = state.db
      .from("availability_slots")
      .select("*")
      .eq("service_type", "virtual")
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true });

    if (month) {
      const { start, end } = monthBounds(month);
      query = query.gte("slot_date", start).lte("slot_date", end);
    }

    const { data, error } = await query;
    if (error) throw error;

    body.innerHTML = (data || []).length ? data.map((slot) => `<tr>
      <td>${formatDate(slot.slot_date)}</td>
      <td>${esc(Kura.normalizeTime(slot.slot_time))}</td>
      <td>${slot.is_booked ? "Booked" : "Open"}</td>
      <td>${slot.is_booked ? "—" : `<button class="btn-outline danger" onclick="deleteSlot(${Number(slot.id)})">Delete</button>`}</td>
    </tr>`).join("") : '<tr><td colspan="4">No slots for this month.</td></tr>';
  }

  window.loadSlots = loadSlots;

  window.addSlot = async function addSlot() {
    const date = $("newSlotDate").value;
    const time = $("newSlotTime").value;
    if (!date || !time) {
      showToast("Choose a date and time.", true);
      return;
    }

    try {
      const { error } = await state.db.from("availability_slots").insert({
        service_type: "virtual",
        slot_date: date,
        slot_time: time,
        is_booked: false
      });
      if (error) throw error;
      showToast("Slot added.");
      await loadSlots();
    } catch (error) {
      console.error(error);
      const message = error.code === "23505" ? "That slot already exists." : error.message;
      showToast(message, true);
    }
  };

  window.deleteSlot = async function deleteSlot(id) {
    if (!window.confirm("Delete this open slot?")) return;
    try {
      const { error } = await state.db.from("availability_slots").delete().eq("id", id);
      if (error) throw error;
      showToast("Slot deleted.");
      await loadSlots();
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  async function loadSettings() {
    const { data, error } = await state.db.from("settings").select("key,value");
    if (error) throw error;
    const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
    $("setStatus").value = map.in_person_status || "fully_booked";
    $("setUntil").value = map.in_person_until || "";
    $("setMessage").value = map.in_person_message || "";
  }

  window.saveSettings = async function saveSettings() {
    const rows = [
      { key: "in_person_status", value: $("setStatus").value },
      { key: "in_person_until", value: $("setUntil").value },
      { key: "in_person_message", value: $("setMessage").value.trim() }
    ];
    try {
      const { error } = await state.db.from("settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      showToast("Settings saved.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  function setPreview(slotName, image) {
    const idMap = {
      before: "prevBefore",
      after: "prevAfter",
      gallery0: "prevGallery0",
      gallery1: "prevGallery1",
      gallery2: "prevGallery2"
    };
    const preview = $(idMap[slotName]);
    if (!preview) return;
    preview.innerHTML = image?.image_path
      ? `<img src="${esc(image.image_path)}" alt="Uploaded project image">`
      : "none";
  }

  function projectImagesToSlots(project) {
    const slots = emptyImageSlots();
    const images = project?.images || [];
    slots.before = images.find((image) => image.label === "before") || null;
    slots.after = images.find((image) => image.label === "after") || null;
    const gallery = images.filter((image) => image.label === "gallery")
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    slots.gallery0 = gallery[0] || null;
    slots.gallery1 = gallery[1] || null;
    slots.gallery2 = gallery[2] || null;
    return slots;
  }

  async function cleanupUnsavedUploads() {
    const paths = [...state.unsavedStoragePaths];
    if (!paths.length || !state.db) return;
    const { error } = await state.db.storage.from(Kura.storageBucket).remove(paths);
    if (error) console.warn("Could not clean up unsaved uploads:", error);
    state.unsavedStoragePaths.clear();
  }

  window.uploadFor = async function uploadFor(slotName, input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      showToast("Use a JPG, PNG, WEBP or GIF image.", true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("The image must be smaller than 10 MB.", true);
      return;
    }

    try {
      const { data: userData, error: userError } = await state.db.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Session expired.");

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = `${userData.user.id}/${random}.${extension}`;

      const current = state.imageSlots[slotName];
      if (current?.storage_path && state.unsavedStoragePaths.has(current.storage_path)) {
        await state.db.storage.from(Kura.storageBucket).remove([current.storage_path]);
        state.unsavedStoragePaths.delete(current.storage_path);
      }

      const { error: uploadError } = await state.db.storage
        .from(Kura.storageBucket)
        .upload(storagePath, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = state.db.storage.from(Kura.storageBucket).getPublicUrl(storagePath);
      const label = slotName.startsWith("gallery") ? "gallery" : slotName;
      const sortOrder = slotName.startsWith("gallery") ? Number(slotName.replace("gallery", "")) : 0;
      const image = {
        image_path: publicData.publicUrl,
        storage_path: storagePath,
        label,
        sort_order: sortOrder
      };

      state.imageSlots[slotName] = image;
      state.unsavedStoragePaths.add(storagePath);
      setPreview(slotName, image);
      showToast("Image uploaded. Save the project to keep it.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Image upload failed.", true);
    }
  };

  async function loadProjects() {
    const list = $("adminProjectList");
    list.innerHTML = '<div class="loading-inline">Loading…</div>';

    const { data, error } = await state.db
      .from("projects")
      .select("*,project_images(*)")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: false });
    if (error) throw error;

    state.projects = (data || []).map(Kura.normalizeProject);
    list.innerHTML = state.projects.length ? state.projects.map((project) => `
      <div class="admin-list-card">
        <div class="admin-list-main">
          ${project.cover_image ? `<img class="admin-project-thumb" src="${esc(project.cover_image)}" alt="">` : '<div class="admin-project-thumb"></div>'}
          <div>
            <h3>${esc(project.title)}</h3>
            <p>${esc(project.category)}${project.featured ? " · Featured" : ""}</p>
          </div>
        </div>
        <div class="admin-list-actions">
          <button class="btn-outline" onclick="editProject(${Number(project.id)})">Edit</button>
          <button class="btn-outline danger" onclick="deleteProject(${Number(project.id)})">Delete</button>
        </div>
      </div>`).join("") : '<div class="empty-state">No portfolio projects yet.</div>';
  }

  window.editProject = async function editProject(id) {
    const project = state.projects.find((item) => Number(item.id) === Number(id));
    if (!project) return;

    await cleanupUnsavedUploads();
    state.currentProjectId = Number(project.id);
    state.imageSlots = projectImagesToSlots(project);
    state.originalStoragePaths = new Set(project.images.map((image) => image.storage_path).filter(Boolean));

    $("pfId").value = project.id;
    $("pfTitle").value = project.title || "";
    $("pfCategory").value = project.category || "";
    $("pfPresentation").value = project.presentation_type || "before_after";
    $("pfLocation").value = project.location || "";
    $("pfDate").value = project.project_date || "";
    $("pfSummary").value = project.summary || "";
    $("pfGoals").value = project.goals || "";
    $("pfWhatChanged").value = project.what_changed || "";
    $("pfServiceFormat").value = project.service_format || "";
    $("pfClientItems").value = project.client_items || "";
    $("pfPurchasedItems").value = project.purchased_items || "";
    $("pfConstraints").value = project.constraints_text || "";
    $("pfFeatured").checked = Boolean(project.featured);

    for (const [slot, image] of Object.entries(state.imageSlots)) setPreview(slot, image);
    $("projectForm").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.resetProjectForm = async function resetProjectForm(options = {}) {
    if (options.cleanup !== false) await cleanupUnsavedUploads();
    $("projectForm").reset();
    $("pfId").value = "";
    $("pfPresentation").value = "before_after";
    state.currentProjectId = null;
    state.imageSlots = emptyImageSlots();
    state.originalStoragePaths = new Set();
    state.unsavedStoragePaths.clear();
    for (const slot of Object.keys(state.imageSlots)) setPreview(slot, null);
  };

  window.saveProject = async function saveProject() {
    const title = $("pfTitle").value.trim();
    const category = $("pfCategory").value;
    if (!title || !category) {
      showToast("Title and category are required.", true);
      return;
    }

    const project = {
      id: state.currentProjectId || null,
      title,
      category,
      presentation_type: $("pfPresentation").value,
      location: $("pfLocation").value.trim(),
      project_date: $("pfDate").value.trim(),
      summary: $("pfSummary").value.trim(),
      goals: $("pfGoals").value.trim(),
      what_changed: $("pfWhatChanged").value.trim(),
      service_format: $("pfServiceFormat").value.trim(),
      client_items: $("pfClientItems").value.trim(),
      purchased_items: $("pfPurchasedItems").value.trim(),
      constraints_text: $("pfConstraints").value.trim(),
      featured: $("pfFeatured").checked,
      sort_order: 0
    };

    const images = Object.values(state.imageSlots).filter(Boolean).map((image) => ({
      image_path: image.image_path,
      storage_path: image.storage_path || null,
      label: image.label,
      sort_order: Number(image.sort_order || 0)
    }));

    try {
      const { error } = await state.db.rpc("save_project", { p_project: project, p_images: images });
      if (error) throw error;

      const keptPaths = new Set(images.map((image) => image.storage_path).filter(Boolean));
      const removedPaths = [...state.originalStoragePaths].filter((path) => !keptPaths.has(path));
      if (removedPaths.length) {
        const { error: storageError } = await state.db.storage.from(Kura.storageBucket).remove(removedPaths);
        if (storageError) console.warn(storageError);
      }

      state.unsavedStoragePaths.clear();
      await resetProjectForm({ cleanup: false });
      await loadProjects();
      showToast("Project saved.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not save the project.", true);
    }
  };

  window.deleteProject = async function deleteProject(id) {
    if (!window.confirm("Delete this project and its images?")) return;
    try {
      const { data: paths, error } = await state.db.rpc("delete_project", { p_project_id: id });
      if (error) throw error;
      if (Array.isArray(paths) && paths.length) {
        const { error: storageError } = await state.db.storage.from(Kura.storageBucket).remove(paths);
        if (storageError) console.warn(storageError);
      }
      if (state.currentProjectId === Number(id)) await resetProjectForm({ cleanup: false });
      await loadProjects();
      showToast("Project deleted.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  async function loadTestimonials() {
    const list = $("testimonialList");
    list.innerHTML = '<div class="loading-inline">Loading…</div>';
    const { data, error } = await state.db
      .from("testimonials")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;

    list.innerHTML = (data || []).length ? data.map((item) => `
      <div class="admin-list-card">
        <div class="admin-list-main"><div>
          <h3>“${esc(item.quote)}”</h3>
          <p>${esc(item.author)} · ${item.active ? "Active" : "Hidden"}</p>
        </div></div>
        <div class="admin-list-actions">
          <button class="btn-outline" onclick="toggleTestimonial(${Number(item.id)}, ${!item.active})">${item.active ? "Hide" : "Show"}</button>
          <button class="btn-outline danger" onclick="deleteTestimonial(${Number(item.id)})">Delete</button>
        </div>
      </div>`).join("") : '<div class="empty-state">No testimonials yet.</div>';
  }

  window.addTestimonial = async function addTestimonial() {
    const quote = $("tQuote").value.trim();
    const author = $("tAuthor").value.trim();
    if (!quote || !author) {
      showToast("Quote and author are required.", true);
      return;
    }
    try {
      const { error } = await state.db.from("testimonials").insert({ quote, author, active: true, sort_order: 0 });
      if (error) throw error;
      $("tQuote").value = "";
      $("tAuthor").value = "";
      await loadTestimonials();
      showToast("Testimonial added.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  window.toggleTestimonial = async function toggleTestimonial(id, active) {
    try {
      const { error } = await state.db.from("testimonials").update({ active }).eq("id", id);
      if (error) throw error;
      await loadTestimonials();
      showToast("Testimonial updated.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  window.deleteTestimonial = async function deleteTestimonial(id) {
    if (!window.confirm("Delete this testimonial?")) return;
    try {
      const { error } = await state.db.from("testimonials").delete().eq("id", id);
      if (error) throw error;
      await loadTestimonials();
      showToast("Testimonial deleted.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  function setProductPreview(image) {
    const preview = $("prevProduct");
    if (!preview) return;
    preview.innerHTML = image?.image_path
      ? `<img src="${esc(image.image_path)}" alt="Product photo">`
      : "none";
  }

  async function cleanupUnsavedProductUpload() {
    const path = state.productUnsavedStoragePath;
    if (!path || !state.db) return;
    const { error } = await state.db.storage.from(Kura.storageBucket).remove([path]);
    if (error) console.warn("Could not clean up unsaved product image:", error);
    state.productUnsavedStoragePath = null;
  }

  window.uploadProductImage = async function uploadProductImage(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      showToast("Use a JPG, PNG, WEBP or GIF image.", true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("The image must be smaller than 10 MB.", true);
      return;
    }

    try {
      const { data: userData, error: userError } = await state.db.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Session expired.");

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = `products/${userData.user.id}/${random}.${extension}`;

      await cleanupUnsavedProductUpload();

      const { error: uploadError } = await state.db.storage
        .from(Kura.storageBucket)
        .upload(storagePath, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = state.db.storage.from(Kura.storageBucket).getPublicUrl(storagePath);
      const image = { image_path: publicData.publicUrl, storage_path: storagePath };

      state.productImage = image;
      state.productUnsavedStoragePath = storagePath;
      setProductPreview(image);
      showToast("Image uploaded. Save the product to keep it.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Image upload failed.", true);
    }
  };

  async function loadProducts() {
    const list = $("adminProductList");
    if (!list) return;
    list.innerHTML = '<div class="loading-inline">Loading…</div>';

    const { data, error } = await state.db
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: false });
    if (error) throw error;

    state.products = data || [];
    list.innerHTML = state.products.length ? state.products.map((product) => `
      <div class="admin-list-card">
        <div class="admin-list-main">
          ${product.image_path ? `<img class="admin-project-thumb" src="${esc(product.image_path)}" alt="">` : '<div class="admin-project-thumb"></div>'}
          <div>
            <h3>${esc(product.name)}</h3>
            <p>${product.price != null ? `$${esc(Number(product.price).toFixed(2))}` : "No price set"} · ${product.active ? "Visible" : "Hidden"}</p>
          </div>
        </div>
        <div class="admin-list-actions">
          <button class="btn-outline" onclick="editProduct(${Number(product.id)})">Edit</button>
          <button class="btn-outline danger" onclick="deleteProduct(${Number(product.id)})">Delete</button>
        </div>
      </div>`).join("") : '<div class="empty-state">No products yet.</div>';
  }

  window.editProduct = async function editProduct(id) {
    const product = state.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;

    await cleanupUnsavedProductUpload();
    state.currentProductId = Number(product.id);
    state.productImage = product.image_path ? { image_path: product.image_path, storage_path: product.storage_path } : null;
    state.productOriginalStoragePath = product.storage_path || null;

    $("spId").value = product.id;
    $("spName").value = product.name || "";
    $("spPrice").value = product.price != null ? product.price : "";
    $("spStripeLink").value = product.stripe_link || "";
    $("spDescription").value = product.description || "";
    $("spActive").checked = Boolean(product.active);

    setProductPreview(state.productImage);
    $("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.resetProductForm = async function resetProductForm(options = {}) {
    if (options.cleanup !== false) await cleanupUnsavedProductUpload();
    $("productForm").reset();
    $("spId").value = "";
    $("spActive").checked = true;
    state.currentProductId = null;
    state.productImage = null;
    state.productOriginalStoragePath = null;
    setProductPreview(null);
  };

  window.saveProduct = async function saveProduct() {
    const name = $("spName").value.trim();
    if (!name) {
      showToast("Product name is required.", true);
      return;
    }

    const priceRaw = $("spPrice").value.trim();
    const price = priceRaw ? Number(priceRaw) : null;
    if (priceRaw && Number.isNaN(price)) {
      showToast("Price must be a number, e.g. 45.00", true);
      return;
    }

    const product = {
      name,
      price,
      stripe_link: $("spStripeLink").value.trim() || null,
      description: $("spDescription").value.trim(),
      image_path: state.productImage?.image_path || null,
      storage_path: state.productImage?.storage_path || null,
      active: $("spActive").checked,
      sort_order: 0
    };

    try {
      let error;
      if (state.currentProductId) {
        ({ error } = await state.db.from("products").update(product).eq("id", state.currentProductId));
      } else {
        ({ error } = await state.db.from("products").insert(product));
      }
      if (error) throw error;

      if (state.productOriginalStoragePath && state.productOriginalStoragePath !== product.storage_path) {
        const { error: storageError } = await state.db.storage.from(Kura.storageBucket).remove([state.productOriginalStoragePath]);
        if (storageError) console.warn(storageError);
      }

      state.productUnsavedStoragePath = null;
      await resetProductForm({ cleanup: false });
      await loadProducts();
      showToast("Product saved.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not save the product.", true);
    }
  };

  window.deleteProduct = async function deleteProduct(id) {
    if (!window.confirm("Delete this product?")) return;
    try {
      const product = state.products.find((item) => Number(item.id) === Number(id));
      const { error } = await state.db.from("products").delete().eq("id", id);
      if (error) throw error;
      if (product?.storage_path) {
        const { error: storageError } = await state.db.storage.from(Kura.storageBucket).remove([product.storage_path]);
        if (storageError) console.warn(storageError);
      }
      if (state.currentProductId === Number(id)) await resetProductForm({ cleanup: false });
      await loadProducts();
      showToast("Product deleted.");
    } catch (error) {
      console.error(error);
      showToast(error.message, true);
    }
  };

  async function init() {
    try {
      state.db = Kura.requireClient();
      $("pfCategory").innerHTML = Kura.categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
      const today = new Date();
      $("slotsMonthFilter").value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
      $("newSlotDate").min = today.toISOString().slice(0, 10);

      const configuredEmail = Kura.config.adminEmail || "";
      if (configuredEmail && !configuredEmail.includes("YOUR_")) $("adminEmail").value = configuredEmail;

      if (await verifyAdmin()) {
        showAdmin();
        await loadEverything();
      } else {
        showLogin();
      }

      state.db.auth.onAuthStateChange(async (event) => {
        if (event === "SIGNED_OUT") showLogin();
      });
    } catch (error) {
      console.error(error);
      showLogin(error.message);
    }
  }

  window.addEventListener("beforeunload", () => {
    // Unsaved Storage objects are cleaned when the form is reset or the admin logs out.
  });
  document.addEventListener("DOMContentLoaded", init);
})();
