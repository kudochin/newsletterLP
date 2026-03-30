/* ===================================================
   Booking Page — JavaScript
   Calendar, time selection, Stripe checkout flow
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ---- State ----
  const state = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(), // 0-indexed
    availability: {},
    selectedDate: null,
    selectedTime: null,
    loading: false,
  };

  // ---- DOM Elements ----
  const DOM = {
    monthTitle: document.getElementById('calendar-month-title'),
    daysContainer: document.getElementById('calendar-days'),
    prevBtn: document.getElementById('prev-month'),
    nextBtn: document.getElementById('next-month'),
    loading: document.getElementById('calendar-loading'),
    timeSlotsContainer: document.getElementById('time-slots-container'),
    timeSlots: document.getElementById('time-slots'),
    selectedDateTitle: document.getElementById('selected-date-title'),
    steps: {
      datetime: document.getElementById('step-datetime'),
      form: document.getElementById('step-form'),
      confirm: document.getElementById('step-confirm'),
    },
    stepIndicators: document.querySelectorAll('.step'),
    bookingForm: document.getElementById('booking-form'),
    datetimeBadge: document.getElementById('selected-datetime-badge'),
    confirmDatetime: document.getElementById('confirm-datetime'),
    confirmName: document.getElementById('confirm-name'),
    confirmEmail: document.getElementById('confirm-email'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmMessageRow: document.getElementById('confirm-message-row'),
    submitBtn: document.getElementById('submit-booking'),
    errorToast: document.getElementById('error-toast'),
    errorMessage: document.getElementById('error-message'),
    errorClose: document.getElementById('error-close'),
  };

  const API_BASE = '/.netlify/functions';
  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  // ---- Utility ----
  function getMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  function formatDateJP(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`;
  }

  function showError(msg) {
    DOM.errorMessage.textContent = msg;
    DOM.errorToast.classList.remove('hidden');
    setTimeout(() => {
      DOM.errorToast.classList.add('hidden');
    }, 5000);
  }

  DOM.errorClose.addEventListener('click', () => {
    DOM.errorToast.classList.add('hidden');
  });

  // ---- Step Navigation ----
  function goToStep(stepName) {
    const stepMap = { datetime: 1, form: 2, confirm: 3 };
    const stepNum = stepMap[stepName];

    // Hide all steps
    Object.values(DOM.steps).forEach(el => el.classList.remove('active'));
    DOM.steps[stepName].classList.add('active');

    // Update step indicators
    DOM.stepIndicators.forEach(ind => {
      const num = parseInt(ind.dataset.step);
      ind.classList.remove('active', 'completed');
      if (num === stepNum) ind.classList.add('active');
      else if (num < stepNum) ind.classList.add('completed');
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Calendar Rendering ----
  function renderCalendar() {
    const year = state.currentYear;
    const month = state.currentMonth;
    const monthKey = getMonthKey(year, month);

    // Update title
    DOM.monthTitle.textContent = `${year}年 ${month + 1}月`;

    // Disable prev button if current or past month
    const now = new Date();
    const isCurrentOrPast = year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
    DOM.prevBtn.disabled = isCurrentOrPast;

    // Get first day and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const availability = state.availability[monthKey] || {};

    let html = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, day).getDay();
      const dateObj = new Date(year, month, day);
      dateObj.setHours(0, 0, 0, 0);
      const isPast = dateObj < today;
      const isAvailable = !isPast && availability[dateStr] && availability[dateStr].length > 0;
      const isToday = dateObj.getTime() === today.getTime();
      const isSelected = state.selectedDate === dateStr;

      let classes = 'calendar-day';
      if (isPast) classes += ' past';
      else if (isAvailable) classes += ' available';
      else classes += ' unavailable';

      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';
      if (dayOfWeek === 0) classes += ' sun-day';
      if (dayOfWeek === 6) classes += ' sat-day';

      const dataAttr = isAvailable ? `data-date="${dateStr}"` : '';
      html += `<div class="${classes}" ${dataAttr}>${day}</div>`;
    }

    DOM.daysContainer.innerHTML = html;

    // Bind click events to available days
    DOM.daysContainer.querySelectorAll('.calendar-day.available').forEach(el => {
      el.addEventListener('click', () => {
        selectDate(el.dataset.date);
      });
    });
  }

  // ---- Fetch Availability (excludes pending bookings) ----
  async function fetchAvailability(monthKey) {
    DOM.loading.classList.remove('hidden');
    try {
      const res = await fetch(`${API_BASE}/get-availability?month=${monthKey}`);
      const data = await res.json();
      if (data.availability) {
        state.availability[monthKey] = data.availability;
      }
    } catch (err) {
      console.error('Failed to fetch availability:', err);
      showError('空き状況の取得に失敗しました。ページを再読み込みしてください。');
    } finally {
      DOM.loading.classList.add('hidden');
    }
  }

  // ---- Select Date ----
  function selectDate(dateStr) {
    state.selectedDate = dateStr;
    state.selectedTime = null;

    renderCalendar();

    const monthKey = getMonthKey(state.currentYear, state.currentMonth);
    const slots = state.availability[monthKey]?.[dateStr] || [];

    DOM.selectedDateTitle.textContent = `${formatDateJP(dateStr)} の空き時間`;
    DOM.timeSlotsContainer.classList.remove('hidden');

    let slotsHtml = '';
    slots.sort().forEach(slot => {
      slotsHtml += `<button class="time-slot" data-time="${slot}">${slot}</button>`;
    });
    DOM.timeSlots.innerHTML = slotsHtml;

    // Bind time slot clicks
    DOM.timeSlots.querySelectorAll('.time-slot').forEach(el => {
      el.addEventListener('click', () => {
        selectTime(el.dataset.time);
      });
    });

    // Scroll to time slots
    DOM.timeSlotsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- Select Time ----
  function selectTime(time) {
    state.selectedTime = time;

    // Highlight selected
    DOM.timeSlots.querySelectorAll('.time-slot').forEach(el => {
      el.classList.toggle('selected', el.dataset.time === time);
    });

    // Go to form step
    setTimeout(() => {
      const formattedDate = formatDateJP(state.selectedDate);
      DOM.datetimeBadge.textContent = `📅 ${formattedDate} ${time}`;
      goToStep('form');
    }, 300);
  }

  // ---- Month Navigation ----
  DOM.prevBtn.addEventListener('click', async () => {
    state.currentMonth--;
    if (state.currentMonth < 0) {
      state.currentMonth = 11;
      state.currentYear--;
    }
    state.selectedDate = null;
    DOM.timeSlotsContainer.classList.add('hidden');
    const monthKey = getMonthKey(state.currentYear, state.currentMonth);
    if (!state.availability[monthKey]) {
      await fetchAvailability(monthKey);
    }
    renderCalendar();
  });

  DOM.nextBtn.addEventListener('click', async () => {
    state.currentMonth++;
    if (state.currentMonth > 11) {
      state.currentMonth = 0;
      state.currentYear++;
    }
    state.selectedDate = null;
    DOM.timeSlotsContainer.classList.add('hidden');
    const monthKey = getMonthKey(state.currentYear, state.currentMonth);
    if (!state.availability[monthKey]) {
      await fetchAvailability(monthKey);
    }
    renderCalendar();
  });

  // ---- Form Submission → Confirm ----
  DOM.bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('booking-name').value.trim();
    const email = document.getElementById('booking-email').value.trim();
    const message = document.getElementById('booking-message').value.trim();

    if (!name || !email) {
      showError('お名前とメールアドレスは必須です');
      return;
    }

    // Populate confirmation
    const formattedDate = formatDateJP(state.selectedDate);
    DOM.confirmDatetime.textContent = `${formattedDate} ${state.selectedTime}`;
    DOM.confirmName.textContent = name;
    DOM.confirmEmail.textContent = email;

    if (message) {
      DOM.confirmMessage.textContent = message;
      DOM.confirmMessageRow.style.display = '';
    } else {
      DOM.confirmMessageRow.style.display = 'none';
    }

    goToStep('confirm');
  });

  // ---- Back Buttons ----
  document.getElementById('back-to-calendar').addEventListener('click', () => {
    goToStep('datetime');
  });

  document.getElementById('back-to-form').addEventListener('click', () => {
    goToStep('form');
  });

  // ---- Submit Booking → Stripe Checkout ----
  DOM.submitBtn.addEventListener('click', async () => {
    const btnText = DOM.submitBtn.querySelector('.btn-text');
    const btnLoading = DOM.submitBtn.querySelector('.btn-loading');

    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    DOM.submitBtn.disabled = true;

    try {
      const name = document.getElementById('booking-name').value.trim();
      const email = document.getElementById('booking-email').value.trim();
      const message = document.getElementById('booking-message').value.trim();

      const res = await fetch(`${API_BASE}/create-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          date: state.selectedDate,
          time: state.selectedTime,
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '予約に失敗しました');
      }

      // If Stripe checkout URL is returned, redirect to Stripe
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Fallback: if no Stripe URL (Stripe not configured), show inline success
      window.location.href = `/booking-success.html?booking_id=${data.booking.id}`;

    } catch (err) {
      console.error('Booking error:', err);
      showError(err.message || '予約に失敗しました。時間を置いて再度お試しください。');
      btnText.classList.remove('hidden');
      btnLoading.classList.add('hidden');
      DOM.submitBtn.disabled = false;
    }
  });

  // ---- Initialize ----
  async function init() {
    const monthKey = getMonthKey(state.currentYear, state.currentMonth);
    await fetchAvailability(monthKey);
    renderCalendar();
  }

  init();
});
