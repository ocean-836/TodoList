/* 日子 Daylog · 原型交互逻辑
   结构：状态层（state）/ 数据层（mock.js、api.js）/ 视图层（本文件渲染函数） */

(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const getWeekStart = (d) => {
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  const icon = (name) => `<svg class="icon"><use href="#i-${name}"></use></svg>`;

  const TODAY = startOfDay(new Date());
  const TODAY_ISO = iso(TODAY);
  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];
  const STORAGE_KEY = 'daylog.state.v1';

  // 拖动悬浮球后，抑制随后冒出的 click（否则会被当成“展开”）
  let suppressWidgetClick = false;

  // 运行在 Tauri 桌面壳里时，用应用内按钮关闭程序，隐藏原型用的装饰
  if (window.__TAURI__) {
    document.documentElement.classList.add('is-tauri');
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        window.__TAURI__.core.invoke('quit_app');
      });
    }

    // 拖动：按住顶部栏 / 状态栏空白处即可移动整个窗体
    document.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (!e.target.closest('.topbar, .statusbar, .titlebar')) return;
      if (e.target.closest('button, input, textarea, select, a, .segmented, .drawer, .scrim')) return;
      e.preventDefault();
      window.__TAURI__.core.invoke('begin_drag');
    });

    // 缩放：贴边生成八向手柄，按住拖动直接改窗口位置与大小
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (dir) {
      const grip = document.createElement('div');
      grip.className = 'resize-edge resize-edge--' + dir;
      grip.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const start = {
          x: e.screenX,
          y: e.screenY,
          left: window.screenX,
          top: window.screenY,
          width: window.innerWidth,
          height: window.innerHeight
        };
        const MIN = 88;
        const isWidget = document.documentElement.classList.contains('is-widget');
        let pending = false;

        function apply(ev) {
          if (pending) return;
          pending = true;
          const dx = ev.screenX - start.x;
          const dy = ev.screenY - start.y;
          let left = start.left;
          let top = start.top;
          let width = start.width;
          let height = start.height;

          if (dir.indexOf('e') >= 0) width = start.width + dx;
          if (dir.indexOf('s') >= 0) height = start.height + dy;
          if (dir.indexOf('w') >= 0) { width = start.width - dx; left = start.left + dx; }
          if (dir.indexOf('n') >= 0) { height = start.height - dy; top = start.top + dy; }

          if (isWidget) {
            // 悬浮球始终是正圆：窗口强制保持正方形，按拖到的边/角定尺寸
            const right = start.left + start.width;
            const bottom = start.top + start.height;
            let size;
            if (dir === 'e' || dir === 'w') size = width;
            else if (dir === 'n' || dir === 's') size = height;
            else size = Math.max(width, height);
            size = Math.max(size, MIN);
            width = size;
            height = size;
            if (dir.indexOf('w') >= 0) left = right - size;
            if (dir.indexOf('n') >= 0) top = bottom - size;
          } else {
            if (width < MIN) { if (dir.indexOf('w') >= 0) left -= MIN - width; width = MIN; }
            if (height < MIN) { if (dir.indexOf('n') >= 0) top -= MIN - height; height = MIN; }
          }

          window.__TAURI__.core.invoke('set_window_frame', {
            x: left, y: top, width: width, height: height
          }).catch(function () {});
          requestAnimationFrame(function () { pending = false; });
        }

        function stop() {
          document.removeEventListener('mousemove', apply);
          document.removeEventListener('mouseup', stop);
        }

        document.addEventListener('mousemove', apply);
        document.addEventListener('mouseup', stop);
      });
      document.body.appendChild(grip);
    });

    // 悬浮球：按住拖动可移动，短按（没移动）仍然展开日历
    const widgetBtn = document.getElementById('widget');
    let press = null;
    widgetBtn.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      press = { x: e.screenX, y: e.screenY };
    });
    document.addEventListener('mousemove', function (e) {
      if (!press) return;
      if (Math.abs(e.screenX - press.x) + Math.abs(e.screenY - press.y) < 4) return;
      press = null;
      suppressWidgetClick = true;
      // 系统拖拽结束后 mouseup 不一定回到页面，这里定时解除抑制
      setTimeout(function () { suppressWidgetClick = false; }, 600);
      window.__TAURI__.core.invoke('begin_drag');
    });
    document.addEventListener('mouseup', function () {
      press = null;
    });
  }

  /* ---------------- 农历 / 节气 ---------------- */

  let lunarMonthFmt = null;
  let lunarDayFmt = null;
  try {
    lunarMonthFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long' });
    lunarDayFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });
  } catch (e) {
    lunarMonthFmt = null;
    lunarDayFmt = null;
  }

  const LUNAR_DAYS = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
  ];

  const lunarCache = new Map();

  function lunarOf(d) {
    const key = iso(d);
    if (lunarCache.has(key)) return lunarCache.get(key);
    let month = '';
    let dayLabel = '';
    try {
      if (lunarMonthFmt) month = lunarMonthFmt.format(d);
      if (lunarDayFmt) {
        const raw = lunarDayFmt.format(d);
        const n = parseInt(raw.replace(/\D/g, ''), 10);
        dayLabel = LUNAR_DAYS[n - 1] || raw;
      }
    } catch (e) {
      month = '';
      dayLabel = '';
    }
    const result = { month, day: dayLabel };
    lunarCache.set(key, result);
    return result;
  }

  // 演示用节气 / 节日（固定日期，方便原型展示）
  const DAY_NOTES = {
    '2026-01-01': '元旦',
    '2026-02-14': '情人节',
    '2026-05-01': '劳动节',
    '2026-06-01': '儿童节',
    '2026-10-08': '寒露',
    '2026-10-23': '霜降',
    '2026-11-07': '立冬',
    '2026-11-22': '小雪',
    '2026-12-07': '大雪',
    '2026-12-21': '冬至',
    '2026-12-25': '圣诞节'
  };

  /* ---------------- 状态 ---------------- */

  const state = {
    view: 'month',
    viewDate: TODAY_ISO,
    selected: TODAY_ISO,
    todoFilter: 'all',
    settings: {
      alpha: 72,
      bright: 'bright',
      hideCompleted: false,
      monthTasks: true,
      sync: false,
      lastSync: null
    },
    tasks: [],
    categories: []
  };

  const appEl = $('#app');
  const sceneEl = $('.scene');
  const viewArea = $('#viewArea');

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      saved = null;
    }
    const valid = saved && Array.isArray(saved.tasks) && Array.isArray(saved.categories) && saved.categories.length;
    state.tasks = valid ? saved.tasks : DB.tasks.map((t) => Object.assign({}, t));
    state.categories = valid ? saved.categories : DB.categories.map((c) => Object.assign({}, c));
    if (valid && saved.settings) {
      state.settings = Object.assign({}, state.settings, saved.settings);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tasks: state.tasks,
        categories: state.categories,
        settings: state.settings
      }));
    } catch (e) {
      /* 原型内忽略存储异常 */
    }
  }

  function category(id) {
    return state.categories.find((c) => c.id === id) ||
      { id: id, name: '未分类', color: '#9AA4B8' };
  }

  function compareTasks(a, b) {
    if (a.time === null && b.time !== null) return -1;
    if (a.time !== null && b.time === null) return 1;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return a.title.localeCompare(b.title, 'zh');
  }

  function taskMap() {
    const map = new Map();
    state.tasks.forEach((t) => {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    });
    map.forEach((list) => list.sort(compareTasks));
    return map;
  }

  function formatSyncTime(ts) {
    if (!ts) return '刚刚';
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return '刚刚';
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ---------------- 设置应用 ---------------- */

  function applySettings() {
    const s = state.settings;
    appEl.style.setProperty('--panel-alpha', (Number(s.alpha) / 100).toFixed(2));
    appEl.dataset.bright = s.bright === 'soft' ? 'soft' : 'bright';

    const alphaRange = $('#alphaRange');
    if (alphaRange) {
      alphaRange.value = s.alpha;
      $('#alphaVal').textContent = s.alpha + '%';
    }
    $$('#brightSeg [data-bright]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.bright === s.bright);
    });
    const hide = $('#toggleHideCompleted');
    hide.classList.toggle('is-on', !!s.hideCompleted);
    hide.setAttribute('aria-checked', String(!!s.hideCompleted));
    const monthTasks = $('#toggleMonthTasks');
    monthTasks.classList.toggle('is-on', !!s.monthTasks);
    monthTasks.setAttribute('aria-checked', String(!!s.monthTasks));
  }

  /* ---------------- 渲染：头部 / 状态栏 ---------------- */

  function renderHeader() {
    const d = parseISO(state.viewDate);
    const y = d.getFullYear();

    if (state.view === 'month') {
      $('#dateTitle').textContent = `${d.getMonth() + 1}月`;
      $('#dateSub').textContent = `${y}年 · 点击日期查看当天`;
    } else if (state.view === 'week') {
      const start = getWeekStart(d);
      const end = addDays(start, 6);
      $('#dateTitle').textContent = `${d.getMonth() + 1}月`;
      $('#dateSub').textContent =
        `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
    } else {
      const lunar = lunarOf(d);
      const note = DAY_NOTES[iso(d)];
      $('#dateTitle').textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
      $('#dateSub').textContent =
        `${y}年 · ${WEEKDAYS[(d.getDay() + 6) % 7]} · 农历${lunar.month}${lunar.day}` +
        (note ? ` · ${note}` : '');
    }

    $$('.segmented [data-view]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.view === state.view);
    });
  }

  function renderStatus() {
    const s = state.settings;
    $('#statusLeft').textContent = s.sync
      ? `已同步 · ${formatSyncTime(s.lastSync)}`
      : '本地模式 · 数据仅存本机';

    const d = parseISO(state.viewDate);
    let list = [];
    let label = '本月';

    if (state.view === 'month') {
      list = state.tasks.filter((t) => {
        const td = parseISO(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      });
      label = '本月';
    } else if (state.view === 'week') {
      const start = getWeekStart(d);
      const end = addDays(start, 6);
      list = state.tasks.filter((t) => {
        const td = parseISO(t.date);
        return td >= start && td <= end;
      });
      label = '本周';
    } else {
      list = state.tasks.filter((t) => t.date === state.viewDate);
      label = '本日';
    }

    const done = list.filter((t) => t.done).length;
    $('#statusRight').textContent = `${label} ${list.length} 项 · 已完成 ${done} 项`;
  }

  /* ---------------- 悬浮球 ---------------- */

  function renderWidget() {
    const now = new Date();
    $('#widgetTime').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    $('#widgetDate').textContent =
      `${now.getMonth() + 1}/${now.getDate()} ${WEEKDAYS[(now.getDay() + 6) % 7]}`;
  }

  function setMinimized(minimized) {
    if (minimized) {
      closeDrawers();
      closeModal();
      renderWidget();

      sceneEl.classList.add('is-minimized');
      document.documentElement.classList.add('is-widget');
      appEl.setAttribute('aria-hidden', 'true');
      appEl.setAttribute('inert', '');
      $('#widget').setAttribute('aria-hidden', 'false');
      $('#widget').focus({ preventScroll: true });
      tauriInvoke('enter_widget');
      return;
    }

    // 展开时先让窗口恢复大小，再把日历显示出来，避免闪一下被挤压的界面
    tauriInvoke('exit_widget').then(function () {
      sceneEl.classList.remove('is-minimized');
      document.documentElement.classList.remove('is-widget');
      appEl.setAttribute('aria-hidden', 'false');
      appEl.removeAttribute('inert');
      $('#widget').setAttribute('aria-hidden', 'true');
      renderAll({ animate: true });
      $('#minimizeBtn').focus({ preventScroll: true });
    });
  }

  function tauriInvoke(command) {
    if (!window.__TAURI__ || !window.__TAURI__.core) return Promise.resolve();
    return window.__TAURI__.core.invoke(command).catch(function () { /* 调用失败时忽略 */ });
  }

  /* ---------------- 渲染：三种视图 ---------------- */

  function visibleTasks(list) {
    return state.settings.hideCompleted ? list.filter((t) => !t.done) : list;
  }

  function cellTaskHTML(t) {
    const c = category(t.cat);
    return `<button class="cell-task${t.done ? ' is-done' : ''}" data-task="${t.id}" style="--cat:${c.color}" title="${esc(t.title)}">
      <span class="cell-task__dot"></span>
      <span class="cell-task__title">${esc(t.title)}</span>
    </button>`;
  }

  function monthHTML() {
    const base = parseISO(state.viewDate);
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = getWeekStart(first);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const end = addDays(getWeekStart(last), 6);
    const total = Math.round((end - start) / 86400000) + 1;
    const map = taskMap();
    let cells = '';

    for (let i = 0; i < total; i++) {
      const d = addDays(start, i);
      const key = iso(d);
      const out = d.getMonth() !== base.getMonth();
      const isToday = key === TODAY_ISO;
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const note = DAY_NOTES[key];
      const list = visibleTasks(map.get(key) || []);

      let tasksHTML = '';
      if (state.settings.monthTasks) {
        tasksHTML = list.slice(0, 2).map(cellTaskHTML).join('');
        if (list.length > 2) {
          tasksHTML += `<span class="cell-more">还有 ${list.length - 2} 项</span>`;
        }
      } else if (list.length) {
        tasksHTML = `<div class="dots-row">${
          list.slice(0, 5).map((t) => `<i style="--cat:${category(t.cat).color}"></i>`).join('')
        }${list.length > 5 ? `<span class="dot-more">+${list.length - 5}</span>` : ''}</div>`;
      }

      cells += `<div class="day-cell${out ? ' is-out' : ''}${isToday ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}"
        data-day="${key}" role="button" tabindex="0" aria-label="${d.getMonth() + 1}月${d.getDate()}日" style="--i:${i}">
        <div class="day-cell__head">
          <span class="day-cell__num">${d.getDate()}</span>
          <span class="day-cell__lunar${note ? ' is-term' : ''}">${note || lunarOf(d).day}</span>
        </div>
        <div class="day-cell__tasks">${tasksHTML}</div>
      </div>`;
    }

    return `<div class="month">
      <div class="month__weekhead">${WEEK_HEADS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="month__grid">${cells}</div>
    </div>`;
  }

  function weekHTML() {
    const start = getWeekStart(parseISO(state.viewDate));
    const map = taskMap();
    let cols = '';

    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const key = iso(d);
      const isToday = key === TODAY_ISO;
      const note = DAY_NOTES[key];
      const list = visibleTasks(map.get(key) || []);

      const chips = list.map((t, idx) => {
        const c = category(t.cat);
        return `<button class="week-chip${t.done ? ' is-done' : ''}" data-task="${t.id}"
          style="--cat:${c.color};--i:${idx}" title="${esc(t.title)}">
          ${esc(t.title)}
          <span class="week-chip__time">${t.time || '全天'} · ${esc(c.name)}</span>
        </button>`;
      }).join('');

      cols += `<div class="week__col${isToday ? ' is-today' : ''}">
        <button class="week__head" data-day="${key}" aria-label="查看${d.getMonth() + 1}月${d.getDate()}日">
          <span class="week__wd">${WEEKDAYS[i]}</span>
          <span class="week__num">${d.getDate()}</span>
          <span class="week__lunar${note ? ' is-term' : ''}">${note || lunarOf(d).day}</span>
        </button>
        <div class="week__tasks">${chips || '<span class="week-empty">空闲</span>'}</div>
      </div>`;
    }

    return `<div class="week">${cols}</div>`;
  }

  function dayHTML() {
    const d = parseISO(state.viewDate);
    const key = state.viewDate;
    const list = visibleTasks(taskMap().get(key) || []);
    const allDay = list.filter((t) => !t.time);
    const timed = list.filter((t) => t.time);
    const note = DAY_NOTES[key];
    const lunar = lunarOf(d);
    const START_HOUR = 6;
    const END_HOUR = 24;
    const HOUR_H = 56;

    let hours = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
      hours += `<div class="timeline__hour"><span>${pad(h)}:00</span></div>`;
    }

    const events = timed.map((t) => {
      const c = category(t.cat);
      const parts = t.time.split(':').map(Number);
      const top = Math.max(0, ((parts[0] * 60 + parts[1]) - START_HOUR * 60) / 60 * HOUR_H);
      return `<button class="event${t.done ? ' is-done' : ''}" data-task="${t.id}"
        style="--cat:${c.color};top:${top}px;height:52px" title="${esc(t.title)}">
        <span class="event__time">${t.time} · ${esc(c.name)}</span>
        <span class="event__title">${esc(t.title)}</span>
      </button>`;
    }).join('');

    let nowLine = '';
    if (key === TODAY_ISO) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      if (mins >= START_HOUR * 60) {
        nowLine = `<div class="timeline__now" style="top:${(mins - START_HOUR * 60) / 60 * HOUR_H}px"></div>`;
      }
    }

    const emptyHTML = list.length === 0
      ? `<div class="day__empty">
           ${icon('calendar')}
           <span>这一天还空着，留点时间给自己</span>
           <button class="btn btn--sm" data-action="new">${icon('plus')} 新建事项</button>
         </div>`
      : '';

    return `<div class="day">
      <div class="day__head">
        <span class="day__big">${d.getMonth() + 1}月${d.getDate()}日</span>
        <span class="day__side">
          <span>${WEEKDAYS[(d.getDay() + 6) % 7]}</span>
          <span>农历${lunar.month}${lunar.day}</span>
          ${note ? `<b>${note}</b>` : ''}
        </span>
        <span class="day__count">${list.length} 项 · 完成 ${list.filter((t) => t.done).length}</span>
      </div>
      <div class="day__allday">
        <span class="allday-label">全天</span>
        ${allDay.length
          ? allDay.map((t) => {
              const c = category(t.cat);
              return `<button class="allday-chip${t.done ? ' is-done' : ''}" data-task="${t.id}" style="--cat:${c.color}">
                <i></i>${esc(t.title)}
              </button>`;
            }).join('')
          : '<span class="week-empty">没有全天事项</span>'}
      </div>
      <div class="day__scroll">
        ${emptyHTML}
        <div class="timeline">
          ${hours}
          ${events}
          ${nowLine}
        </div>
      </div>
    </div>`;
  }

  function renderView(animate) {
    viewArea.innerHTML = state.view === 'month' ? monthHTML() : state.view === 'week' ? weekHTML() : dayHTML();
    const wrapper = viewArea.firstElementChild;
    if (animate && wrapper) wrapper.classList.add('view-enter');
    if (state.view === 'day') {
      const sc = $('.day__scroll', viewArea);
      if (sc) {
        const target = state.viewDate === TODAY_ISO ? new Date().getHours() : 8;
        sc.scrollTop = Math.max(0, (target - 6) * 56 - 20);
      }
    }
  }

  function renderAll(opts) {
    applySettings();
    renderHeader();
    renderView(!!(opts && opts.animate));
    renderStatus();
    renderWidget();
    if ($('#todosDrawer').classList.contains('is-open')) renderTodos();
    if ($('#settingsDrawer').classList.contains('is-open')) renderSettings();
  }

  /* ---------------- 全部待办 ---------------- */

  function todoRowHTML(t) {
    const c = category(t.cat);
    return `<div class="todo-row${t.done ? ' is-done' : ''}" data-toggle="${t.id}">
      <button class="todo-check${t.done ? ' is-done' : ''}" data-toggle="${t.id}"
        style="--cat:${c.color}" aria-label="${t.done ? '标记为未完成' : '标记完成'}">${icon('check')}</button>
      <div class="todo-main">
        <p class="todo-title">${esc(t.title)}</p>
        <div class="todo-sub">
          <span class="cat-tag" style="--cat:${c.color}"><i></i>${esc(c.name)}</span>
          <span>${t.time || '全天'}</span>
        </div>
      </div>
      <button class="todo-del" data-del="${t.id}" aria-label="删除事项">${icon('trash')}</button>
    </div>`;
  }

  function renderTodos() {
    const total = state.tasks.length;
    const done = state.tasks.filter((t) => t.done).length;
    $('#todosMeta').textContent = `共 ${total} 项 · 已完成 ${done} 项`;

    const filtered = state.tasks.filter((t) => {
      if (state.todoFilter === 'done') return t.done;
      if (state.todoFilter === 'open') return !t.done;
      return true;
    });

    const groups = new Map();
    filtered.forEach((t) => {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    });
    const keys = Array.from(groups.keys()).sort();

    if (!keys.length) {
      $('#todosList').innerHTML = `<div class="empty-state">${icon('inbox')}<p>这里空空如也</p></div>`;
      return;
    }

    $('#todosList').innerHTML = keys.map((key) => {
      const d = parseISO(key);
      const list = groups.get(key).sort(compareTasks);
      return `<div class="todo-group">
        <div class="todo-group__head">
          <span>${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${WEEKDAYS[(d.getDay() + 6) % 7]}</span>
          <em>${list.length} 项</em>
        </div>
        ${list.map(todoRowHTML).join('')}
      </div>`;
    }).join('');
  }

  /* ---------------- 设置面板 ---------------- */

  const CAT_COLORS = ['#C9A8FF', '#FFC27A', '#7ED6E8', '#B7E38A', '#FF9F9F', '#9AA8FF'];
  let catColorIndex = 0;

  function paintCatColor() {
    $('#addCatColor').innerHTML = `<i style="background:${CAT_COLORS[catColorIndex]}"></i>`;
  }

  function renderSettings() {
    applySettings();

    $('#catList').innerHTML = state.categories.map((c) => {
      const count = state.tasks.filter((t) => t.cat === c.id).length;
      return `<div class="cat-row" style="--cat:${c.color}">
        <span class="cat-dot"></span>
        <input class="cat-name" data-cat-name="${c.id}" value="${esc(c.name)}" maxlength="8" aria-label="分类名称">
        <span class="cat-count">${count} 项</span>
        <button class="cat-del" data-cat-del="${c.id}" aria-label="删除分类">${icon('trash')}</button>
      </div>`;
    }).join('');

    const on = !!state.settings.sync;
    $('#syncDot').classList.toggle('is-on', on);
    $('#syncState').textContent = on ? '已开启同步' : '仅保存在本机';
    $('#syncDetail').textContent = on
      ? `上次同步 ${formatSyncTime(state.settings.lastSync)}`
      : '默认不联网，打开即用';
    $('#syncBtn').textContent = on ? '立即同步' : '开启同步';
    $('#syncBtn').disabled = false;
  }

  /* ---------------- 抽屉 / 弹窗 ---------------- */

  function closeDrawers() {
    $$('.drawer').forEach((d) => {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    });
    $('#scrim').classList.remove('is-show');
  }

  function openDrawer(sel) {
    closeDrawers();
    const el = $(sel);
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('is-show');
  }

  let pendingCat = null;

  function renderCatChips() {
    $('#catChips').innerHTML = state.categories.map((c) => `
      <button type="button" class="cat-chip${c.id === pendingCat ? ' is-active' : ''}"
        data-cat-pick="${c.id}" style="--cat:${c.color}"><i></i>${esc(c.name)}</button>
    `).join('');
  }

  function openNew(prefillDate) {
    const key = prefillDate || state.viewDate;
    $('#taskTitle').value = '';
    $('#titleError').textContent = '';
    $('#taskDate').value = key;
    $('#taskTime').value = '';
    $('#taskAllDay').checked = true;
    $('#taskTime').disabled = true;
    $('#taskNote').value = '';
    $('#saveTaskBtn').disabled = false;
    $('#saveTaskBtn').textContent = '保存事项';
    pendingCat = state.categories[0] ? state.categories[0].id : null;
    renderCatChips();

    const layer = $('#modalLayer');
    layer.classList.add('is-open');
    layer.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#taskTitle').focus(), 60);
  }

  function closeModal() {
    const layer = $('#modalLayer');
    layer.classList.remove('is-open');
    layer.setAttribute('aria-hidden', 'true');
    const btn = $('#saveTaskBtn');
    btn.disabled = false;
    btn.textContent = '保存事项';
  }

  let toastTimer = null;

  function toast(message) {
    const el = $('#toast');
    el.innerHTML = `${icon('check')}<span>${esc(message)}</span>`;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2300);
  }

  /* ---------------- 行为 ---------------- */

  function shift(dir) {
    const d = parseISO(state.viewDate);
    if (state.view === 'month') {
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
    } else if (state.view === 'week') {
      d.setDate(d.getDate() + dir * 7);
    } else {
      d.setDate(d.getDate() + dir);
    }
    state.viewDate = iso(d);
    state.selected = state.viewDate;
    renderAll({ animate: true });
  }

  function openDay(key) {
    state.view = 'day';
    state.viewDate = key;
    state.selected = key;
    renderAll({ animate: true });
  }

  function toggleTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    saveState();
    renderAll();
    toast(t.done ? '已完成' : '已恢复为未完成');
    Api.updateTask(id, { done: t.done });
  }

  function deleteTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    state.tasks = state.tasks.filter((x) => x.id !== id);
    saveState();
    renderAll();
    toast(`已删除「${t.title}」`);
    Api.deleteTask(id);
  }

  /* ---------------- 导出 / 导入 ---------------- */

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  function csvCell(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }

  function icsDate(key, time) {
    const d = parseISO(key);
    const base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return time ? `${base}T${time.replace(':', '')}00` : base;
  }

  function icsEndTime(key, time) {
    const d = parseISO(key);
    const parts = time.split(':').map(Number);
    d.setHours(parts[0], parts[1] + 60, 0, 0);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  }

  function bindEvents() {
    $('#prevBtn').addEventListener('click', () => shift(-1));
    $('#nextBtn').addEventListener('click', () => shift(1));
    $('#todayBtn').addEventListener('click', () => {
      state.viewDate = TODAY_ISO;
      state.selected = TODAY_ISO;
      renderAll({ animate: true });
    });

    $$('.segmented [data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        renderAll({ animate: true });
      });
    });

    viewArea.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action="new"]');
      if (action) {
        openNew(state.viewDate);
        return;
      }
      const taskEl = e.target.closest('[data-task]');
      if (taskEl) {
        toggleTask(taskEl.dataset.task);
        return;
      }
      const dayEl = e.target.closest('[data-day]');
      if (dayEl) openDay(dayEl.dataset.day);
    });

    viewArea.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const dayEl = e.target.closest('[data-day]');
      if (dayEl) {
        e.preventDefault();
        openDay(dayEl.dataset.day);
      }
    });

    $('#openTodos').addEventListener('click', () => {
      openDrawer('#todosDrawer');
      renderTodos();
    });

    $('#openSettings').addEventListener('click', () => {
      openDrawer('#settingsDrawer');
      renderSettings();
    });

    $('#openNew').addEventListener('click', () => openNew());
    $('#minimizeBtn').addEventListener('click', () => setMinimized(true));
    $('#widget').addEventListener('click', () => {
      if (suppressWidgetClick) { suppressWidgetClick = false; return; }
      setMinimized(false);
    });

    // 收起状态下让球上的时间保持走动
    setInterval(() => {
      if (sceneEl.classList.contains('is-minimized')) renderWidget();
    }, 10000);

    $$('[data-close-drawer]').forEach((b) => b.addEventListener('click', closeDrawers));
    $('#scrim').addEventListener('click', closeDrawers);

    $('#todoFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.todoFilter = btn.dataset.filter;
      $$('#todoFilters .filter').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderTodos();
    });

    $('#todosList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        deleteTask(del.dataset.del);
        return;
      }
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) toggleTask(toggle.dataset.toggle);
    });

    // 外观滑杆：即时生效，松手后持久化
    $('#alphaRange').addEventListener('input', (e) => {
      state.settings.alpha = Number(e.target.value);
      applySettings();
    });
    $('#alphaRange').addEventListener('change', saveState);

    $('#brightSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bright]');
      if (!btn) return;
      state.settings.bright = btn.dataset.bright;
      applySettings();
      saveState();
    });

    $('#toggleHideCompleted').addEventListener('click', () => {
      state.settings.hideCompleted = !state.settings.hideCompleted;
      saveState();
      renderAll();
    });

    $('#toggleMonthTasks').addEventListener('click', () => {
      state.settings.monthTasks = !state.settings.monthTasks;
      saveState();
      renderAll();
    });

    // 分类重命名
    $('#catList').addEventListener('change', (e) => {
      const input = e.target.closest('[data-cat-name]');
      if (!input) return;
      const c = state.categories.find((x) => x.id === input.dataset.catName);
      if (!c) return;
      const name = input.value.trim();
      if (!name) {
        input.value = c.name;
        toast('分类名称不能为空');
        return;
      }
      c.name = name;
      saveState();
      renderAll();
      toast('分类已更新');
    });

    // 删除分类
    $('#catList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat-del]');
      if (!btn) return;
      const id = btn.dataset.catDel;
      const count = state.tasks.filter((t) => t.cat === id).length;
      if (count > 0) {
        toast(`「${category(id).name}」下还有 ${count} 项，先处理完再删`);
        return;
      }
      if (state.categories.length <= 1) {
        toast('至少保留一个分类');
        return;
      }
      state.categories = state.categories.filter((c) => c.id !== id);
      saveState();
      renderAll();
      toast('分类已删除');
    });

    $('#addCatColor').addEventListener('click', () => {
      catColorIndex = (catColorIndex + 1) % CAT_COLORS.length;
      paintCatColor();
    });

    $('#addCatBtn').addEventListener('click', () => {
      const input = $('#addCatName');
      const name = input.value.trim();
      if (!name) {
        toast('先给分类起个名字');
        input.focus();
        return;
      }
      if (state.categories.some((c) => c.name === name)) {
        toast('这个名字已经用过了');
        return;
      }
      state.categories.push({
        id: 'c' + Date.now().toString(36),
        name: name,
        color: CAT_COLORS[catColorIndex]
      });
      input.value = '';
      catColorIndex = (catColorIndex + 1) % CAT_COLORS.length;
      paintCatColor();
      saveState();
      renderAll();
      toast(`已添加分类「${name}」`);
    });

    $('#addCatName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#addCatBtn').click();
      }
    });

    // 导出
    $('#exportJson').addEventListener('click', () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        categories: state.categories,
        tasks: state.tasks
      };
      download(`daylog-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      toast('已导出 JSON 备份');
    });

    $('#exportCsv').addEventListener('click', () => {
      const rows = [['日期', '时间', '标题', '分类', '状态', '备注']];
      state.tasks.slice().sort((a, b) => a.date.localeCompare(b.date) || compareTasks(a, b)).forEach((t) => {
        rows.push([
          t.date,
          t.time || '全天',
          t.title,
          category(t.cat).name,
          t.done ? '已完成' : '未完成',
          t.note || ''
        ]);
      });
      const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
      download(`daylog-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
      toast('已导出 CSV');
    });

    $('#exportIcs').addEventListener('click', () => {
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Daylog//Calendar Prototype//CN',
        'CALSCALE:GREGORIAN'
      ];
      state.tasks.forEach((t) => {
        const start = icsDate(t.date, t.time);
        const isAllDay = !t.time;
        const next = iso(addDays(parseISO(t.date), 1)).replace(/-/g, '');
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${t.id}@daylog.prototype`);
        lines.push(`DTSTAMP:${icsDate(TODAY_ISO, '00:00')}Z`);
        lines.push(isAllDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`);
        lines.push(isAllDay ? `DTEND;VALUE=DATE:${next}` : `DTEND:${icsEndTime(t.date, t.time)}`);
        lines.push(`SUMMARY:${String(t.title).replace(/[,;]/g, ' ')}`);
        lines.push(`CATEGORIES:${category(t.cat).name}`);
        if (t.note) lines.push(`DESCRIPTION:${String(t.note).replace(/\n/g, ' ')}`);
        lines.push('END:VEVENT');
      });
      lines.push('END:VCALENDAR');
      download(`daylog-${stamp()}.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
      toast('已导出 .ics，可导入系统日历');
    });

    // 导入
    $('#importJsonBtn').addEventListener('click', () => $('#importFile').click());

    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const incoming = Array.isArray(data) ? data : data.tasks;
          if (!Array.isArray(incoming)) throw new Error('bad shape');
          const seen = new Set(state.tasks.map((t) => `${t.title}|${t.date}|${t.time || ''}`));
          let added = 0;
          let skipped = 0;
          incoming.forEach((raw, i) => {
            const dateOk = raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) &&
              !isNaN(parseISO(raw.date).getTime());
            if (!raw || !raw.title || !dateOk) {
              skipped += 1;
              return;
            }
            const sig = `${raw.title}|${raw.date}|${raw.time || ''}`;
            if (seen.has(sig)) {
              skipped += 1;
              return;
            }
            seen.add(sig);
            const catOk = state.categories.some((c) => c.id === raw.cat);
            state.tasks.push({
              id: 't' + Date.now().toString(36) + i,
              title: String(raw.title),
              date: String(raw.date),
              time: raw.time || null,
              cat: catOk ? raw.cat : state.categories[0].id,
              done: !!raw.done,
              note: raw.note || ''
            });
            added += 1;
          });
          saveState();
          renderAll();
          toast(added
            ? `导入 ${added} 项${skipped ? `，跳过 ${skipped} 项重复` : ''}`
            : '没有可导入的新事项');
        } catch (err) {
          toast('文件格式不正确');
        }
        e.target.value = '';
      };
      reader.readAsText(file, 'utf-8');
    });

    // 同步（stub）
    $('#syncBtn').addEventListener('click', async () => {
      const btn = $('#syncBtn');
      btn.disabled = true;
      btn.textContent = '同步中…';
      try {
        const res = await Api.sync({
          tasks: state.tasks,
          categories: state.categories,
          settings: state.settings
        });
        state.settings.sync = true;
        state.settings.lastSync = res.at;
        saveState();
        renderSettings();
        renderStatus();
        toast('同步完成（原型模拟）');
      } finally {
        btn.disabled = false;
      }
    });

    // 清空（二次确认）
    let clearArmed = false;
    let clearTimer = null;

    function resetClear() {
      clearArmed = false;
      $('#clearAll').textContent = '清空全部待办';
    }

    $('#clearAll').addEventListener('click', () => {
      const btn = $('#clearAll');
      if (!clearArmed) {
        clearArmed = true;
        btn.textContent = '再点一次确认清空';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(resetClear, 3200);
        return;
      }
      clearTimeout(clearTimer);
      state.tasks = [];
      saveState();
      resetClear();
      renderAll();
      toast('已清空全部待办');
    });

    // 弹窗
    $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));

    $('#taskTitle').addEventListener('input', () => {
      $('#titleError').textContent = '';
    });

    $('#taskAllDay').addEventListener('change', (e) => {
      $('#taskTime').disabled = e.target.checked;
      if (e.target.checked) $('#taskTime').value = '';
    });

    $('#catChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat-pick]');
      if (!btn) return;
      pendingCat = btn.dataset.catPick;
      renderCatChips();
    });

    $('#taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#taskTitle').value.trim();
      const date = $('#taskDate').value;
      const allDay = $('#taskAllDay').checked;
      const time = allDay ? null : $('#taskTime').value;

      if (!title) {
        $('#titleError').textContent = '写点什么吧，哪怕只有两个字';
        $('#taskTitle').focus();
        return;
      }
      if (!date) {
        toast('请选择日期');
        return;
      }
      if (!allDay && !time) {
        toast('请选择时间，或勾选全天');
        return;
      }

      $('#titleError').textContent = '';
      const btn = $('#saveTaskBtn');
      btn.disabled = true;
      btn.textContent = '保存中…';

      const task = await Api.createTask({
        title: title,
        date: date,
        time: allDay ? null : time,
        cat: pendingCat || (state.categories[0] && state.categories[0].id),
        note: $('#taskNote').value.trim()
      });

      state.tasks.push(task);
      saveState();
      closeModal();
      renderAll();

      const d = parseISO(date);
      toast(`已添加到 ${d.getMonth() + 1}月${d.getDate()}日`);
    });

    $('#modalLayer').addEventListener('click', (e) => {
      if (e.target.id === 'modalLayer') closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (sceneEl.classList.contains('is-minimized')) {
        if (e.key === 'Escape') setMinimized(false);
        return;
      }

      if (e.key === 'Escape') {
        if ($('#modalLayer').classList.contains('is-open')) {
          closeModal();
          return;
        }
        closeDrawers();
        return;
      }

      const active = document.activeElement;
      const typing = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      );
      if (typing) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNew();
      }
      if (e.key === 't' || e.key === 'T') {
        state.viewDate = TODAY_ISO;
        state.selected = TODAY_ISO;
        renderAll({ animate: true });
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    loadState();
    paintCatColor();
    bindEvents();
    renderAll({ animate: true });
  }

  init();
})();
