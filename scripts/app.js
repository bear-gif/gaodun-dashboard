/**
 * 驾驶舱主入口：
 *  - 初始化所有 ECharts 实例
 *  - 加载中国地图 GeoJSON
 *  - 绑定筛选器、模式切换、下钻返回
 *  - KPI count-up 动画
 *  - GMV 分类标签渲染与联动筛选
 *  - 窗口 resize 监听
 */
(function () {
  'use strict';

  const D = window.DashboardData;
  const C = window.DashboardCharts;

  // 状态
  const state = {
    activity: 'ALL',
    mapMode: 'heat', // heat | efficiency
    charts: null,
    currentData: null
  };

  // ---------- 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function tickClock() {
    const now = new Date();
    const t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    $('#clock').textContent = t;
    $('#updateTime').textContent = dateStr + ' ' + t;
  }

  // easeOutCubic
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function animateNumber(el, from, to, duration, formatter) {
    const start = performance.now();
    const numEl = el.querySelector('.num');
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * easeOutCubic(p);
      if (numEl) numEl.textContent = formatter ? formatter(v) : Math.round(v).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function formatInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function formatMoneyNum(n) { return Math.round(n).toLocaleString('en-US'); }
  function formatRate(n) { return n.toFixed(2); }
  function formatMoney(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }

  // ---------- KPI 渲染 ----------
  let previousKpi = { totalAmount: 0, totalOrders: 0, overallRate: 0, giftAmount: 0 };

  function renderKpi(kpi) {
    const cards = $all('.kpi-card');
    // 总成交额
    const v0 = cards[0].querySelector('.kpi-card__value');
    animateNumber(v0, previousKpi.totalAmount, kpi.totalAmount, 900, formatMoneyNum);

    // 总线索数
    const v1 = cards[1].querySelector('.kpi-card__value');
    animateNumber(v1, previousKpi.totalOrders, kpi.totalOrders, 900, formatInt);

    // 转化率
    const v2 = cards[2].querySelector('.kpi-card__value');
    animateNumber(v2, previousKpi.overallRate, kpi.overallRate, 900, formatRate);
    const fill = cards[2].querySelector('.progress__fill');
    if (fill) fill.style.width = Math.min(100, (kpi.overallRate / 5.5) * 100) + '%';

    // 千元礼包成交额
    const v3 = cards[3].querySelector('.kpi-card__value');
    animateNumber(v3, previousKpi.giftAmount, kpi.giftAmount, 900, formatMoneyNum);

    const ratio = kpi.totalAmount > 0 ? (kpi.giftAmount / kpi.totalAmount * 100).toFixed(1) : '0.0';
    $('#giftRatio').textContent = ratio + '%';

    previousKpi = Object.assign({}, kpi);
  }

  // ---------- GMV 分类标签渲染 ----------
  function renderGmvTags(kpi, activityRank) {
    const amounts = {};
    activityRank.forEach(function(a) {
      amounts[a.name] = a.amount;
    });

    let total = 0;
    activityRank.forEach(function(a) { total += a.amount; });

    const allEl = document.getElementById('gmvAll');
    const giftEl = document.getElementById('gmvGift');
    const lectureEl = document.getElementById('gmvLecture');
    const provinceEl = document.getElementById('gmvProvince');
    const miniEl = document.getElementById('gmvMini');

    if (allEl) allEl.textContent = formatMoney(total);
    if (giftEl) giftEl.textContent = formatMoney(amounts['千元礼包'] || 0);
    if (lectureEl) lectureEl.textContent = formatMoney(amounts['内部专场讲座'] || 0);
    if (provinceEl) provinceEl.textContent = formatMoney(amounts['省份志愿群'] || 0);
    if (miniEl) miniEl.textContent = formatMoney(amounts['小课系列活动'] || 0);
  }

  // ---------- 同步筛选器与 GMV 标签的激活状态 ----------
  function syncActiveState(activity) {
    // 同步 filter buttons
    const group = document.getElementById('filterGroup');
    if (group) {
      const btns = group.querySelectorAll('.filter-btn');
      for (let i = 0; i < btns.length; i++) {
        const a = btns[i].getAttribute('data-activity');
        if (a === activity) btns[i].classList.add('is-active');
        else btns[i].classList.remove('is-active');
      }
    }
    // 同步 gmv tags
    const gmvRow = document.getElementById('gmvRow');
    if (gmvRow) {
      const tags = gmvRow.querySelectorAll('.gmv-tag');
      for (let j = 0; j < tags.length; j++) {
        const a2 = tags[j].getAttribute('data-activity');
        if (a2 === activity) tags[j].classList.add('is-active');
        else tags[j].classList.remove('is-active');
      }
    }
  }

  // ---------- 地图图例 ----------
  function updateMapLegend(mode) {
    const legend = $('#mapLegend');
    if (mode === 'efficiency') {
      legend.className = 'map-legend map-legend--green';
      legend.innerHTML =
        '<div class="map-legend__bar"></div>' +
        '<div class="map-legend__labels"><span>低</span><span>成交额</span><span>高</span></div>';
    } else {
      legend.className = 'map-legend';
      legend.innerHTML =
        '<div class="map-legend__bar"></div>' +
        '<div class="map-legend__labels"><span>低</span><span>线索数</span><span>高</span></div>';
    }
  }

  function updateBreadcrumb(text) {
    $('#mapBreadcrumb').textContent = text;
  }

  // ---------- 全量渲染 ----------
  function renderAll() {
    const data = D.aggregate(state.activity);
    state.currentData = data;

    // KPI
    renderKpi(data.kpi);

    // GMV 标签
    renderGmvTags(data.kpi, data.activityRank);

    // 同步筛选器与 GMV 标签激活状态
    syncActiveState(state.activity);

    // 同步地图的活动
    state.charts.map.setActivity(state.activity);

    // 渲染地图（首次加载和筛选切换统一走 render，内部会判断当前层级）
    state.charts.map.render(data);

    state.charts.rank.render(data);
    state.charts.sankey.render(data);
    state.charts.combo.render(data);
    state.charts.city.render(data);
  }

  // ---------- 绑定交互 ----------
  function bindFilter() {
    const group = $('#filterGroup');
    group.addEventListener('click', function (e) {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const act = btn.getAttribute('data-activity');
      if (act === state.activity) return;

      state.activity = act;
      renderAll();
    });

    // GMV 标签点击筛选
    const gmvRow = document.getElementById('gmvRow');
    if (gmvRow) {
      gmvRow.addEventListener('click', function (e) {
        const tag = e.target.closest('.gmv-tag');
        if (!tag) return;
        const act = tag.getAttribute('data-activity');
        if (act === state.activity) return;
        state.activity = act;
        renderAll();
      });
    }
  }

  function bindMapMode() {
    const seg = $('#mapModeSeg');
    seg.addEventListener('click', function (e) {
      const btn = e.target.closest('.seg-control__btn');
      if (!btn) return;
      const mode = btn.getAttribute('data-mode');
      if (mode === state.mapMode) return;
      $all('.seg-control__btn', seg).forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      state.mapMode = mode;
      updateMapLegend(mode);
      state.charts.map.setMode(mode);
    });
  }

  function bindMapBack() {
    const btn = $('#mapBackBtn');
    const breadcrumb = $('#mapBreadcrumb');
    state.charts.map.chart.on('click', function () {
      // createMapChart 已处理下钻；这里只更新 UI 状态
      setTimeout(function () {
        const s = state.charts.map.getState();
        if (s.level === 'province') {
          btn.hidden = false;
          updateBreadcrumb('全国 / ' + s.currentProvince);
        }
      }, 50);
    });

    btn.addEventListener('click', function () {
      state.charts.map.backToCountry();
      btn.hidden = true;
      updateBreadcrumb('全国');
    });
  }

  function bindResize(charts) {
    let timer = null;
    window.addEventListener('resize', function () {
      if (timer) cancelAnimationFrame(timer);
      timer = requestAnimationFrame(function () {
        charts.map.chart.resize();
        charts.rank.chart.resize();
        charts.sankey.chart.resize();
        charts.combo.chart.resize();
        charts.city.chart.resize();
        charts.gmvBar.chart.resize();
      });
    });
  }

  // ---------- 初始化 ----------
  function init() {
    tickClock();
    setInterval(tickClock, 1000);

    // 初始化图表实例
    const charts = {
      map: C.createMapChart($('#chartMap')),
      rank: C.createRankChart($('#chartRank')),
      sankey: C.createSankeyChart($('#chartSankey')),
      combo: C.createComboChart($('#chartCombo')),
      city: C.createCityChart($('#chartCity')),
      gmvBar: C.createGmvBarChart($('#chartGmvBar'))
    };
    state.charts = charts;

    // 加载中国地图 GeoJSON：直接使用内嵌数据（china-geo.js 已在 HTML 中同步加载）
    function initMap() {
      if (!window.CHINA_GEOJSON || !window.CHINA_GEOJSON.features || !window.CHINA_GEOJSON.features.length) {
        console.error('[Dashboard] china-geo.js 未加载或为空');
        return;
      }
      echarts.registerMap('china', window.CHINA_GEOJSON);
      console.log('[Dashboard] 地图注册成功，要素数:', window.CHINA_GEOJSON.features.length);
      updateMapLegend(state.mapMode);
      renderAll();
    }
    initMap();

    bindFilter();
    bindMapMode();
    bindMapBack();
    bindResize(charts);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
