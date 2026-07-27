const state = {
  medicines: [], reminders: [], history: [], stats: {},
  filters: { search: '', status: 'all' }, medicinePage: 1, medicinesPerPage: 6
};
const notifiedReminderIds = new Set();
const pageTitles = { dashboard: 'Tổng quan', schedule: 'Lịch hôm nay', medicines: 'Thuốc', history: 'Lịch sử' };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const scheduleText = (medicine) => (medicine.schedules || []).map((item) => item.timeOfDay).join(', ') || 'Chưa đặt giờ uống';

async function loadData() {
  try {
    const [medicinesRes, remindersRes, historyRes, statsRes] = await Promise.all([
      fetch(`/api/medicines?search=${encodeURIComponent(state.filters.search)}&status=${state.filters.status}`).then((res) => res.json()),
      fetch('/api/reminders').then((res) => res.json()),
      fetch('/api/export/json').then((res) => res.text()).then(JSON.parse),
      fetch('/api/stats').then((res) => res.json())
    ]);
    state.medicines = medicinesRes;
    state.reminders = remindersRes;
    state.history = historyRes;
    state.stats = statsRes;
    const pages = Math.max(1, Math.ceil(state.medicines.length / state.medicinesPerPage));
    state.medicinePage = Math.min(state.medicinePage, pages);
    render();
  } catch (error) {
    console.error(error);
  }
}

function render() {
  const upcoming = state.reminders.filter((item) => item.status === 'pending');
  document.getElementById('totalMedicines').textContent = state.stats.totalMedicines ?? state.medicines.length;
  document.getElementById('todayTaken').textContent = state.reminders.filter((item) => item.status === 'taken').length;
  document.getElementById('adherenceRate').textContent = `${state.stats.adherenceRate ?? 0}%`;
  document.getElementById('missedCount').textContent = state.stats.missedCount ?? 0;
  document.getElementById('todaySummary').textContent = upcoming.length ? `Hôm nay còn ${upcoming.length} liều cần uống` : 'Không còn liều nào cần uống hôm nay';

  const streak = state.stats.streak ?? 0;
  document.getElementById('streakBox').innerHTML = `<strong>Chuỗi ngày tuân thủ</strong><p>${streak} ngày</p>`;
  const warningBox = document.getElementById('warningBox');
  warningBox.innerHTML = state.stats.warning ? `<strong>⚠ Nhắc nhở</strong><p>${escapeHtml(state.stats.warning)}</p>` : '<strong>Mọi thứ ổn</strong><p>Chưa có cảnh báo liều bị bỏ lỡ.</p>';
  warningBox.className = state.stats.warning ? 'item-card warning-card' : 'item-card';

  document.getElementById('reminderList').innerHTML = upcoming.length
    ? upcoming.map((item) => `<div class="item-card reminder-card"><div><div class="badge">${escapeHtml(item.medicine_name)}</div><p>${escapeHtml(item.scheduled_time)}</p></div><div class="dialog-actions"><button class="primary-btn" data-action="taken" data-id="${item.id}">Đã uống</button><button class="ghost-btn" data-action="snooze" data-id="${item.id}">Nhắc +10 phút</button></div></div>`).join('')
    : '<p class="empty-state">Không có lịch uống nào cần xử lý.</p>';

  renderMedicines();
  document.getElementById('historyList').innerHTML = state.history.length
    ? state.history.slice(0, 12).map((entry) => `<div class="item-card"><strong>${escapeHtml(entry.medicine_name)}</strong><p>${escapeHtml(entry.scheduled_time)} → ${escapeHtml(entry.actual_taken_at || 'Chưa uống')}</p><p class="muted">${escapeHtml(entry.status)}</p></div>`).join('')
    : '<p class="empty-state">Chưa có lịch sử dùng thuốc.</p>';
  document.getElementById('forgottenList').innerHTML = (state.stats.topForgottenMedicines || []).slice(0, 4).map((item) => `<div class="item-card"><strong>${escapeHtml(item.name)}</strong><p>${item.count} liều bỏ lỡ</p></div>`).join('');
  maybeShowNotifications();
}

function renderMedicines() {
  const total = state.medicines.length;
  const start = (state.medicinePage - 1) * state.medicinesPerPage;
  const pageItems = state.medicines.slice(start, start + state.medicinesPerPage);
  document.getElementById('medicineCount').textContent = total ? `Hiển thị ${start + 1}–${Math.min(start + state.medicinesPerPage, total)} trên ${total} thuốc` : 'Chưa có thuốc nào';
  document.getElementById('medicineList').innerHTML = pageItems.length
    ? pageItems.map((medicine) => `<article class="item-card medicine-card"><div class="medicine-card-head"><div><span class="badge ${medicine.active ? '' : 'paused-badge'}">${medicine.active ? 'Đang dùng' : 'Tạm dừng'}</span><h4>${escapeHtml(medicine.name)}</h4></div><div class="card-actions"><button class="text-btn" data-medicine-action="edit" data-id="${medicine.id}">Sửa</button><button class="text-btn danger-btn" data-medicine-action="delete" data-id="${medicine.id}">Xóa</button></div></div><p>${escapeHtml(medicine.description || 'Không có mô tả')}</p><p><strong>${escapeHtml(medicine.dosage || 'Chưa có liều lượng')} ${escapeHtml(medicine.unit || '')}</strong> · ${escapeHtml(scheduleText(medicine))}</p></article>`).join('')
    : '<p class="empty-state">Không tìm thấy thuốc phù hợp.</p>';
  renderPagination(total);
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / state.medicinesPerPage);
  const el = document.getElementById('medicinePagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="ghost-btn" data-page="${state.medicinePage - 1}" ${state.medicinePage === 1 ? 'disabled' : ''}>← Trước</button><span>Trang ${state.medicinePage} / ${totalPages}</span><button class="ghost-btn" data-page="${state.medicinePage + 1}" ${state.medicinePage === totalPages ? 'disabled' : ''}>Sau →</button>`;
}

function maybeShowNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  state.reminders.filter((item) => item.status === 'pending').forEach((reminder) => {
    if (!notifiedReminderIds.has(reminder.id)) {
      notifiedReminderIds.add(reminder.id);
      new Notification('Nhắc uống thuốc', { body: `${reminder.medicine_name} đến giờ uống lúc ${reminder.scheduled_time}` });
    }
  });
}

async function takeAction(id, action) {
  await fetch(action === 'taken' ? `/api/reminders/${id}/taken` : `/api/reminders/${id}/snooze`, { method: 'POST' });
  await loadData();
}

function openView(view) {
  document.querySelectorAll('.view-section').forEach((section) => section.classList.toggle('active', section.id === view));
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.getElementById('pageTitle').textContent = pageTitles[view];
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
  document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
}

function openMedicineDialog(medicine = null) {
  const form = document.getElementById('medicineForm');
  form.reset();
  form.elements.id.value = medicine?.id || '';
  form.elements.name.value = medicine?.name || '';
  form.elements.description.value = medicine?.description || '';
  form.elements.dosage.value = medicine?.dosage || '';
  form.elements.unit.value = medicine?.unit || 'viên';
  form.elements.notes.value = medicine?.notes || '';
  form.elements.startDate.value = medicine?.start_date || medicine?.startDate || '';
  form.elements.endDate.value = medicine?.end_date || medicine?.endDate || '';
  form.elements.schedules.value = medicine ? scheduleText(medicine).replace('Chưa đặt giờ uống', '') : '';
  form.elements.active.checked = medicine ? Boolean(medicine.active) : true;
  document.getElementById('medicineDialogTitle').textContent = medicine ? 'Sửa thuốc' : 'Thêm thuốc';
  document.getElementById('medicineDialog').showModal();
}

document.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('button[data-action]');
  if (actionButton) { event.preventDefault(); await takeAction(actionButton.dataset.id, actionButton.dataset.action); return; }
  const medicineButton = event.target.closest('button[data-medicine-action]');
  if (medicineButton) {
    const medicine = state.medicines.find((item) => String(item.id) === medicineButton.dataset.id);
    if (medicineButton.dataset.medicineAction === 'edit') openMedicineDialog(medicine);
    if (medicineButton.dataset.medicineAction === 'delete' && medicine && window.confirm(`Xóa thuốc “${medicine.name}”?`)) {
      await fetch(`/api/medicines/${medicine.id}`, { method: 'DELETE' });
      await loadData();
    }
    return;
  }
  const pageButton = event.target.closest('button[data-page]');
  if (pageButton && !pageButton.disabled) { state.medicinePage = Number(pageButton.dataset.page); renderMedicines(); return; }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) openView(viewButton.dataset.view);
  if (event.target.closest('.add-medicine-action')) openMedicineDialog();
});

document.getElementById('menuToggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const open = sidebar.classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('visible', open);
  document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
});
document.getElementById('sidebarBackdrop').addEventListener('click', () => openView(document.querySelector('.view-section.active').id));
document.getElementById('addMedicineBtn').addEventListener('click', () => openMedicineDialog());
document.getElementById('closeMedicineDialog').addEventListener('click', () => document.getElementById('medicineDialog').close());
document.getElementById('cancelMedicineDialog').addEventListener('click', () => document.getElementById('medicineDialog').close());
document.getElementById('searchInput').addEventListener('input', (event) => { state.filters.search = event.target.value; state.medicinePage = 1; loadData(); });
document.getElementById('statusFilter').addEventListener('change', (event) => { state.filters.status = event.target.value; state.medicinePage = 1; loadData(); });

document.getElementById('medicineForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const id = form.get('id');
  const payload = { name: form.get('name'), description: form.get('description'), dosage: form.get('dosage'), unit: form.get('unit'), notes: form.get('notes'), startDate: form.get('startDate'), endDate: form.get('endDate'), active: form.get('active') === 'on', schedules: form.get('schedules').split(',').map((time) => time.trim()).filter(Boolean).map((timeOfDay) => ({ timeOfDay })) };
  await fetch(id ? `/api/medicines/${id}` : '/api/medicines', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  document.getElementById('medicineDialog').close();
  await loadData();
});

document.getElementById('themeToggle').addEventListener('click', async () => {
  const html = document.documentElement; const nextTheme = html.dataset.theme === 'dark' ? 'light' : 'dark'; html.dataset.theme = nextTheme;
  await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ darkMode: nextTheme === 'dark' }) });
});
document.getElementById('exportBtn').addEventListener('click', async () => downloadResponse('/api/export/csv', 'history.csv'));
document.getElementById('backupBtn').addEventListener('click', async () => downloadResponse('/api/backup', 'medreminder-backup.json'));
async function downloadResponse(endpoint, filename) { const response = await fetch(endpoint); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error);
if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
fetch('/api/settings').then((res) => res.json()).then((settings) => { document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light'; }).catch(console.error);
loadData();
