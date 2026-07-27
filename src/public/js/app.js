const state = { medicines: [], reminders: [], history: [], stats: {}, filters: { search: '', status: 'all' } };
const notifiedReminderIds = new Set();

async function loadData() {
  try {
    const [medicinesRes, remindersRes, historyRes, statsRes] = await Promise.all([
      fetch(`/api/medicines?search=${encodeURIComponent(state.filters.search)}&status=${state.filters.status}`).then((res) => res.json()),
      fetch('/api/reminders').then((res) => res.json()),
      fetch('/api/export/json').then((res) => res.text()).then((text) => JSON.parse(text)),
      fetch('/api/stats').then((res) => res.json())
    ]);
    state.medicines = medicinesRes;
    state.reminders = remindersRes;
    state.history = historyRes;
    state.stats = statsRes;
    render();
  } catch (error) {
    console.error(error);
  }
}

function render() {
  const reminderList = document.getElementById('reminderList');
  const medicineList = document.getElementById('medicineList');
  const historyList = document.getElementById('historyList');
  const forgottenList = document.getElementById('forgottenList');
  const todaySummary = document.getElementById('todaySummary');
  const streakBox = document.getElementById('streakBox');
  const warningBox = document.getElementById('warningBox');

  document.getElementById('totalMedicines').textContent = state.medicines.length;
  document.getElementById('todayTaken').textContent = state.reminders.filter((item) => item.status === 'taken').length;
  document.getElementById('adherenceRate').textContent = `${state.stats.adherenceRate ?? 0}%`;
  document.getElementById('missedCount').textContent = state.stats.missedCount ?? 0;
  streakBox.innerHTML = `<strong>Current streak</strong><p>${state.stats.streak ?? 0} day${(state.stats.streak ?? 0) === 1 ? '' : 's'}</p>`;
  warningBox.innerHTML = state.stats.warning ? `<strong>⚠️ Reminder warning</strong><p>${state.stats.warning}</p>` : '<strong>All clear</strong><p>No missed-dose warning right now.</p>';
  warningBox.className = state.stats.warning ? 'item-card warning-card' : 'item-card';

  const upcoming = state.reminders.filter((reminder) => reminder.status === 'pending');
  todaySummary.textContent = upcoming.length ? `${upcoming.length} doses due soon` : 'No pending reminders today';
  reminderList.innerHTML = upcoming.length
    ? upcoming.slice(0, 4).map((item) => `<div class="item-card"><div class="badge">${item.medicine_name}</div><p>${item.scheduled_time}</p><div class="dialog-actions"><button class="primary-btn" data-action="taken" data-id="${item.id}">Taken</button><button class="ghost-btn" data-action="snooze" data-id="${item.id}">Snooze +10m</button></div></div>`).join('')
    : '<p>No reminders scheduled.</p>';

  medicineList.innerHTML = state.medicines.map((medicine) => `<div class="item-card"><div class="badge">${medicine.active ? 'Active' : 'Paused'}</div><h4>${medicine.name}</h4><p>${medicine.description || 'No description'}</p><p>${medicine.dosage} ${medicine.unit}</p></div>`).join('');
  historyList.innerHTML = state.history.slice(0, 6).map((entry) => `<div class="item-card"><strong>${entry.medicine_name}</strong><p>${entry.scheduled_time} → ${entry.actual_taken_at || 'pending'}</p><p>${entry.status}</p></div>`).join('');
  forgottenList.innerHTML = (state.stats.topForgottenMedicines || []).slice(0, 4).map((item) => `<div class="item-card"><strong>${item.name}</strong><p>${item.count} missed</p></div>`).join('');
  maybeShowNotifications();
}

function maybeShowNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const pending = state.reminders.filter((reminder) => reminder.status === 'pending');
  pending.forEach((reminder) => {
    if (!notifiedReminderIds.has(reminder.id)) {
      notifiedReminderIds.add(reminder.id);
      new Notification('Medication reminder', {
        body: `${reminder.medicine_name} is due at ${reminder.scheduled_time}`,
        icon: '/manifest.json'
      });
    }
  });
}

async function requestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

async function takeAction(id, action) {
  const endpoint = action === 'taken' ? `/api/reminders/${id}/taken` : `/api/reminders/${id}/snooze`;
  await fetch(endpoint, { method: 'POST' });
  await loadData();
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (target) {
    event.preventDefault();
    await takeAction(target.dataset.id, target.dataset.action);
  }
});

document.getElementById('addMedicineBtn').addEventListener('click', () => {
  document.getElementById('medicineDialog').showModal();
});

document.getElementById('searchInput').addEventListener('input', (event) => {
  state.filters.search = event.target.value;
  loadData();
});

document.getElementById('statusFilter').addEventListener('change', (event) => {
  state.filters.status = event.target.value;
  loadData();
});

document.getElementById('medicineForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = {
    name: form.get('name'),
    description: form.get('description'),
    dosage: form.get('dosage'),
    unit: form.get('unit'),
    notes: form.get('notes'),
    startDate: form.get('startDate'),
    endDate: form.get('endDate'),
    schedules: form.get('schedules').split(',').filter(Boolean).map((time) => ({ timeOfDay: time.trim() }))
  };
  await fetch('/api/medicines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  event.target.reset();
  document.getElementById('medicineDialog').close();
  await loadData();
});

document.getElementById('themeToggle').addEventListener('click', async () => {
  const html = document.documentElement;
  const nextTheme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = nextTheme;
  await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ darkMode: nextTheme === 'dark' }) });
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  const response = await fetch('/api/export/csv');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'history.csv';
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById('backupBtn').addEventListener('click', async () => {
  const response = await fetch('/api/backup');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'medreminder-backup.json';
  link.click();
  URL.revokeObjectURL(url);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}

requestNotifications();
loadData();
