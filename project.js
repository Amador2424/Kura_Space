(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (value) => Kura.escapeHtml(value);
  const text = (value) => Kura.textToHtml(value);

  function projectCard(project) {
    const media = project.cover_image
      ? `<img src="${esc(project.cover_image)}" alt="${esc(project.title)}" loading="lazy">`
      : '<div class="project-card-placeholder">KURA SPACE PROJECT</div>';
    return `<a class="project-card" href="project.html?id=${encodeURIComponent(project.id)}">
      <div class="project-card-media">${media}</div>
      <div class="project-card-copy">
        <div class="project-card-meta">${esc(project.category)}</div>
        <h3>${esc(project.title)}</h3>
        <p>${esc(project.summary || "View project details.")}</p>
      </div>
    </a>`;
  }

  function infoCard(title, value) {
    if (!String(value || "").trim()) return "";
    return `<article class="project-info-card"><h3>${esc(title)}</h3><p>${text(value)}</p></article>`;
  }

  function renderProject(project) {
    document.title = `${project.title} — Kura Space`;
    const meta = [project.category, project.location, project.project_date].filter(Boolean).join(" · ");

    const comparison = project.before_image && project.after_image
      ? `<section class="project-comparison"><div class="project-inner">
          <div class="eyebrow">BEFORE &amp; AFTER</div><h2>The transformation</h2>
          <div class="comparison-grid">
            <div class="comparison-image"><img src="${esc(project.before_image)}" alt="Before ${esc(project.title)}"><span class="comparison-tag">BEFORE</span></div>
            <div class="comparison-image"><img src="${esc(project.after_image)}" alt="After ${esc(project.title)}"><span class="comparison-tag">AFTER</span></div>
          </div>
        </div></section>`
      : "";

    const details = [
      infoCard("Goals", project.goals),
      infoCard("What Changed", project.what_changed),
      infoCard("Service Format", project.service_format),
      infoCard("Client-Owned Items", project.client_items),
      infoCard("Purchased Items", project.purchased_items),
      infoCard("Constraints", project.constraints_text)
    ].filter(Boolean).join("");

    const galleryUrls = [...(project.gallery_images || [])];
    if (!comparison && project.after_image) galleryUrls.unshift(project.after_image);
    if (!comparison && project.before_image) galleryUrls.unshift(project.before_image);

    const gallery = galleryUrls.length
      ? `<section class="project-gallery"><div class="project-inner">
          <div class="eyebrow">PROJECT GALLERY</div><h2>Inside the finished space</h2>
          <div class="gallery-grid">${galleryUrls.map((url, index) => `<div class="gallery-image"><img src="${esc(url)}" alt="${esc(project.title)} image ${index + 1}" loading="lazy"></div>`).join("")}</div>
        </div></section>`
      : "";

    $("projectContent").innerHTML = `
      <section class="project-detail-hero"><div class="inner">
        <div class="project-detail-meta">${esc(meta)}</div>
        <h1>${esc(project.title)}</h1>
        ${project.summary ? `<p>${text(project.summary)}</p>` : ""}
      </div></section>
      ${comparison}
      ${details ? `<section class="project-information"><div class="project-inner"><div class="project-info-grid">${details}</div></div></section>` : ""}
      ${gallery}`;
  }

  async function init() {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      $("projectContent").innerHTML = '<div class="error-state" style="margin:60px auto;max-width:720px">Invalid project link.</div>';
      return;
    }

    try {
      const db = Kura.requireClient();
      const [projectResult, moreResult] = await Promise.all([
        db.from("projects").select("*,project_images(*)").eq("id", id).single(),
        db.from("projects").select("*,project_images(*)")
          .neq("id", id)
          .order("featured", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(3)
      ]);

      if (projectResult.error) throw projectResult.error;
      if (moreResult.error) throw moreResult.error;

      renderProject(Kura.normalizeProject(projectResult.data));
      const more = (moreResult.data || []).map(Kura.normalizeProject);
      $("moreProjectsGrid").innerHTML = more.length
        ? more.map(projectCard).join("")
        : '<div class="empty-state">More projects will be added soon.</div>';
    } catch (error) {
      console.error(error);
      $("projectContent").innerHTML = `<div class="error-state" style="margin:60px auto;max-width:720px">${esc(error.message || "Project not found.")}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
