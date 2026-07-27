const state = {
  medicines: [], reminders: [], history: [], stats: {},
  filters: { search: '', status: 'all' }, medicinePage: 1, medicinesPerPage: 6
};
const notifiedReminderIds = new Set();
const pageTitles = { dashboard: 'Tổng quan', schedule: 'Lịch hôm nay', medicines: 'Thuốc', history: 'Lịch sử' };
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
let pendingLoads = 0;
let toastTimer;

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const scheduleText = (medicine) => (medicine.schedules || []).map((item) => item.timeOfDay).join(', ') || 'Chưa đặt giờ uống';

// Scheduled times are stored as Vietnam wall-clock values. Do not let the browser
// reinterpret PostgreSQL's ISO serialisation as UTC.
function formatScheduledTime(value, withDate = false) {
  if (!value) return '—';
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return String(value);
  const [, year, month, day, hour, minute] = match;
  return withDate ? `${day}/${month}/${year} · ${hour}:${minute}` : `${hour}:${minute}`;
}

function formatVietnamInstant(value) {
  if (!value) return 'Chưa uống';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date).replace(', ', ' · ');
}

function updateLiveClock() {
  const now = new Date();
  document.getElementById('liveTime').textContent = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(now);
  document.getElementById('liveDate').textContent = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIME_ZONE, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(now);
}

function beginLoading(message = 'Đang tải dữ liệu...') {
  pendingLoads += 1;
  document.getElementById('loadingMessage').textContent = message;
  document.getElementById('loadingOverlay').hidden = false;
}

function endLoading() {
  pendingLoads = Math.max(0, pendingLoads - 1);
  if (!pendingLoads) document.getElementById('loadingOverlay').hidden = true;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type === 'error' ? 'error' : ''} visible`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3600);
}

async function requireSuccess(response) {
  if (!response.ok) throw new Error('Không thể xử lý yêu cầu. Vui lòng thử lại.');
  return response;
}

function urlBase64ToUint8Array(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`;
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Thiết bị này chưa hỗ trợ nhắc thông báo nền.', 'error');
    return;
  }
  beginLoading('Đang bật nhắc trên iPhone...');
  try {
    const keyResponse = await requireSuccess(await fetch('/api/push/public-key'));
    const { publicKey } = await keyResponse.json();
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Hãy chọn Cho phép khi iPhone hỏi.');
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await requireSuccess(await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription)
    }));
    document.getElementById('enablePushBtn').textContent = '✓ Đã bật nhắc iPhone';
    document.getElementById('enablePushBtn').disabled = true;
    showToast('Đã bật nhắc thuốc trên iPhone.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể bật thông báo.', 'error');
  } finally {
    endLoading();
  }
}

async function testPushNotification() {
  beginLoading('Sending test notification...');
  try {
    const response = await fetch('/api/push/test', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server could not send test notification.');
    showToast('Test notification sent. Check your iPhone.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not send test notification.', 'error');
  } finally {
    endLoading();
  }
}

async function retryDueNotifications() {
  beginLoading('Retrying due medicine notifications...');
  try {
    const response = await fetch('/api/push/retry-due', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not retry notifications.');
    showToast(result.delivered ? 'Reminder notification resent.' : 'No pending due reminder to resend.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not retry notifications.', 'error');
  } finally {
    endLoading();
  }
}

async function loadData() {
  beginLoading();
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
    showToast('Không tải được dữ liệu. Vui lòng thử lại.', 'error');
  } finally {
    endLoading();
  }
}

function render() {
  const upcoming = state.reminders.filter((item) => item.status === 'pending');
  document.getElementById('totalMedicines').textContent = state.stats.totalMedicines ?? state.medicines.length;
  document.getElementById('todayTaken').textContent = state.reminders.filter((item) => item.status === 'taken').length;
  document.getElementById('adherenceRate').textContent = `${state.stats.adherenceRate ?? 0}%`;
  document.getElementById('missedCount').textContent = state.stats.missedCount ?? 0;
  document.getElementById('todaySummary').innerHTML = upcoming.length
    ? `Hôm nay còn <strong class="dose-count">${upcoming.length}</strong> liều cần uống`
    : '<span class="all-done">✓ Đã hoàn thành tất cả liều hôm nay</span>';

  const streak = state.stats.streak ?? 0;
  const streakBox = document.getElementById('streakBox');
  const streakLevel = streak >= 30 ? 3 : streak >= 14 ? 2 : streak >= 7 ? 1 : 0;
  streakBox.className = `item-card streak-card streak-level-${streakLevel}`;
  streakBox.innerHTML = `<span class="streak-flame">${streak >= 7 ? '🔥' : '✦'}</span><div><strong>Chuỗi ngày tuân thủ</strong><p><b>${streak}</b> ngày liên tiếp</p></div>`;
  const warningBox = document.getElementById('warningBox');
  warningBox.innerHTML = state.stats.warning ? `<strong>⚠ Nhắc nhở</strong><p>${escapeHtml(state.stats.warning)}</p>` : '<strong>Mọi thứ ổn</strong><p>Chưa có cảnh báo liều bị bỏ lỡ.</p>';
  warningBox.className = state.stats.warning ? 'item-card warning-card' : 'item-card';

  document.getElementById('reminderList').innerHTML = state.reminders.length
    ? state.reminders.map((item) => `<div class="item-card reminder-card ${item.status === 'taken' ? 'is-taken' : ''}" data-reminder-id="${item.id}" tabindex="0" role="button" aria-label="Xem chi tiết liều ${escapeHtml(item.medicine_name)} lúc ${formatScheduledTime(item.scheduled_time)}"><div><div class="badge">${escapeHtml(item.medicine_name)}</div><p class="reminder-time">${formatScheduledTime(item.scheduled_time)} <span class="${item.status === 'taken' ? 'taken-label' : 'pending-label'}">${item.status === 'taken' ? 'Đã uống' : 'Chờ uống'}</span></p><span class="details-hint">Bấm để xem chi tiết →</span></div><div class="dialog-actions">${item.status === 'taken' ? '<span class="taken-label">✓ Đã ghi nhận</span>' : `<button class="primary-btn" data-action="taken" data-id="${item.id}">Đã uống</button><button class="ghost-btn" data-action="snooze" data-id="${item.id}">Nhắc +10 phút</button>`}</div></div>`).join('')
    : '<p class="empty-state">Chưa có lịch uống thuốc cho hôm nay.</p>';

  renderMedicines();
  document.getElementById('historyList').innerHTML = state.history.length
    ? state.history.slice(0, 12).map((entry) => `<div class="item-card"><strong>${escapeHtml(entry.medicine_name)}</strong><p>Giờ hẹn: ${formatScheduledTime(entry.scheduled_time, true)}</p><p>${entry.actual_taken_at ? `Đã uống: ${formatVietnamInstant(entry.actual_taken_at)}` : 'Chưa uống'}</p><span class="history-status ${entry.status === 'taken' ? 'history-taken' : 'history-pending'}">${entry.status === 'taken' ? '✓ Đã uống' : '◷ Đang chờ'}</span></div>`).join('')
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
    ? pageItems.map((medicine) => `<article class="item-card medicine-card" data-medicine-id="${medicine.id}" tabindex="0" role="button" aria-label="Xem chi tiết ${escapeHtml(medicine.name)}"><div class="medicine-card-head"><div><span class="badge ${medicine.active ? '' : 'paused-badge'}">${medicine.active ? 'Đang dùng' : 'Tạm dừng'}</span><h4>${escapeHtml(medicine.name)}</h4></div><div class="card-actions"><button class="text-btn" data-medicine-action="edit" data-id="${medicine.id}">Sửa</button><button class="text-btn danger-btn" data-medicine-action="delete" data-id="${medicine.id}">Xóa</button></div></div><p>${escapeHtml(medicine.description || 'Không có mô tả')}</p><p><strong>${escapeHtml(medicine.dosage || 'Chưa có liều lượng')} ${escapeHtml(medicine.unit || '')}</strong> · ${escapeHtml(scheduleText(medicine))}</p><span class="details-hint">Bấm để xem đầy đủ thông tin →</span></article>`).join('')
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
  beginLoading(action === 'taken' ? 'Đang ghi nhận liều đã uống...' : 'Đang dời lịch nhắc 10 phút...');
  try {
    await requireSuccess(await fetch(action === 'taken' ? `/api/reminders/${id}/taken` : `/api/reminders/${id}/snooze`, { method: 'POST' }));
    await loadData();
    showToast(action === 'taken' ? 'Đã ghi nhận liều đã uống.' : 'Đã dời giờ nhắc thêm 10 phút.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể cập nhật liều thuốc.', 'error');
  } finally {
    endLoading();
  }
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
  form.elements.startDate.value = dateInputValue(medicine?.start_date || medicine?.startDate);
  form.elements.endDate.value = dateInputValue(medicine?.end_date || medicine?.endDate);
  form.elements.schedules.value = medicine ? scheduleText(medicine).replace('Chưa đặt giờ uống', '') : '';
  form.elements.active.checked = medicine ? Boolean(medicine.active) : true;
  document.getElementById('medicineDialogTitle').textContent = medicine ? 'Sửa thuốc' : 'Thêm thuốc';
  document.getElementById('medicineDialog').showModal();
}

function formatDateOnly(value) {
  if (!value) return 'Không giới hạn';
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

function dateInputValue(value) {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function openMedicineDetails(medicine, reminder = null) {
  if (!medicine) return;
  const doseStatus = reminder
    ? `<div class="details-dose-status"><strong>Liều hôm nay</strong><p>${formatScheduledTime(reminder.scheduled_time, true)} <span class="${reminder.status === 'taken' ? 'taken-label' : 'pending-label'}">${reminder.status === 'taken' ? 'Đã uống' : 'Chờ uống'}</span></p>${reminder.actual_taken_at ? `<p>Ghi nhận lúc: ${formatVietnamInstant(reminder.actual_taken_at)}</p>` : ''}</div>`
    : '';
  document.getElementById('medicineDetails').innerHTML = `
    <div class="section-title"><div><span class="badge ${medicine.active ? '' : 'paused-badge'}">${medicine.active ? 'Đang dùng' : 'Tạm dừng'}</span><h3>${escapeHtml(medicine.name)}</h3></div><button type="button" class="icon-btn" data-close-details aria-label="Đóng">×</button></div>
    <p class="details-description">${escapeHtml(medicine.description || 'Chưa có mô tả cho thuốc này.')}</p>
    ${doseStatus}
    <dl class="details-grid">
      <div><dt>Liều lượng</dt><dd>${escapeHtml(medicine.dosage || 'Chưa cập nhật')} ${escapeHtml(medicine.unit || '')}</dd></div>
      <div><dt>Giờ uống</dt><dd>${escapeHtml(scheduleText(medicine))}</dd></div>
      <div><dt>Bắt đầu</dt><dd>${formatDateOnly(medicine.start_date || medicine.startDate)}</dd></div>
      <div><dt>Kết thúc</dt><dd>${formatDateOnly(medicine.end_date || medicine.endDate)}</dd></div>
    </dl>
    <div class="details-notes"><strong>Ghi chú</strong><p>${escapeHtml(medicine.notes || 'Không có ghi chú.')}</p></div>
    <div class="dialog-actions"><button class="ghost-btn" data-close-details>Đóng</button><button class="primary-btn" data-medicine-action="edit" data-id="${medicine.id}">Chỉnh sửa</button></div>`;
  document.getElementById('medicineDetailsDialog').showModal();
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-close-details]')) { document.getElementById('medicineDetailsDialog').close(); return; }
  const actionButton = event.target.closest('button[data-action]');
  if (actionButton) { event.preventDefault(); await takeAction(actionButton.dataset.id, actionButton.dataset.action); return; }
  const medicineButton = event.target.closest('button[data-medicine-action]');
  if (medicineButton) {
    const medicine = state.medicines.find((item) => String(item.id) === medicineButton.dataset.id);
    if (medicineButton.dataset.medicineAction === 'edit') { const detailsDialog = document.getElementById('medicineDetailsDialog'); if (detailsDialog.open) detailsDialog.close(); openMedicineDialog(medicine); }
    if (medicineButton.dataset.medicineAction === 'delete' && medicine && window.confirm(`Xóa thuốc “${medicine.name}”?`)) {
      beginLoading('Đang xóa thuốc...');
      try {
        await requireSuccess(await fetch(`/api/medicines/${medicine.id}`, { method: 'DELETE' }));
        await loadData();
        showToast('Đã xóa thuốc.');
      } catch (error) {
        console.error(error);
        showToast(error.message || 'Không thể xóa thuốc.', 'error');
      } finally {
        endLoading();
      }
    }
    return;
  }
  const medicineCard = event.target.closest('.medicine-card[data-medicine-id]');
  if (medicineCard) { openMedicineDetails(state.medicines.find((item) => String(item.id) === medicineCard.dataset.medicineId)); return; }
  const reminderCard = event.target.closest('.reminder-card[data-reminder-id]');
  if (reminderCard) {
    const reminder = state.reminders.find((item) => String(item.id) === reminderCard.dataset.reminderId);
    openMedicineDetails(state.medicines.find((item) => String(item.id) === String(reminder?.medicine_id)), reminder);
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
document.getElementById('medicineList').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
    const card = event.target.closest('.medicine-card[data-medicine-id]');
    if (card) { event.preventDefault(); openMedicineDetails(state.medicines.find((item) => String(item.id) === card.dataset.medicineId)); }
  }
});
document.getElementById('reminderList').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
    const card = event.target.closest('.reminder-card[data-reminder-id]');
    if (card) {
      event.preventDefault();
      const reminder = state.reminders.find((item) => String(item.id) === card.dataset.reminderId);
      openMedicineDetails(state.medicines.find((item) => String(item.id) === String(reminder?.medicine_id)), reminder);
    }
  }
});

document.getElementById('medicineForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const id = form.get('id');
  const payload = { name: form.get('name'), description: form.get('description'), dosage: form.get('dosage'), unit: form.get('unit'), notes: form.get('notes'), startDate: form.get('startDate'), endDate: form.get('endDate'), active: form.get('active') === 'on', schedules: form.get('schedules').split(',').map((time) => time.trim()).filter(Boolean).map((timeOfDay) => ({ timeOfDay })) };
  beginLoading(id ? 'Đang cập nhật thuốc...' : 'Đang thêm thuốc...');
  try {
    await requireSuccess(await fetch(id ? `/api/medicines/${id}` : '/api/medicines', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    document.getElementById('medicineDialog').close();
    await loadData();
    showToast(id ? 'Đã cập nhật thuốc.' : 'Đã thêm thuốc.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể lưu thuốc.', 'error');
  } finally {
    endLoading();
  }
});

document.getElementById('themeToggle').addEventListener('click', async () => {
  const html = document.documentElement; const nextTheme = html.dataset.theme === 'dark' ? 'light' : 'dark'; html.dataset.theme = nextTheme;
  document.getElementById('themeToggle').textContent = nextTheme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
  try {
    await requireSuccess(await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ darkMode: nextTheme === 'dark' }) }));
    showToast('Đã đổi giao diện.');
  } catch (error) {
    html.dataset.theme = nextTheme === 'dark' ? 'light' : 'dark';
    showToast('Không thể lưu giao diện.', 'error');
  }
});
document.getElementById('themeSelect').addEventListener('change', (event) => {
  document.documentElement.dataset.accent = event.target.value;
  localStorage.setItem('medreminder-accent', event.target.value);
});
document.getElementById('enablePushBtn').addEventListener('click', enablePushNotifications);
const testPushButton = document.createElement('button');
testPushButton.id = 'testPushBtn';
testPushButton.className = 'ghost-btn';
testPushButton.type = 'button';
testPushButton.textContent = 'Gửi thử thông báo';
testPushButton.addEventListener('click', testPushNotification);
document.getElementById('enablePushBtn').insertAdjacentElement('afterend', testPushButton);
const retryDueButton = document.createElement('button');
retryDueButton.className = 'ghost-btn';
retryDueButton.type = 'button';
retryDueButton.textContent = 'Gửi lại liều đến hạn';
retryDueButton.addEventListener('click', retryDueNotifications);
testPushButton.insertAdjacentElement('afterend', retryDueButton);
document.getElementById('exportBtn').addEventListener('click', async () => downloadResponse('/api/export/csv', 'history.csv'));
document.getElementById('backupBtn').addEventListener('click', async () => downloadResponse('/api/backup', 'medreminder-backup.json'));
async function downloadResponse(endpoint, filename) { const response = await fetch(endpoint); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error);
// iOS only permits this prompt after a direct tap in the Home Screen app.
// enablePushNotifications() requests it from the "Bật nhắc" button instead.
fetch('/api/settings').then((res) => res.json()).then((settings) => {
  document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
  document.getElementById('themeToggle').textContent = settings.darkMode ? 'Chế độ sáng' : 'Chế độ tối';
}).catch(console.error);
const savedAccent = localStorage.getItem('medreminder-accent') || 'indigo';
document.documentElement.dataset.accent = savedAccent;
document.getElementById('themeSelect').value = savedAccent;
updateLiveClock();
setInterval(updateLiveClock, 1000);
loadData();
