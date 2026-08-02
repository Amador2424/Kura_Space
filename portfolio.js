(() => {
  "use strict";

  const state = { db: null, projects: [], testimonials: [], activeCategory: "All Projects" };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => Kura.escapeHtml(value);

  function projectCard(project) {
    const media = project.cover_image
      ? `<img src="${esc(project.cover_image)}" alt="${esc(project.title)}" loading="lazy">`
      : '<div class="project-card-placeholder">KURA SPACE PROJECT</div>';
    return `<a class="project-card" href="project.html?id=${encodeURIComponent(project.id)}">
      <div class="project-card-media">${media}</div>
      <div class="project-card-copy">
        <div class="project-card-meta">${esc(project.category)}</div>
        <h3>${esc(project.title)}</h3>
        <p>${esc(project.summary || "View this transformation and project details.")}</p>
      </div>
    </a>`;
  }

  function renderFilters() {
    const categories = ["All Projects", ...Kura.categories];
    $("filterBar").innerHTML = categories.map((category) => `
      <button type="button" class="portfolio-filter ${category === state.activeCategory ? "active" : ""}"
        data-category="${esc(category)}">${esc(category)}</button>`).join("");

    $("filterBar").querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeCategory = button.dataset.category;
        renderFilters();
        renderProjects();
      });
    });
  }

  function renderProjects() {
    const projects = state.activeCategory === "All Projects"
      ? state.projects
      : state.projects.filter((project) => project.category === state.activeCategory);

    $("projectsGrid").innerHTML = projects.length
      ? projects.map(projectCard).join("")
      : '<div class="empty-state">No projects are available in this category yet.</div>';
  }

  function renderFeatured() {
    const project = state.projects.find((item) => item.featured && item.before_image && item.after_image);
    const section = $("featuredTransform");
    if (!project) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    section.innerHTML = `<div class="featured-inner">
      <div class="featured-copy">
        <div class="eyebrow">FEATURED TRANSFORMATION</div>
        <h2>${esc(project.title)}</h2>
        <p>${esc(project.summary || "A thoughtful before-and-after transformation by Kura Space.")}</p>
        <a class="hero-cta" href="project.html?id=${encodeURIComponent(project.id)}">VIEW PROJECT →</a>
      </div>
      <div class="featured-images">
        <div class="featured-image"><img src="${esc(project.before_image)}" alt="Before ${esc(project.title)}"><span class="featured-label">BEFORE</span></div>
        <div class="featured-image"><img src="${esc(project.after_image)}" alt="After ${esc(project.title)}"><span class="featured-label">AFTER</span></div>
      </div>
    </div>`;
  }

  function renderTestimonials() {
    const section = $("testimonialSection");
    if (!state.testimonials.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    section.innerHTML = `<div class="testimonial-inner">
      <div class="eyebrow">CLIENT WORDS</div>
      <h2>What our clients say</h2>
      <div class="testimonial-grid">
        ${state.testimonials.slice(0, 6).map((item) => `<article class="testimonial-card">
          <blockquote>“${esc(item.quote)}”</blockquote>
          <cite>— ${esc(item.author)}</cite>
        </article>`).join("")}
      </div>
    </div>`;
  }

  async function init() {
    try {
      state.db = Kura.requireClient();
      const [projectsResult, testimonialsResult] = await Promise.all([
        state.db.from("projects").select("*,project_images(*)")
          .order("featured", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: false }),
        state.db.from("testimonials").select("*")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
      ]);

      if (projectsResult.error) throw projectsResult.error;
      if (testimonialsResult.error) throw testimonialsResult.error;

      state.projects = (projectsResult.data || []).map(Kura.normalizeProject);
      state.testimonials = testimonialsResult.data || [];
      renderFilters();
      renderProjects();
      renderFeatured();
      renderTestimonials();
    } catch (error) {
      console.error(error);
      $("projectsGrid").innerHTML = `<div class="error-state">${esc(error.message || "Could not load projects.")}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
