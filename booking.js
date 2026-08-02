(() => {
  "use strict";

  const state = {
    db: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    availability: new Map(),
    selectedDate: null,
    selectedTime: null
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");

  function showToast(message, isError = false) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? "#8a3b3b" : "#2f6b2c";
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function emailIsValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function monthBounds(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const last = new Date(year, month + 1, 0).getDate();
    return {
      start: `${year}-${pad(month + 1)}-01`,
      end: `${year}-${pad(month + 1)}-${pad(last)}`
    };
  }

  function dateKey(year, monthIndex, day) {
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  }

  function formatLongDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date(year, month - 1, day));
  }

  async function loadSettings() {
    const { data, error } = await state.db
      .from("settings")
      .select("key,value")
      .in("key", ["in_person_status", "in_person_until", "in_person_message"]);

    if (error) throw error;

    const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
    const status = settings.in_person_status || "fully_booked";
    const until = settings.in_person_until || "";
    const message = settings.in_person_message ||
      "Kura Space is currently fully booked for in-person organizing services.";

    const bannerText = $("bannerStatusText");
    const statusButton = $("inPersonStatusBtn");
    const untilLabel = $("inPersonUntilLabel");
    const noTimesMessage = $("inPersonNoTimesMsg");
    const panelTag = document.querySelector("#inPersonPanel .tag");

    if (status === "available") {
      if (bannerText) bannerText.textContent = "In-person organizing appointments are currently available.";
      if (statusButton) {
        statusButton.disabled = false;
        statusButton.textContent = "AVAILABLE — CONTACT US";
        statusButton.onclick = () => { window.location.href = "contact.html"; };
      }
      if (untilLabel) untilLabel.textContent = "";
      if (noTimesMessage) noTimesMessage.textContent = "In-person appointments are available. Contact us to arrange your consultation.";
      if (panelTag) {
        panelTag.textContent = "AVAILABLE";
        panelTag.classList.remove("booked");
        panelTag.classList.add("available");
      }
    } else {
      if (bannerText) bannerText.textContent = message;
      if (statusButton) {
        statusButton.disabled = true;
        statusButton.innerHTML = `FULLY BOOKED<small id="inPersonUntilLabel"></small>`;
      }
      const newUntil = $("inPersonUntilLabel");
      if (newUntil) {
        newUntil.textContent = until ? `Through ${until}` : "";
      }
      if (noTimesMessage) noTimesMessage.textContent = message;
      if (panelTag) {
        panelTag.textContent = "FULLY BOOKED";
        panelTag.classList.add("booked");
        panelTag.classList.remove("available");
      }
    }
  }

  async function loadAvailability() {
    const { start, end } = monthBounds(state.month);
    const { data, error } = await state.db
      .from("availability_slots")
      .select("id,slot_date,slot_time")
      .eq("service_type", "virtual")
      .eq("is_booked", false)
      .gte("slot_date", start)
      .lte("slot_date", end)
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true });

    if (error) throw error;

    state.availability = new Map();
    for (const slot of data || []) {
      const time = Kura.normalizeTime(slot.slot_time);
      const list = state.availability.get(slot.slot_date) || [];
      list.push(time);
      state.availability.set(slot.slot_date, list);
    }

    state.selectedDate = null;
    state.selectedTime = null;
    $("timePanel").style.display = "none";
    $("bookingForm").style.display = "none";
    renderCalendar();
  }

  function renderCalendar() {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    $("calMonthLabel").textContent = new Intl.DateTimeFormat("en-CA", {
      month: "long",
      year: "numeric"
    }).format(state.month);

    const tbody = $("calBody");
    tbody.innerHTML = "";

    let day = 1;
    for (let row = 0; row < 6; row += 1) {
      const tr = document.createElement("tr");
      let hasDay = false;

      for (let col = 0; col < 7; col += 1) {
        const td = document.createElement("td");
        const cellIndex = row * 7 + col;

        if (cellIndex >= firstWeekday && day <= daysInMonth) {
          hasDay = true;
          const key = dateKey(year, month, day);
          const current = new Date(year, month, day);
          const div = document.createElement("div");
          div.className = "day-cell";
          div.textContent = String(day);

          if (current < today) {
            div.classList.add("disabled");
          } else if (state.availability.has(key)) {
            div.classList.add("has-slots");
            div.addEventListener("click", () => selectDate(key));
          }

          if (state.selectedDate === key) div.classList.add("selected");
          td.appendChild(div);
          day += 1;
        }

        tr.appendChild(td);
      }

      if (hasDay) tbody.appendChild(tr);
      if (day > daysInMonth) break;
    }
  }

  function selectDate(key) {
    state.selectedDate = key;
    state.selectedTime = null;
    renderCalendar();

    $("pickedDateLabel").textContent = formatLongDate(key);
    const list = $("timeSlotList");
    list.innerHTML = "";

    for (const time of state.availability.get(key) || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-slot";
      button.textContent = time;
      button.addEventListener("click", () => selectTime(time));
      list.appendChild(button);
    }

    $("timePanel").style.display = "block";
    $("bookingForm").style.display = "none";
  }

  function selectTime(time) {
    state.selectedTime = time;
    document.querySelectorAll(".time-slot").forEach((button) => {
      button.classList.toggle("selected", button.textContent === time);
    });
    $("bookingForm").style.display = "block";
    $("bookingForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  window.changeMonth = async function changeMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    try {
      await loadAvailability();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not load availability.", true);
    }
  };

  window.submitBooking = async function submitBooking() {
    const name = $("bfName").value.trim();
    const email = $("bfEmail").value.trim();
    const phone = $("bfPhone").value.trim();
    const notes = $("bfNotes").value.trim();
    const button = $("bookingForm").querySelector("button.btn-solid");

    if (!state.selectedDate || !state.selectedTime) {
      showToast("Please choose a date and time.", true);
      return;
    }
    if (name.length < 2) {
      showToast("Please enter your full name.", true);
      return;
    }
    if (!emailIsValid(email)) {
      showToast("Please enter a valid email address.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Booking…";

    try {
      const { error } = await state.db.rpc("create_booking", {
        p_service_type: "virtual",
        p_slot_date: state.selectedDate,
        p_slot_time: state.selectedTime,
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_notes: notes
      });

      if (error) throw error;

      showToast("Your virtual consultation is booked.");
      $("bfName").value = "";
      $("bfEmail").value = "";
      $("bfPhone").value = "";
      $("bfNotes").value = "";
      await loadAvailability();
    } catch (error) {
      console.error(error);
      showToast(error.message || "The booking could not be completed.", true);
      await loadAvailability().catch(() => {});
    } finally {
      button.disabled = false;
      button.textContent = "Continue to Booking";
    }
  };

  window.openWaitlistModal = function openWaitlistModal() {
    $("waitlistModal").style.display = "flex";
    $("wlName").focus();
  };

  window.closeWaitlistModal = function closeWaitlistModal() {
    $("waitlistModal").style.display = "none";
  };

  window.submitWaitlist = async function submitWaitlist() {
    const name = $("wlName").value.trim();
    const email = $("wlEmail").value.trim();
    const phone = $("wlPhone").value.trim();

    if (name.length < 2) {
      showToast("Please enter your full name.", true);
      return;
    }
    if (!emailIsValid(email)) {
      showToast("Please enter a valid email address.", true);
      return;
    }

    try {
      const { error } = await state.db.rpc("join_waitlist", {
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_service_type: "in_person"
      });
      if (error) throw error;

      $("wlName").value = "";
      $("wlEmail").value = "";
      $("wlPhone").value = "";
      closeWaitlistModal();
      showToast("You have been added to the waitlist.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not join the waitlist.", true);
    }
  };

  async function init() {
    try {
      state.db = Kura.requireClient();
      await Promise.all([loadSettings(), loadAvailability()]);
    } catch (error) {
      console.error(error);
      const bannerText = $("bannerStatusText");
      if (bannerText) bannerText.textContent = error.message;
      showToast(error.message, true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
