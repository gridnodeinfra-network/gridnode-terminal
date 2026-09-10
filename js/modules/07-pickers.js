export function showLabSeg(segment, button) {
  qa('[data-labseg-block]').forEach(block => block.style.display = block.dataset.labsegBlock === segment ? 'block' : 'none');
  qa('#labSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.labseg === segment));
  renderLab();
}
export function showYouSeg(segment, button) {
  qa('[data-youseg-block]').forEach(block => block.style.display = block.dataset.yousegBlock === segment ? 'block' : 'none');
  qa('#youSegTabs .time-tab').forEach(item => item.classList.toggle('active', item === button || item.dataset.youseg === segment));
}

function closeCustomPickers(except) {
  qa('.gn-custom-picker.open,.gn-custom-date.open').forEach(wrapper => {
    if (wrapper === except) return;
    wrapper.classList.remove('open');
    wrapper.querySelector('[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  });
}

function populateCustomPickerMenu(select, menu, wrapper, trigger) {
  menu.replaceChildren();
  Array.from(select.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gn-custom-picker-option';
    button.dataset.gnPickerValue = option.value;
    button.setAttribute('role', 'option');
    button.disabled = option.disabled;
    button.textContent = option.dataset.i18n ? tx(option.dataset.i18n, option.textContent) : option.textContent;
    button.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomPicker(select);
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus({ preventScroll: true });
    });
    menu.appendChild(button);
  });
}

function syncCustomPicker(select) {
  const wrapper = select?.closest('.gn-custom-picker');
  const trigger = wrapper?.querySelector('[data-gn-picker-trigger]');
  const menu = wrapper?.querySelector('.gn-custom-picker-menu');
  const option = Array.from(select?.options || []).find(item => item.value === select.value) || select?.options?.[0];
  if (!wrapper || !trigger || !menu || !option) return;
  const sourceValues = Array.from(select.options).map(item => item.value);
  const renderedValues = Array.from(menu.querySelectorAll('[data-gn-picker-value]')).map(item => item.dataset.gnPickerValue);
  if (sourceValues.length !== renderedValues.length || sourceValues.some((value, index) => renderedValues[index] !== value)) {
    populateCustomPickerMenu(select, menu, wrapper, trigger);
  }
  trigger.textContent = option.textContent;
  wrapper.querySelectorAll('[data-gn-picker-value]').forEach(button => {
    const source = Array.from(select.options).find(item => item.value === button.dataset.gnPickerValue);
    if (source) button.textContent = source.textContent;
    button.setAttribute('aria-selected', String(button.dataset.gnPickerValue === select.value));
    button.disabled = Boolean(source?.disabled);
  });
}

function installCustomSelect(select) {
  if (!select || select.dataset.gnPickerWired) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-custom-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'gn-custom-picker-trigger';
  trigger.dataset.gnPickerTrigger = 'true';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'gn-custom-picker-menu';
  menu.setAttribute('role', 'listbox');
  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  select.dataset.gnPickerWired = 'true';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(trigger, menu, select);
  populateCustomPickerMenu(select, menu, wrapper, trigger);
  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      syncCustomPicker(select);
      window.requestAnimationFrame(() => (menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('button:not(:disabled)'))?.focus());
    }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape' && wrapper.classList.contains('open')) {
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    closeCustomPickers(wrapper);
    wrapper.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    syncCustomPicker(select);
    const options = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    (event.key === 'ArrowUp' ? options.at(-1) : options.find(item => item.getAttribute('aria-selected') === 'true') || options[0])?.focus();
  });
  menu.addEventListener('keydown', event => {
    const options = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    const index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); wrapper.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
    options[next]?.focus();
  });
  select.addEventListener('change', () => syncCustomPicker(select));
  syncCustomPicker(select);
}

function renderCustomDatePopover(wrapper) {
  const month = wrapper._month;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const label = wrapper.querySelector('[data-gn-date-label]');
  const grid = wrapper.querySelector('[data-gn-date-grid]');
  if (!label || !grid) return;
  label.textContent = month.toLocaleDateString(document.documentElement.lang?.startsWith('es') ? 'es-419' : 'en-US', { month: 'long', year: 'numeric' });
  const first = new Date(year, monthIndex, 1).getDay();
  const total = new Date(year, monthIndex + 1, 0).getDate();
  const selected = wrapper.input.value || '';
  const dayLabels = document.documentElement.lang?.startsWith('es') ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  grid.innerHTML = `${dayLabels.map(day => `<span class="gn-custom-date-dow">${day}</span>`).join('')}${Array.from({ length: first }, () => '<span class="gn-custom-date-blank"></span>').join('')}${Array.from({ length: total }, (_, index) => { const day = index + 1, value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="gn-custom-date-day${value === selected ? ' selected' : ''}" data-gn-date-value="${value}">${day}</button>`; }).join('')}`;
}

function syncCustomDate(input) {
  const wrapper = input?.closest('.gn-custom-date');
  const trigger = wrapper?.querySelector('[data-gn-date-trigger]');
  if (!wrapper || !trigger) return;
  trigger.textContent = input.value ? formatDate(input.value, { month: 'short', day: 'numeric', year: 'numeric' }) : tx('research.selectDate', 'SELECT DATE');
}

function installCustomDate(input) {
  if (!input || input.dataset.gnDateWired) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-custom-date';
  wrapper.input = input;
  wrapper._month = input.value ? parseLocalDate(input.value) : new Date();
  wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'gn-custom-date-trigger';
  trigger.dataset.gnDateTrigger = 'true';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const popover = document.createElement('div');
  popover.className = 'gn-custom-date-popover';
  popover.id = `${input.id || createId('date')}-popover`;
  popover.setAttribute('role', 'dialog');
  trigger.setAttribute('aria-controls', popover.id);
  popover.innerHTML = '<div class="gn-custom-date-head"><button type="button" data-gn-date-prev aria-label="' + tx('date.prevMonth', 'Previous month') + '">‹</button><strong data-gn-date-label></strong><button type="button" data-gn-date-next aria-label="' + tx('date.nextMonth', 'Next month') + '">›</button></div><div class="gn-custom-date-grid" data-gn-date-grid></div><div class="gn-custom-date-foot"><button type="button" data-gn-date-today data-i18n="date.useToday">' + tx('date.useToday', 'USE TODAY') + '</button><button type="button" data-gn-date-close data-i18n="date.close">' + tx('date.close', 'CLOSE') + '</button></div>';
  input.type = 'text';
  input.readOnly = true;
  input.hidden = true;
  input.setAttribute('aria-hidden', 'true');
  input.dataset.gnDateWired = 'true';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(trigger, popover, input);
  window.GN_I18N?.applyTo?.(popover);

  function closeDatePopover({ restoreFocus = false } = {}) {
    wrapper.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    const open = !wrapper.classList.contains('open');
    closeCustomPickers(wrapper);
    wrapper.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { wrapper._month = input.value ? new Date(`${input.value}T00:00:00`) : new Date(); wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1); renderCustomDatePopover(wrapper); }
  });
  popover.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-gn-date-prev')) wrapper._month.setMonth(wrapper._month.getMonth() - 1);
    else if (target.hasAttribute('data-gn-date-next')) wrapper._month.setMonth(wrapper._month.getMonth() + 1);
    else if (target.hasAttribute('data-gn-date-today')) {
      input.value = todayISO();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      wrapper._month = new Date();
      wrapper._month = new Date(wrapper._month.getFullYear(), wrapper._month.getMonth(), 1);
      syncCustomDate(input);
      closeDatePopover({ restoreFocus: true });
    }
    else if (target.dataset.gnDateValue) {
      input.value = target.dataset.gnDateValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomDate(input);
      closeDatePopover({ restoreFocus: true });
    }
    else if (target.hasAttribute('data-gn-date-close')) closeDatePopover({ restoreFocus: true });
    renderCustomDatePopover(wrapper);
  });
  input.addEventListener('change', () => syncCustomDate(input));
  syncCustomDate(input);
}

function syncCustomPickers(root = document) {
  root.querySelectorAll('.gn-custom-picker select').forEach(syncCustomPicker);
  root.querySelectorAll('.gn-custom-date input').forEach(syncCustomDate);
}

function installCustomPickers(root = document) {
  root.querySelectorAll('select:not([data-gn-picker-wired])').forEach(installCustomSelect);
  root.querySelectorAll('input[type="date"]:not([data-gn-date-wired])').forEach(installCustomDate);
  if (!document.body.dataset.gnPickerDismiss) {
    document.body.dataset.gnPickerDismiss = 'true';
    document.addEventListener('click', event => { if (!event.target.closest('.gn-custom-picker,.gn-custom-date')) closeCustomPickers(); });
  }
}

