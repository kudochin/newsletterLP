/* ===================================================
   Admin Panel — JavaScript
   Login, availability management, bookings list
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = '/.netlify/functions';
  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  // All possible time slots
  const ALL_SLOTS = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
    '19:00', '19:30', '20:00',
  ];

  // ---- State ----
  let adminPassword = '';
  const state = {
    avail: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      data: {},
      selectedDate: null,
    },
    bookings: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      data: [],
    },
    bookingsRaw: {}, // month -> { date: [...bookings] }
  };

  // ---- DOM ----
  const DOM = {
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    passwordInput: document.getElementById('admin-password'),
    adminApp: document.getElementById('admin-app'),
    logoutBtn: document.getElementById('logout-btn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    // Availability
    adminMonthTitle: document.getElementById('admin-month-title'),
    adminPrev: document.getElementById('admin-prev-month'),
    adminNext: document.getElementById('admin-next-month'),
    adminDays: document.getElementById('admin-calendar-days'),
    slotEditor: document.getElementById('slot-editor'),
    slotEditorTitle: document.getElementById('slot-editor-title'),
    slotEditorContent: document.getElementById('slot-editor-content'),
    // Bookings
    bookingsMonthTitle: document.getElementById('bookings-month-title'),
    bookingsPrev: document.getElementById('bookings-prev-month'),
    bookingsNext: document.getElementById('bookings-next-month'),
    bookingsList: document.getElementById('bookings-list'),
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
  };

  // ---- Utility ----
  function getMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  function formatDateJP(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`;
  }

  function showToast(msg, type = '') {
    DOM.toast.className = 'toast' + (type ? ` ${type}` : '');
    DOM.toastMessage.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => DOM.toast.classList.add('hidden'), 3000);
  }

  async function apiCall(url, options = {}) {
    const headers = { ...options.headers, 'X-Admin-Password': adminPassword };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    return data;
  }

  // ---- Login ----
  DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminPassword = DOM.passwordInput.value;

    try {
      const monthKey = getMonthKey(state.avail.year, state.avail.month);
      await apiCall(`${API_BASE}/admin-set-availability?month=${monthKey}`, { method: 'GET' });
      DOM.loginScreen.classList.add('hidden');
      DOM.adminApp.classList.remove('hidden');
      DOM.loginError.classList.add('hidden');
      sessionStorage.setItem('admin_pwd', adminPassword);
      initAdmin();
    } catch (err) {
      DOM.loginError.textContent = "ログインエラー: " + err.message;
      DOM.loginError.classList.remove('hidden');
    }
  });

  // Auto-login from session
  const savedPwd = sessionStorage.getItem('admin_pwd');
  if (savedPwd) {
    adminPassword = savedPwd;
    DOM.loginScreen.classList.add('hidden');
    DOM.adminApp.classList.remove('hidden');
    initAdmin();
  }

  DOM.logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('admin_pwd');
    adminPassword = '';
    DOM.adminApp.classList.add('hidden');
    DOM.loginScreen.classList.remove('hidden');
    DOM.passwordInput.value = '';
  });

  // ---- Tabs ----
  DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.tabBtns.forEach(b => b.classList.remove('active'));
      DOM.tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'bookings') {
        loadBookings();
      }
    });
  });

  // ---- Availability Calendar ----
  async function loadAvailability() {
    const monthKey = getMonthKey(state.avail.year, state.avail.month);
    try {
      const data = await apiCall(`${API_BASE}/admin-set-availability?month=${monthKey}`, { method: 'GET' });
      state.avail.data = data.availability || {};
    } catch {
      state.avail.data = {};
    }

    // Also load bookings for this month to show booked slots
    try {
      const data = await apiCall(`${API_BASE}/admin-get-bookings?month=${monthKey}`, { method: 'GET' });
      state.bookingsRaw[monthKey] = {};
      (data.bookings || []).forEach(b => {
        if (!state.bookingsRaw[monthKey][b.date]) state.bookingsRaw[monthKey][b.date] = [];
        state.bookingsRaw[monthKey][b.date].push(b);
      });
    } catch {
      state.bookingsRaw[monthKey] = {};
    }

    renderAdminCalendar();
  }

  function renderAdminCalendar() {
    const { year, month } = state.avail;
    const monthKey = getMonthKey(year, month);
    DOM.adminMonthTitle.textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedData = state.bookingsRaw[monthKey] || {};

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="admin-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const slots = state.avail.data[dateStr] || [];
      const hasBookings = bookedData[dateStr] && bookedData[dateStr].length > 0;
      const isSelected = state.avail.selectedDate === dateStr;

      let classes = 'admin-day';
      if (slots.length > 0) classes += ' has-slots';
      if (hasBookings) classes += ' has-bookings';
      if (isSelected) classes += ' selected';

      html += `
        <div class="${classes}" data-date="${dateStr}">
          <span>${day}</span>
          ${slots.length > 0 ? `<span class="day-count">${slots.length}枠</span>` : ''}
        </div>
      `;
    }

    DOM.adminDays.innerHTML = html;

    DOM.adminDays.querySelectorAll('.admin-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        state.avail.selectedDate = el.dataset.date;
        renderAdminCalendar();
        renderSlotEditor();
      });
    });

    if (state.avail.selectedDate) {
      renderSlotEditor();
    }
  }

  function renderSlotEditor() {
    const dateStr = state.avail.selectedDate;
    if (!dateStr) return;

    const monthKey = dateStr.substring(0, 7);
    const currentSlots = state.avail.data[dateStr] || [];
    const bookedData = state.bookingsRaw[monthKey] || {};
    const bookedTimes = (bookedData[dateStr] || []).map(b => b.time);

    DOM.slotEditorTitle.textContent = formatDateJP(dateStr);

    let html = '<div class="time-toggle-grid">';
    ALL_SLOTS.forEach(slot => {
      const isActive = currentSlots.includes(slot);
      const isBooked = bookedTimes.includes(slot);
      let cls = 'time-toggle';
      if (isBooked) cls += ' booked';
      else if (isActive) cls += ' active';
      html += `<button class="${cls}" data-time="${slot}" ${isBooked ? 'disabled title="予約済み"' : ''}>${slot}${isBooked ? ' ✓' : ''}</button>`;
    });
    html += '</div>';
    html += '<button class="slot-save-btn" id="save-slots">保存する</button>';

    DOM.slotEditorContent.innerHTML = html;

    // Toggle slot
    DOM.slotEditorContent.querySelectorAll('.time-toggle:not(.booked)').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });

    // Save
    document.getElementById('save-slots').addEventListener('click', async () => {
      const selectedSlots = [];
      DOM.slotEditorContent.querySelectorAll('.time-toggle.active').forEach(btn => {
        selectedSlots.push(btn.dataset.time);
      });
      // Also keep booked slots in availability
      bookedTimes.forEach(t => {
        if (!selectedSlots.includes(t)) selectedSlots.push(t);
      });
      selectedSlots.sort();

      try {
        await apiCall(`${API_BASE}/admin-set-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: monthKey, date: dateStr, slots: selectedSlots }),
        });
        state.avail.data[dateStr] = selectedSlots;
        if (selectedSlots.length === 0) delete state.avail.data[dateStr];
        renderAdminCalendar();
        showToast('保存しました', 'success');
      } catch (err) {
        showToast('保存に失敗しました', 'error');
      }
    });
  }

  DOM.adminPrev.addEventListener('click', () => {
    state.avail.month--;
    if (state.avail.month < 0) { state.avail.month = 11; state.avail.year--; }
    state.avail.selectedDate = null;
    DOM.slotEditorContent.innerHTML = '<p class="slot-editor-hint">カレンダーの日付をクリックして、予約可能な時間帯を設定できます。</p>';
    DOM.slotEditorTitle.textContent = '日付を選択してください';
    loadAvailability();
  });

  DOM.adminNext.addEventListener('click', () => {
    state.avail.month++;
    if (state.avail.month > 11) { state.avail.month = 0; state.avail.year++; }
    state.avail.selectedDate = null;
    DOM.slotEditorContent.innerHTML = '<p class="slot-editor-hint">カレンダーの日付をクリックして、予約可能な時間帯を設定できます。</p>';
    DOM.slotEditorTitle.textContent = '日付を選択してください';
    loadAvailability();
  });

  // ---- Bookings List ----
  async function loadBookings() {
    const monthKey = getMonthKey(state.bookings.year, state.bookings.month);
    DOM.bookingsMonthTitle.textContent = `${state.bookings.year}年 ${state.bookings.month + 1}月`;

    try {
      const data = await apiCall(`${API_BASE}/admin-get-bookings?month=${monthKey}`, { method: 'GET' });
      state.bookings.data = data.bookings || [];
    } catch {
      state.bookings.data = [];
    }

    renderBookings();
  }

  function renderBookings() {
    if (state.bookings.data.length === 0) {
      DOM.bookingsList.innerHTML = '<p class="empty-msg">この月の予約はありません</p>';
      return;
    }

    let html = '';
    state.bookings.data.forEach(b => {
      html += `
        <div class="booking-item">
          <div class="booking-info">
            <span class="booking-datetime">${formatDateJP(b.date)} ${b.time}</span>
            <span class="booking-customer">${b.name} 様</span>
            <span class="booking-email">${b.email}</span>
          </div>
          <button class="cancel-btn" data-date="${b.date}" data-time="${b.time}" data-month="${b.date.substring(0, 7)}">キャンセル</button>
        </div>
      `;
    });

    DOM.bookingsList.innerHTML = html;

    DOM.bookingsList.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`${formatDateJP(btn.dataset.date)} ${btn.dataset.time} の予約をキャンセルしますか？`)) return;

        try {
          await apiCall(`${API_BASE}/admin-cancel-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: btn.dataset.date,
              time: btn.dataset.time,
              month: btn.dataset.month,
            }),
          });
          showToast('予約をキャンセルしました', 'success');
          loadBookings();
        } catch {
          showToast('キャンセルに失敗しました', 'error');
        }
      });
    });
  }

  DOM.bookingsPrev.addEventListener('click', () => {
    state.bookings.month--;
    if (state.bookings.month < 0) { state.bookings.month = 11; state.bookings.year--; }
    loadBookings();
  });

  DOM.bookingsNext.addEventListener('click', () => {
    state.bookings.month++;
    if (state.bookings.month > 11) { state.bookings.month = 0; state.bookings.year++; }
    loadBookings();
  });

  // ---- Init ----
  function initAdmin() {
    loadAvailability();
  }
});
