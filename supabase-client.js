(() => {
  "use strict";

  const config = window.KURA_SUPABASE || {};
  const categories = Object.freeze([
    "Professional Organizing",
    "Space Refresh & Rearranging",
    "Unpacking",
    "Virtual Organizing",
    "Decorating Guidance"
  ]);

  const configured =
    typeof config.url === "string" &&
    /^https:\/\/.+\.supabase\.co$/i.test(config.url) &&
    typeof config.publishableKey === "string" &&
    config.publishableKey.length > 20 &&
    !config.publishableKey.includes("YOUR_");

  let client = null;

  if (configured && window.supabase?.createClient) {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "kura-space-admin-auth"
      }
    });
  }

  function requireClient() {
    if (!window.supabase?.createClient) {
      throw new Error("The Supabase JavaScript library did not load.");
    }
    if (!configured || !client) {
      throw new Error(
        "Supabase is not configured. Open supabase-config.js and add your project URL and publishable key."
      );
    }
    return client;
  }

  async function isAdmin() {
    const db = requireClient();
    const { data, error } = await db.rpc("is_admin");
    if (error) throw error;
    return data === true;
  }

  function normalizeTime(value) {
    return String(value || "").slice(0, 5);
  }

  function normalizeProject(row) {
    const images = [...(row?.project_images || row?.images || [])]
      .sort((a, b) =>
        String(a.label || "").localeCompare(String(b.label || "")) ||
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        Number(a.id || 0) - Number(b.id || 0)
      );

    const before = images.find((image) => image.label === "before") || null;
    const after = images.find((image) => image.label === "after") || null;
    const gallery = images.filter((image) => image.label === "gallery");

    return {
      ...row,
      images,
      before_image: before?.image_path || null,
      after_image: after?.image_path || null,
      gallery_images: gallery.map((image) => image.image_path),
      cover_image:
        after?.image_path ||
        gallery[0]?.image_path ||
        before?.image_path ||
        null
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function textToHtml(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br>");
  }

  window.Kura = Object.freeze({
    config,
    configured,
    client,
    categories,
    requireClient,
    isAdmin,
    normalizeTime,
    normalizeProject,
    escapeHtml,
    textToHtml,
    storageBucket: config.storageBucket || "project-images"
  });
})();
