import { createState, applyAction, escapeHtml } from './state.js';
import { renderOverview } from './overview.js';
import { renderDetails, renderDeviceList } from './details.js';
import { icon } from './art.js';
const app = document.querySelector('#app'),
  dialog = document.querySelector('#details'),
  announcer = document.querySelector('#announcer');
let state = createState(),
  route = null,
  history = [],
  query = '',
  openerKey = '',
  savedOverflow = '',
  toastTimer,
  backdropDown = false,
  commandFeedback = null,
  commandBusy = false,
  commandRevision = 0,
  failNextCommand = false;
const localActions = new Set(['light-room', 'blind-select', 'dismiss']);
function feedbackHtml() {
  if (!commandFeedback) return '';
  return `<div class="command-feedback" tabindex="-1" data-focus-key="command-feedback" data-status="${commandFeedback.status}" role="status"><span>${escapeHtml(commandFeedback.text)}</span>${commandFeedback.status === 'error' ? '<button data-action="retry-command" data-focus-key="retry-command">Retry</button>' : ''}${commandFeedback.status !== 'pending' ? '<button data-action="clear-command" aria-label="Dismiss command feedback">×</button>' : ''}</div>`;
}
function refreshCommand() {
  renderHome();
  if (dialog.open) updateDetails(true);
}
function sendDemoCommand(action) {
  if (action.type === 'blind' && action.roomId === 'selected' && !action.roomIds) action = { ...action, roomIds: [...state.blindRooms] };
  if (commandBusy) return;
  commandBusy = true;
  const revision = ++commandRevision;
  const fails = failNextCommand;
  failNextCommand = false;
  commandFeedback = { status: 'pending', text: 'Sending… · demo', action };
  refreshCommand();
  setTimeout(() => {
    if (revision !== commandRevision) return;
    commandBusy = false;
    if (fails) {
      commandFeedback = { status: 'error', text: 'Demo command failed. No device state changed.', action };
    } else {
      const message = applyAction(state, action);
      commandFeedback = {
        status: 'success',
        text: action.type === 'blind' ? 'Demo command accepted. Blind position is not reported.' : `${message || 'Updated'} · demo`,
      };
    }
    refreshCommand();
  }, 650);
}
function setCommandDisabled(root) {
  if (!commandBusy) return;
  root.querySelectorAll('[data-action]').forEach(el => {
    if (
      ['open', 'close', 'back', 'music-tab', 'speaker-disclosure', 'jump-room', 'forecast', 'scenario', 'reset', 'clear-search'].includes(
        el.dataset.action
      ) ||
      localActions.has(el.dataset.action)
    )
      return;
    el.disabled = true;
  });
}
function focusedKey() {
  return document.activeElement?.dataset.focusKey;
}
function restoreFocus(key, root = document) {
  if (!key) return false;
  const el = [...root.querySelectorAll('[data-focus-key]')].find(e => e.dataset.focusKey === key && !e.disabled);
  if (el) {
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}
function renderHome() {
  const key = dialog.open ? null : focusedKey();
  app.innerHTML = renderOverview(state) + (dialog.open ? '' : feedbackHtml());
  setCommandDisabled(app);
  updateClock();
  if (commandBusy && key) restoreFocus('command-feedback', dialog.open ? dialog : app);
  if (!restoreFocus(key, app) && key === 'end-mood') {
    app.querySelector('.mood-picker button')?.focus({ preventScroll: true });
  }
}
function updateDetails(preserve = false) {
  if (!route) return;
  const key = preserve ? focusedKey() : null,
    scroll = dialog.scrollTop;
  const content = renderDetails(state, route, query);
  dialog.dataset.kind = route.kind;
  dialog.innerHTML = `<header class="sheet-header">${history.length ? '<button class="icon-button" data-action="back" data-focus-key="sheet-back" aria-label="Back">' + icon('back') + '</button>' : ''}<h2 id="details-title" tabindex="-1">${content.title}</h2><button class="icon-button close" data-action="close" data-focus-key="sheet-close" aria-label="Close details">${icon('close')}</button></header><div class="sheet-body">${content.html}</div>${feedbackHtml()}<div class="sr-only" role="status" aria-live="polite" id="sheet-announcer"></div>`;
  setCommandDisabled(dialog);
  const search = dialog.querySelector('#device-search');
  if (search) search.value = query;
  if (preserve) {
    dialog.scrollTop = scroll;
    if (!restoreFocus(key, dialog)) dialog.querySelector('#details-title').focus();
  } else {
    dialog.scrollTop = 0;
    dialog.querySelector('#details-title').focus();
  }
}
function openDetails(next, trigger) {
  if (!dialog.open) {
    openerKey = trigger?.dataset.focusKey || 'devices';
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    history = [];
    query = '';
    route = next;
    updateDetails();
    dialog.showModal();
    dialog.querySelector('#details-title').focus();
  } else {
    history.push({ ...route, focusKey: trigger?.dataset.focusKey, scroll: dialog.scrollTop });
    route = next;
    updateDetails();
  }
}
function closeDetails() {
  dialog.close();
}
dialog.addEventListener('close', () => {
  document.body.style.overflow = savedOverflow;
  route = null;
  history = [];
  renderHome();
  if (!restoreFocus(openerKey, app)) restoreFocus('devices', app);
});
dialog.addEventListener('pointerdown', e => {
  const r = dialog.getBoundingClientRect();
  backdropDown = e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
});
dialog.addEventListener('click', e => {
  const r = dialog.getBoundingClientRect();
  if (backdropDown && e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom))
    closeDetails();
  backdropDown = false;
});
function announce(message) {
  if (!message) return;
  clearTimeout(toastTimer);
  announcer.textContent = message;
  announcer.classList.add('visible');
  const live = dialog.querySelector('#sheet-announcer');
  if (live) live.textContent = message;
  toastTimer = setTimeout(() => announcer.classList.remove('visible'), 2200);
}
function actionFor(el) {
  return {
    type: el.dataset.action,
    roomId: el.dataset.roomId,
    id: el.dataset.id,
    value: el.matches('input,select') ? el.value : el.dataset.value,
  };
}
function refreshSearch() {
  dialog.querySelector('#device-results').innerHTML = query.trim() ? renderDeviceList(state, query) : '';
}
document.addEventListener('click', event => {
  const el = event.target.closest('button[data-action]');
  if (!el || el.disabled) return;
  const a = actionFor(el);
  if (a.type === 'retry-command') {
    sendDemoCommand(commandFeedback.action);
    return;
  }
  if (a.type === 'clear-command') {
    commandFeedback = null;
    refreshCommand();
    return;
  }
  if (a.type === 'fail-next') {
    failNextCommand = true;
    closeDetails();
    announce('The next device command will fail in this demo.');
    return;
  }
  if (a.type === 'open') {
    openDetails({ kind: el.dataset.kind, id: el.dataset.id, tab: el.dataset.tab, category: 'All', room: 'All' }, el);
    return;
  }
  if (a.type === 'jump-room') {
    const target = dialog.querySelector('#lights-' + a.id);
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target?.querySelector('button')?.focus({ preventScroll: true });
    return;
  }
  if (a.type === 'close') {
    closeDetails();
    return;
  }
  if (a.type === 'back') {
    const previous = history.pop();
    if (previous) {
      route = previous;
      updateDetails();
      dialog.scrollTop = previous.scroll || 0;
      restoreFocus(previous.focusKey, dialog);
    }
    return;
  }
  if (a.type === 'scenario' || a.type === 'reset') {
    commandRevision++;
    commandBusy = false;
    commandFeedback = null;
    failNextCommand = false;
    state = createState(a.type === 'reset' ? state.scenario : a.value);
    renderHome();
    closeDetails();
    announce('Demo scene reset');
    return;
  }
  if (a.type === 'speaker-disclosure') {
    route[a.value] = !route[a.value];
    updateDetails(true);
    return;
  }
  if (a.type === 'music-tab') {
    route.tab = a.value;
    updateDetails(true);
    dialog.scrollTop = 0;
    return;
  }
  if (a.type === 'forecast') {
    route.period = a.value;
    updateDetails(true);
    return;
  }
  if (a.type === 'clear-search') {
    query = '';
    route.category = 'All';
    route.room = 'All';
    updateDetails();
    dialog.querySelector('#device-search').focus();
    return;
  }
  if (!localActions.has(a.type)) {
    sendDemoCommand(a);
    return;
  }
  const message = applyAction(state, a);
  renderHome();
  if (dialog.open) updateDetails(true);
  announce(message);
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'device-search') {
    query = el.value;
    refreshSearch();
    return;
  }
  if (!el.matches('input[type="range"][data-action]')) return;
  const output = el.parentElement.querySelector('output');
  if (output) output.textContent = el.value + (el.dataset.action === 'thermostat' ? '°' : '%');
});
document.addEventListener('change', event => {
  const el = event.target;
  if (!el.matches('[data-action]')) return;
  if (el.dataset.action === 'category' || el.dataset.action === 'room-filter') {
    route[el.dataset.action === 'category' ? 'category' : 'room'] = el.value;
    refreshSearch();
    return;
  }
  if (!localActions.has(el.dataset.action)) {
    sendDemoCommand(actionFor(el));
    return;
  }
  applyAction(state, actionFor(el));
  renderHome();
  if (dialog.open) updateDetails(true);
});
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button,input,select,a[href]')].filter(e => !e.disabled && e.getClientRects().length);
  const first = controls[0],
    last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement.id === 'details-title')) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
renderHome();

function updateClock() {
  const clock = app.querySelector('[data-clock]');
  if (clock) {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(now);
    clock.dateTime = now.toISOString();
  }
}
setInterval(updateClock, 60000);
