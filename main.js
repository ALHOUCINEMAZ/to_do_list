// main.js — Enhanced DOM To-Do (pure DOM + Tailwind + Lucide icons)
// Implements: themes, i18n, icons, search/filters/sort, priority, due dates, tags, inline edit,
// import/export, undo (single-step), keyboard shortcuts, accessibility, and persistence.

/* ======= Utilities ======= */
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const create = (tag, opts = {}) => {
  const el = document.createElement(tag);
  if (opts.classes) el.classList.add(...opts.classes);
  if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (opts.text) el.textContent = opts.text;
  if (opts.html) el.innerHTML = opts.html; // tiny, controlled usage
  return el;
};

const nowIso = () => new Date().toISOString();
const isOverdue = (due) => due && new Date(due) < new Date() && !isToday(due);
const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
};

const uid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 10000));

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Safely create lucide icons (if available)
function createIcon(name, opts = {}) {
  // Create placeholder span with data-lucide attr and optional sr-only label
  const span = document.createElement('span');
  span.setAttribute('data-lucide', name);
  span.classList.add('inline-block', 'align-middle');
  if (opts.ariaLabel) span.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) span.setAttribute('title', opts.title);
  return span;
}

// Call lucide to transform placeholders into SVGs if available
function wireIcons(root = document) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ parent: root });
  }
}

/* ======= Theme helpers (get/set/apply) ======= */
const THEME_KEY = 'theme';
let mmq = null; // MediaQueryList for prefers-color-scheme

function getTheme() {
  // prefer state.theme if present, otherwise check localStorage fallback
  if (state && state.theme) return state.theme;
  const stored = localStorage.getItem(THEME_KEY);
  return stored || 'system';
}

const debouncedSaveTheme = debounce((next) => {
  try {
    if (!state) state = {};
    state.theme = next;
    saveState();
    localStorage.setItem(THEME_KEY, next);
  } catch (e) { console.error(e); }
}, 200);

function applyTheme(theme) {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = (theme === 'dark') || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', !!isDark);
}

function setTheme(next) {
  // unbind previous listener
  if (mmq && typeof mmq.removeEventListener === 'function') {
    mmq.removeEventListener('change', onPrefersColorSchemeChange);
  }
  state.theme = next;
  applyTheme(next);
  updateThemeUI(next);
  // if system, bind listener
  if (next === 'system' && window.matchMedia) {
    mmq = window.matchMedia('(prefers-color-scheme: dark)');
    mmq.addEventListener ? mmq.addEventListener('change', onPrefersColorSchemeChange) : mmq.addListener(onPrefersColorSchemeChange);
  }
  debouncedSaveTheme(next);
}

function onPrefersColorSchemeChange() {
  if (state.theme === 'system') applyTheme('system');
}

function updateThemeUI(theme) {
  // set aria-pressed and selected classes on buttons if rendered
  const grp = document.querySelector('[data-theme-group]');
  if (!grp) return;
  Array.from(grp.querySelectorAll('[data-theme]')).forEach((btn) => {
    const val = btn.getAttribute('data-theme');
    const pressed = val === theme;
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.classList.toggle('bg-white', pressed);
    btn.classList.toggle('shadow', pressed);
    btn.classList.toggle('dark:bg-slate-800', pressed);
    if (!pressed) btn.classList.add('opacity-70');
    else btn.classList.remove('opacity-70');
  });
}

function renderThemeSwitcher(container) {
  // Build the group
  const group = create('div', { classes: ['flex', 'items-center', 'rounded-full', 'p-1', 'bg-slate-100', 'dark:bg-slate-700', 'border', 'border-slate-200', 'dark:border-slate-600'] });
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Theme');
  group.setAttribute('data-theme-group', '');

  const buttons = [
    { key: 'light', icon: 'sun', title: 'Light' },
    { key: 'dark', icon: 'moon', title: 'Dark' },
    { key: 'system', icon: 'monitor', title: 'System' },
  ];

  buttons.forEach(({ key, icon, title }, idx) => {
    const btn = create('button', { classes: ['inline-flex', 'items-center', 'justify-center', 'w-10', 'h-10', 'rounded-full', 'transition', 'focus-visible:outline-none', 'focus-visible:ring', 'focus-visible:ring-slate-300', 'dark:focus-visible:ring-slate-600'] });
    btn.type = 'button';
    btn.setAttribute('data-theme', key);
    btn.setAttribute('title', title);
    btn.setAttribute('aria-label', title);
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    // unselected default appearance
    btn.classList.add('opacity-70');
    const ic = createIcon(icon, { ariaLabel: title });
    btn.appendChild(ic);
    // click activates
    btn.addEventListener('click', (e) => { e.preventDefault(); setTheme(key); btn.focus(); });

    // keyboard support: Enter/Space activates; ArrowLeft/ArrowRight navigates
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTheme(key); }
      if (e.key === 'ArrowRight') {
        e.preventDefault(); const next = (idx + 1) % buttons.length; group.querySelectorAll('[data-theme]')[next].focus();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault(); const prev = (idx - 1 + buttons.length) % buttons.length; group.querySelectorAll('[data-theme]')[prev].focus();
      }
    });

    group.appendChild(btn);
  });

  container.appendChild(group);
  // ensure icons render
  wireIcons(group);
  // initialize UI to current theme
  const current = getTheme();
  updateThemeUI(current);
  // bind listener if system
  if (current === 'system' && window.matchMedia) {
    mmq = window.matchMedia('(prefers-color-scheme: dark)');
    mmq.addEventListener ? mmq.addEventListener('change', onPrefersColorSchemeChange) : mmq.addListener(onPrefersColorSchemeChange);
  }
}

/* ======= Translations (i18n) ======= */
const i18n = {
  en: {
    title: 'To-Do',
    addTask: 'Add Task',
    placeholder: 'New task...',
    emptyAlert: 'Please enter a task.',
    search: 'Search...',
    all: 'All',
    active: 'Active',
    completed: 'Completed',
    import: 'Import',
    export: 'Export',
    markAll: 'Mark all complete',
    clearCompleted: 'Clear completed',
    undo: 'Undo',
    remove: 'Remove',
    edit: 'Edit',
    due: 'Due',
    priority: 'Priority',
    tags: 'Tags',
    created: 'Created',
    noTasks: 'No tasks yet.',
  },
  fr: {
    title: 'Tâches',
    addTask: 'Ajouter',
    placeholder: 'Nouvelle tâche...',
    emptyAlert: 'Veuillez saisir une tâche.',
    search: 'Rechercher...',
    all: 'Toutes',
    active: 'Actives',
    completed: 'Terminées',
    import: 'Importer',
    export: 'Exporter',
    markAll: 'Tout marquer terminé',
    clearCompleted: 'Supprimer terminées',
    undo: 'Annuler',
    remove: 'Supprimer',
    edit: 'Modifier',
    due: 'Échéance',
    priority: 'Priorité',
    tags: 'Étiquettes',
    created: 'Créé',
    noTasks: "Aucune tâche pour l'instant.",
  },
  ar: {
    title: 'قائمة المهام',
    addTask: 'إضافة',
    placeholder: 'مهمة جديدة...',
    emptyAlert: 'يرجى إدخال مهمة.',
    search: 'بحث...',
    all: 'الكل',
    active: 'نشطة',
    completed: 'مكتملة',
    import: 'استيراد',
    export: 'تصدير',
    markAll: 'وضع كلها كمكتملة',
    clearCompleted: 'مسح المكتملة',
    undo: 'تراجع',
    remove: 'حذف',
    edit: 'تعديل',
    due: 'تاريخ الاستحقاق',
    priority: 'الأولوية',
    tags: 'الوسوم',
    created: 'تاريخ الإنشاء',
    noTasks: 'لا توجد مهام.',
  },
};

/* ======= State & Persistence ======= */
const STORAGE = 'dom-todo-advanced-v1';
const defaultState = {
  tasks: [],
  theme: 'system', // 'light'|'dark'|'system'
  lang: 'en',
  filter: 'all', // all|active|completed
  search: '',
  tagFilter: 'all',
  sortBy: 'created', // created|due|title|priority
};

let state = loadState();
let undoStack = null; // single-step undo payload

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign({}, defaultState, parsed);
    }
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return Object.assign({}, defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE, JSON.stringify(state));
}

function saveTasksAndState() {
  // state.tasks always in-memory canonical
  saveState();
}

/* ======= DOM Roots ======= */
const app = qs('#app');
app.innerHTML = ''; // start fresh

// Page root wrapper to limit wide frames and add horizontal padding
const pageRoot = create('div', { classes: ['w-full', 'max-w-screen', 'px-3', 'sm:px-4'] });
app.appendChild(pageRoot);

// Card / outer container (centered, responsive width)
const wrapper = create('div', { classes: ['max-w-xl', 'sm:max-w-2xl', 'mx-auto', 'w-full', 'mt-12', 'p-6', 'bg-white', 'rounded-2xl', 'shadow', 'dark:bg-slate-800', 'dark:text-slate-100'] });
pageRoot.appendChild(wrapper);

/* ======= Header (title, lang, theme) ======= */
// header wraps on small screens and allows children to shrink
const header = create('div', { classes: ['flex', 'flex-wrap', 'items-center', 'gap-3', 'mb-4'] });
wrapper.appendChild(header);

const titleEl = create('h1', { classes: ['text-2xl', 'font-semibold', 'text-slate-800', 'dark:text-slate-100'] });
header.appendChild(titleEl);

const headerControls = create('div', { classes: ['flex', 'items-center', 'gap-2', 'min-w-0'] });
header.appendChild(headerControls);

// Language selector
const langSelect = create('select', { classes: ['border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-1', 'bg-white', 'dark:bg-slate-700', 'focus-visible:ring'] });
Object.keys(i18n).forEach((code) => {
  const o = create('option');
  o.value = code;
  o.textContent = code.toUpperCase();
  langSelect.appendChild(o);
});
langSelect.value = state.lang;
langSelect.setAttribute('aria-label', 'Language');
headerControls.appendChild(langSelect);

// Render theme switcher control (Light / Dark / System)
renderThemeSwitcher(headerControls);

/* ======= Input Row (title, priority, due, tags, add) ======= */
const inputRow = create('div', { classes: ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-6', 'gap-3', 'mb-4'] });
wrapper.appendChild(inputRow);

const titleInput = create('input', { classes: ['lg:col-span-3', 'w-full', 'min-w-0', 'border', 'border-slate-300', 'rounded-xl', 'px-4', 'py-2', 'outline-none', 'focus:ring', 'focus:ring-slate-200'] });
titleInput.type = 'text';
titleInput.setAttribute('placeholder', i18n[state.lang].placeholder);
titleInput.setAttribute('aria-label', 'Task title');
inputRow.appendChild(titleInput);

// Priority select
const prioritySelect = create('select', { classes: ['lg:col-span-1', 'w-full', 'border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-2', 'bg-white', 'dark:bg-slate-700'] });
['none', 'low', 'medium', 'high'].forEach((p) => {
  const o = create('option');
  o.value = p;
  o.textContent = p.charAt(0).toUpperCase() + p.slice(1);
  prioritySelect.appendChild(o);
});
inputRow.appendChild(prioritySelect);

// Due date
const dueInput = create('input', { classes: ['lg:col-span-1', 'w-full', 'border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-2', 'bg-white', 'dark:bg-slate-700'] });
dueInput.type = 'date';
inputRow.appendChild(dueInput);

// Tags
const tagsInput = create('input', { classes: ['lg:col-span-3', 'sm:col-span-2', 'w-full', 'min-w-0', 'border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-2', 'bg-white', 'dark:bg-slate-700'] });
tagsInput.type = 'text';
tagsInput.setAttribute('placeholder', i18n[state.lang].tags + ' (comma)');
inputRow.appendChild(tagsInput);

const addBtn = create('button', { classes: ['lg:col-span-1', 'sm:justify-self-end', 'px-4', 'py-2', 'rounded-xl', 'bg-indigo-600', 'text-white', 'font-medium', 'hover:bg-indigo-700', 'active:scale-[.99]', 'transition', 'sm:ml-auto', 'order-last', 'sm:order-none'] });
addBtn.type = 'button';
addBtn.appendChild(createIcon('plus', { ariaLabel: 'Add' }));
const addLabel = create('span', { text: i18n[state.lang].addTask, classes: ['ml-2'] });
addBtn.appendChild(addLabel);
inputRow.appendChild(addBtn);

/* ======= Controls: Search, filters, sort, bulk actions, import/export ======= */
const controls = create('div', { classes: ['flex', 'flex-col', 'gap-2', 'mb-4'] });
wrapper.appendChild(controls);

// top row wraps and allows controls to wrap responsively
const topRow = create('div', { classes: ['flex', 'flex-wrap', 'items-center', 'gap-2'] });
controls.appendChild(topRow);

const searchInput = create('input', { classes: ['flex-1', 'min-w-[180px]', 'border', 'border-slate-300', 'rounded-xl', 'px-4', 'py-2'] });
searchInput.type = 'search';
searchInput.setAttribute('placeholder', i18n[state.lang].search);
searchInput.setAttribute('aria-label', 'Search tasks');
searchInput.value = state.search || '';
topRow.appendChild(searchInput);

// Filter buttons
const filterGroup = create('div', { classes: ['flex', 'items-center', 'gap-1'] });
['all', 'active', 'completed'].forEach((f) => {
  const b = create('button', { classes: ['px-3', 'py-1', 'rounded-xl', 'bg-slate-100', 'dark:bg-slate-700'] });
  b.type = 'button';
  b.textContent = i18n[state.lang][f];
  b.dataset.filter = f;
  if (state.filter === f) b.classList.add('ring');
  filterGroup.appendChild(b);
});
topRow.appendChild(filterGroup);

// Tag dropdown (built dynamically)
const tagSelect = create('select', { classes: ['border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-1', 'bg-white', 'dark:bg-slate-700'] });
const tagAll = create('option');
tagAll.value = 'all';
tagAll.textContent = 'All tags';
tagSelect.appendChild(tagAll);
tagSelect.value = state.tagFilter || 'all';
topRow.appendChild(tagSelect);

// Sort select
const sortSelect = create('select', { classes: ['border', 'border-slate-300', 'rounded-xl', 'px-3', 'py-1', 'bg-white', 'dark:bg-slate-700'] });
[['created','Created'], ['due','Due'], ['title','Title'], ['priority','Priority']].forEach(([v, t]) => {
  const o = create('option');
  o.value = v;
  o.textContent = t;
  sortSelect.appendChild(o);
});
sortSelect.value = state.sortBy;
topRow.appendChild(sortSelect);

// Bulk actions row
const bulkRow = create('div', { classes: ['flex', 'items-center', 'gap-2'] });
controls.appendChild(bulkRow);

const markAllBtn = create('button', { classes: ['px-3', 'py-1', 'rounded-xl', 'bg-slate-100', 'dark:bg-slate-700'] });
markAllBtn.type = 'button';
markAllBtn.textContent = i18n[state.lang].markAll;
bulkRow.appendChild(markAllBtn);

const clearCompletedBtn = create('button', { classes: ['px-3', 'py-1', 'rounded-xl', 'bg-rose-500', 'text-white'] });
clearCompletedBtn.type = 'button';
clearCompletedBtn.textContent = i18n[state.lang].clearCompleted;
bulkRow.appendChild(clearCompletedBtn);

// Import/Export
const importInput = create('input');
importInput.type = 'file';
importInput.accept = 'application/json';
importInput.classList.add('hidden');
bulkRow.appendChild(importInput);

const importBtn = create('button', { classes: ['px-3', 'py-1', 'rounded-xl', 'bg-slate-100'] });
importBtn.type = 'button';
importBtn.appendChild(createIcon('upload', { ariaLabel: 'Import' }));
importBtn.appendChild(create('span', { text: i18n[state.lang].import, classes: ['ml-2'] }));
bulkRow.appendChild(importBtn);

const exportBtn = create('button', { classes: ['px-3', 'py-1', 'rounded-xl', 'bg-slate-100'] });
exportBtn.type = 'button';
exportBtn.appendChild(createIcon('download', { ariaLabel: 'Export' }));
exportBtn.appendChild(create('span', { text: i18n[state.lang].export, classes: ['ml-2'] }));
bulkRow.appendChild(exportBtn);

/* ======= List & Footer ======= */
const list = create('ul', { classes: ['space-y-2', 'overflow-x-hidden'], attrs: { role: 'list' } });
wrapper.appendChild(list);

const footer = create('div', { classes: ['mt-4', 'flex', 'items-center', 'justify-between'] });
wrapper.appendChild(footer);

const counters = create('div');
footer.appendChild(counters);

const toastContainer = create('div', { classes: ['fixed', 'left-1/2', 'transform', '-translate-x-1/2', 'bottom-6', 'z-50'] });
app.appendChild(toastContainer);

/* ======= Rendering Helpers ======= */
function t(key) {
  return i18n[state.lang] && i18n[state.lang][key] ? i18n[state.lang][key] : i18n.en[key] || key;
}

function applyTheme() {
  if (state.theme === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  } else {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }
}

function buildTagOptions() {
  const tags = new Set();
  (state.tasks || []).forEach((task) => (task.tags || []).forEach((tg) => tags.add(tg)));
  // clear existing except 'all'
  tagSelect.innerHTML = '';
  const all = create('option'); all.value = 'all'; all.textContent = 'All tags'; tagSelect.appendChild(all);
  Array.from(tags).sort().forEach((tg) => {
    const o = create('option'); o.value = tg; o.textContent = tg; tagSelect.appendChild(o);
  });
  tagSelect.value = state.tagFilter || 'all';
}

function renderCounters() {
  const total = (state.tasks || []).length;
  const completed = (state.tasks || []).filter((t) => t.completed).length;
  const active = total - completed;
  counters.innerHTML = `${total} total · ${active} active · ${completed} completed`;
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(state.lang); } catch(e) { return iso; }
}

function priorityColor(p) {
  switch (p) {
    case 'low': return 'bg-green-400';
    case 'medium': return 'bg-yellow-400';
    case 'high': return 'bg-rose-500';
    default: return 'bg-slate-300';
  }
}

/* ======= Render List ======= */
function renderList() {
  // Clear
  list.innerHTML = '';

  // Build filtered, searched, sorted list
  let items = (state.tasks || []).slice();
  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter((it) => it.title.toLowerCase().includes(q) || (it.tags || []).some((tg) => tg.toLowerCase().includes(q)) || (it.notes || '').toLowerCase().includes(q));
  }
  // Filter
  if (state.filter === 'active') items = items.filter((t) => !t.completed);
  if (state.filter === 'completed') items = items.filter((t) => t.completed);
  // Tag filter
  if (state.tagFilter && state.tagFilter !== 'all') items = items.filter((t) => (t.tags || []).includes(state.tagFilter));
  // Sort
  if (state.sortBy === 'created') items.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (state.sortBy === 'due') items.sort((a,b) => ((a.dueDate || '') > (b.dueDate || '')) ? 1 : -1);
  if (state.sortBy === 'title') items.sort((a,b) => a.title.localeCompare(b.title));
  if (state.sortBy === 'priority') items.sort((a,b) => ({none:0,low:1,medium:2,high:3}[b.priority] - {none:0,low:1,medium:2,high:3}[a.priority]));

  if (items.length === 0) {
    const empty = create('p', { classes: ['text-slate-500'] });
    empty.textContent = t('noTasks');
    list.appendChild(empty);
    return;
  }

  items.forEach((task) => {
    const li = create('li', { classes: ['flex', 'items-center', 'justify-between', 'px-4', 'py-2', 'bg-slate-50', 'rounded-xl', 'border', 'border-slate-200', 'transition', 'duration-200'] });
    li.setAttribute('role', 'listitem');
    li.tabIndex = 0; // focusable for keyboard actions
    li.dataset.id = task.id;

    // Left area: priority dot + title + tags + due
    const left = create('div', { classes: ['flex', 'items-center', 'gap-3'] });
    const dot = create('span', { classes: ['w-3', 'h-3', 'rounded-full', priorityColor(task.priority || 'none')] });
    left.appendChild(dot);

  const titleSpan = create('span', { classes: ['text-slate-700', 'truncate', 'break-words', 'min-w-0'] });
    titleSpan.textContent = task.title;
    if (task.completed) titleSpan.classList.add('line-through', 'opacity-60');
    titleSpan.dataset.role = 'title';
    left.appendChild(titleSpan);

    // tags
    const tagsWrap = create('div', { classes: ['flex', 'gap-1'] });
    (task.tags || []).forEach((tg) => {
      const chip = create('span', { classes: ['text-xs', 'px-2', 'py-0.5', 'rounded-full', 'bg-slate-200', 'dark:bg-slate-700'] });
      chip.textContent = tg;
      tagsWrap.appendChild(chip);
    });
    left.appendChild(tagsWrap);

    // due
    if (task.dueDate) {
      const due = create('span', { classes: ['ml-2', 'text-sm'] });
      due.textContent = formatDate(task.dueDate);
      if (isOverdue(task.dueDate) && !task.completed) due.classList.add('text-rose-600');
      left.appendChild(due);
    }

    // Right area: actions
    const actions = create('div', { classes: ['flex', 'items-center', 'gap-2'] });

    // Complete/checkbox
    const completeBtn = create('button', { classes: ['px-2', 'py-1', 'rounded-lg', task.completed ? 'bg-green-500' : 'bg-slate-100'] });
    completeBtn.type = 'button';
    completeBtn.title = 'Toggle complete';
    completeBtn.appendChild(createIcon('check'));
    actions.appendChild(completeBtn);

    // Edit
    const editBtn = create('button', { classes: ['px-2', 'py-1', 'rounded-lg', 'bg-slate-100'] });
    editBtn.type = 'button';
    editBtn.appendChild(createIcon('pencil'));
    actions.appendChild(editBtn);

    // Remove
    const removeBtn = create('button', { classes: ['px-2', 'py-1', 'rounded-lg', 'bg-rose-500', 'text-white'] });
    removeBtn.type = 'button';
    removeBtn.appendChild(createIcon('trash'));
    actions.appendChild(removeBtn);

    li.appendChild(left);
    li.appendChild(actions);

    // small enter animation
    li.style.transform = 'scale(.98)';
    li.style.opacity = '0';
    requestAnimationFrame(() => {
      li.style.transition = 'transform .15s ease, opacity .15s ease';
      li.style.transform = '';
      li.style.opacity = '';
    });

    // event handlers (delegated at list level too)
    completeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      task.completed = !task.completed;
      saveState();
      renderList();
      renderCounters();
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(li, task);
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTaskWithUndo(task.id);
    });

    // keyboard support on li
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Delete') deleteTaskWithUndo(task.id);
      if (e.key.toLowerCase() === 'e') startInlineEdit(li, task);
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addTaskFromInputs();
    });

    list.appendChild(li);
  });

  wireIcons(list);
}

/* ======= Inline Edit ======= */
function startInlineEdit(li, task) {
  const titleSpan = li.querySelector('[data-role="title"]');
  if (!titleSpan) return;
  const input = create('input', { classes: ['border', 'border-slate-300', 'rounded-xl', 'px-2', 'py-1'] });
  input.type = 'text';
  input.value = task.title;
  titleSpan.replaceWith(input);
  input.focus();

  const finish = (save) => {
    if (save) task.title = input.value.trim() || task.title;
    saveState();
    renderList();
    renderCounters();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish(false);
    if (e.key === 'Enter') finish(true);
  });
  input.addEventListener('blur', () => finish(true));
}

/* ======= Add/Delete/Undo ======= */
function addTaskFromInputs() {
  const title = titleInput.value.trim();
  if (!title) { alert(t('emptyAlert')); return; }
  const newTask = {
    id: uid(),
    title,
    completed: false,
    priority: prioritySelect.value || 'none',
    dueDate: dueInput.value || null,
    notes: '',
    tags: tagsInput.value ? tagsInput.value.split(',').map(s=>s.trim()).filter(Boolean) : [],
    createdAt: nowIso(),
  };
  state.tasks.push(newTask);
  titleInput.value = '';
  tagsInput.value = '';
  dueInput.value = '';
  prioritySelect.value = 'none';
  saveState();
  buildTagOptions();
  renderList();
  renderCounters();
}

function deleteTaskWithUndo(id) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const removed = state.tasks.splice(idx, 1)[0];
  // Save for undo
  undoStack = { task: removed, time: Date.now() };
  saveState();
  renderList();
  renderCounters();
  showToast(`${t('remove')} — ${removed.title}`, t('undo'), () => {
    if (undoStack && undoStack.task && undoStack.task.id === removed.id) {
      state.tasks.push(undoStack.task);
      undoStack = null;
      saveState();
      buildTagOptions();
      renderList();
      renderCounters();
    }
  });
}

/* ======= Toast / Snackbar ======= */
function showToast(message, actionLabel, action) {
  toastContainer.innerHTML = '';
  const box = create('div', { classes: ['bg-slate-800', 'text-white', 'px-4', 'py-2', 'rounded-xl', 'flex', 'items-center', 'gap-4'] });
  box.setAttribute('role', 'status');
  const msg = create('div'); msg.textContent = message;
  box.appendChild(msg);
  if (action) {
    const a = create('button', { classes: ['bg-indigo-600', 'px-3', 'py-1', 'rounded-xl'] });
    a.textContent = actionLabel;
    a.addEventListener('click', () => { action(); toastContainer.innerHTML = ''; });
    box.appendChild(a);
  }
  toastContainer.appendChild(box);
  // auto dismiss
  setTimeout(() => { toastContainer.innerHTML = ''; }, 6000);
}

/* ======= Import / Export ======= */
function exportJSON() {
  const blob = new Blob([JSON.stringify({ tasks: state.tasks }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasks-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const incoming = (data.tasks || []).map((t) => ({ ...t, id: uid() }));
      state.tasks = state.tasks.concat(incoming);
      saveState();
      buildTagOptions();
      renderList();
      renderCounters();
    } catch (err) {
      alert('Invalid JSON');
    }
  };
  reader.readAsText(file);
}

/* ======= Event wiring ======= */
addBtn.addEventListener('click', addTaskFromInputs);
titleInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addTaskFromInputs();
});

searchInput.addEventListener('input', debounce((e) => {
  state.search = e.target.value.trim();
  saveState();
  renderList();
}, 250));

filterGroup.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.filter = b.dataset.filter;
  // update visuals
  filterGroup.querySelectorAll('button').forEach((btn) => btn.classList.remove('ring'));
  b.classList.add('ring');
  saveState();
  renderList();
});

tagSelect.addEventListener('change', (e) => { state.tagFilter = e.target.value; saveState(); renderList(); });
sortSelect.addEventListener('change', (e) => { state.sortBy = e.target.value; saveState(); renderList(); });

markAllBtn.addEventListener('click', () => {
  state.tasks.forEach((t) => (t.completed = true)); saveState(); renderList(); renderCounters();
});
clearCompletedBtn.addEventListener('click', () => {
  const before = state.tasks.slice();
  state.tasks = state.tasks.filter((t) => !t.completed);
  saveState(); renderList(); renderCounters();
  undoStack = { task: null, time: Date.now(), before };
  showToast('Cleared completed', t('undo'), () => { state.tasks = before; saveState(); renderList(); renderCounters(); undoStack = null; });
});

importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importJSONFile(f); importInput.value = ''; });
exportBtn.addEventListener('click', exportJSON);

langSelect.addEventListener('change', (e) => {
  state.lang = e.target.value;
  // update placeholders and labels
  titleInput.setAttribute('placeholder', t('placeholder'));
  tagsInput.setAttribute('placeholder', t('tags') + ' (comma)');
  searchInput.setAttribute('placeholder', t('search'));
  addLabel.textContent = t('addTask');
  markAllBtn.textContent = t('markAll');
  clearCompletedBtn.textContent = t('clearCompleted');
  saveState();
  // Arabic: set dir=rtl
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  renderList();
});

themeBtn.addEventListener('click', () => {
  // cycle themes
  state.theme = state.theme === 'light' ? 'dark' : (state.theme === 'dark' ? 'system' : 'light');
  applyTheme();
  saveState();
});

// Global keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') { e.preventDefault(); searchInput.focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { addTaskFromInputs(); }
});

/* ======= Init ======= */
function initDefaults() {
  if (!Array.isArray(state.tasks)) state.tasks = [];
  // apply theme & lang
  applyTheme();
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  titleEl.textContent = t('title');
  titleInput.setAttribute('placeholder', t('placeholder'));
  tagsInput.setAttribute('placeholder', t('tags') + ' (comma)');
  searchInput.setAttribute('placeholder', t('search'));
  addLabel.textContent = t('addTask');
  markAllBtn.textContent = t('markAll');
  clearCompletedBtn.textContent = t('clearCompleted');
}

initDefaults();
buildTagOptions();
renderList();
renderCounters();
wireIcons(document);

// expose for debugging
window.__todoAdvanced = { state, saveState, renderList };

/* ======= End of main.js ======= */
