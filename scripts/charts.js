/**
 * ECharts 图表模块：地图 / 活动排行 / 桑基图 / 组合图 / 城市 Top
 * 所有图表实例通过 DashboardCharts 命名空间暴露给 app.js。
 */
(function (global) {
  'use strict';

  // ---------- 通用样式常量 ----------
  const COLOR = {
    primary: '#00A3FF',
    primary2: '#00D4FF',
    gold: '#FFD700',
    goldDeep: '#C9A227',
    green: '#2EE6A6',
    coral: '#FF7A45',
    red: '#FF4D6D',
    text1: '#E6F4FF',
    text2: '#8AA8C8',
    text3: '#5C7595',
    axisLine: 'rgba(0,163,255,0.2)',
    splitLine: 'rgba(255,255,255,0.06)'
  };

  // 中国地图 GeoJSON：直接内嵌（window.CHINA_GEOJSON），零网络依赖
  // 省级下钻仍走同源 /geo/ 代理（server.py 本地缓存优先）
  const CHINA_GEOJSON = global.CHINA_GEOJSON || null;
  const GEO_BASE = '/geo/';

  // 省级地图缓存（GeoJSON）
  const geoCache = {};
  // 中国地图已内嵌，直接放入缓存
  if (CHINA_GEOJSON) geoCache['china'] = CHINA_GEOJSON;

  // ---------- 工具 ----------
  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function formatNum(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function formatMoney(n) {
    if (n >= 10000) return '¥' + (n / 10000).toFixed(2) + '万';
    return '¥' + formatNum(n);
  }

  function fetchGeo(url) {
    if (geoCache[url]) return Promise.resolve(geoCache[url]);
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('GeoJSON load failed: ' + url);
      return res.json();
    }).then(function (json) {
      geoCache[url] = json;
      return json;
    });
  }

  function commonTooltip() {
    return {
      backgroundColor: 'rgba(7, 18, 42, 0.92)',
      borderColor: 'rgba(0,163,255,0.4)',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: COLOR.text1, fontSize: 12, fontFamily: 'PingFang SC' },
      extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.5); backdrop-filter: blur(4px); border-radius: 4px;'
    };
  }

  // ============================================================
  // 1. 中国地图
  // ============================================================
  function createMapChart(dom) {
    const chart = echarts.init(dom, null, { renderer: 'canvas' });
    const state = {
      mode: 'heat', // heat | efficiency
      level: 'country', // country | province
      currentProvince: null,
      currentProvinceShort: null,
      activity: 'ALL',
      data: null
    };

    function getProvinceColor(value, max, mode) {
      if (!value || value <= 0) return 'rgba(255,255,255,0.02)';
      const ratio = Math.min(1, Math.pow(value / Math.max(1, max), 0.6));
      const base = mode === 'efficiency' ? COLOR.green : COLOR.primary;
      // 从 15% 不透明到 95%
      const alpha = 0.15 + ratio * 0.8;
      return hexToRgba(base, alpha);
    }

    function buildCountryOption(data, mode) {
      const maxVal = Math.max.apply(null, data.provinces.map(function (p) {
        return mode === 'efficiency' ? p.amount : p.orders;
      }));

      const seriesData = data.provinces.map(function (p) {
        const v = mode === 'efficiency' ? p.amount : p.orders;
        return {
          name: p.name,
          value: v,
          itemStyle: {
            areaColor: getProvinceColor(v, maxVal, mode),
            borderColor: hexToRgba(mode === 'efficiency' ? COLOR.green : COLOR.primary, 0.45),
            borderWidth: 0.6
          },
          emphasis: {
            itemStyle: {
              areaColor: mode === 'efficiency' ? hexToRgba(COLOR.green, 0.85) : hexToRgba(COLOR.primary, 0.85),
              borderColor: mode === 'efficiency' ? COLOR.green : COLOR.primary,
              borderWidth: 1.2,
              shadowColor: mode === 'efficiency' ? 'rgba(46,230,166,0.6)' : 'rgba(0,163,255,0.6)',
              shadowBlur: 18
            },
            label: { color: '#fff', fontWeight: 600 }
          },
          _raw: p
        };
      });

      return {
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'item',
          formatter: function (params) {
            const raw = params.data && params.data._raw;
            if (!raw) return '<div style="padding:2px 4px;">暂无数据</div>';
            const rate = raw.orders > 0 ? ((raw.amount / raw.orders / 100) * 4.5).toFixed(2) : '0.00';
            return [
              '<div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:6px;letter-spacing:1px;">' + raw.name + '</div>',
              '<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.7;">',
              '<span style="color:' + COLOR.text2 + '">线索数</span>',
              '<span style="color:' + COLOR.primary + ';font-family:DIN Alternate;">' + formatNum(raw.orders) + ' 条</span>',
              '</div>',
              '<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.7;">',
              '<span style="color:' + COLOR.text2 + '">成交额</span>',
              '<span style="color:#fff;font-family:DIN Alternate;">' + formatMoney(raw.amount) + '</span>',
              '</div>',
              '<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.7;">',
              '<span style="color:' + COLOR.text2 + '">千元礼包</span>',
              '<span style="color:' + COLOR.gold + ';font-family:DIN Alternate;">' + formatMoney(raw.giftAmount) + '</span>',
              '</div>',
              '<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.7;">',
              '<span style="color:' + COLOR.text2 + '">转化率</span>',
              '<span style="color:' + COLOR.coral + ';font-family:DIN Alternate;">' + rate + '%</span>',
              '</div>',
              '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,255,255,0.1);color:' + COLOR.text3 + ';font-size:11px;">点击下钻查看市级数据</div>'
            ].join('');
          }
        }),
        series: [{
          name: mode === 'efficiency' ? '成交额' : '线索数',
          type: 'map',
          map: 'china',
          roam: true,
          zoom: 1.15,
          aspectScale: 0.8,
          layoutCenter: ['50%', '52%'],
          layoutSize: '118%',
          label: {
            show: true,
            color: 'rgba(255,255,255,0.55)',
            fontSize: 9,
            fontFamily: 'PingFang SC'
          },
          itemStyle: {
            areaColor: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,163,255,0.25)'
          },
          emphasis: { label: { show: true, color: '#fff', fontSize: 11 } },
          select: { disabled: true },
          data: seriesData
        }]
      };
    }

    function buildCityOption(cityData, provinceFullName, mode) {
      const maxVal = Math.max.apply(null, cityData.map(function (c) { return c.value; }).concat([1]));
      const seriesData = cityData.map(function (c) {
        return {
          name: c.name,
          value: c.value,
          itemStyle: {
            areaColor: getProvinceColor(c.value, maxVal, mode),
            borderColor: hexToRgba(mode === 'efficiency' ? COLOR.green : COLOR.primary, 0.45)
          },
          emphasis: {
            itemStyle: {
              areaColor: mode === 'efficiency' ? hexToRgba(COLOR.green, 0.85) : hexToRgba(COLOR.primary, 0.85),
              shadowColor: mode === 'efficiency' ? 'rgba(46,230,166,0.6)' : 'rgba(0,163,255,0.6)',
              shadowBlur: 18
            }
          }
        };
      });

      return {
        animationDuration: 600,
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'item',
          formatter: function (params) {
            const v = params.data && params.data.value || 0;
            return '<div style="font-weight:600;margin-bottom:4px;">' + params.name + '</div>'
              + '<div style="color:' + COLOR.text2 + ';">线索数：<span style="color:' + COLOR.primary + ';font-family:DIN Alternate;">' + formatNum(v) + ' 条</span></div>';
          }
        }),
        series: [{
          name: provinceFullName,
          type: 'map',
          map: provinceFullName,
          roam: true,
          zoom: 1.1,
          aspectScale: 0.85,
          layoutCenter: ['50%', '52%'],
          layoutSize: '115%',
          label: { show: false },
          emphasis: { label: { show: true, color: '#fff', fontSize: 10 } },
          itemStyle: {
            areaColor: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,163,255,0.25)'
          },
          data: seriesData
        }]
      };
    }

    function renderCountry(data) {
      state.data = data;
      state.level = 'country';
      state.currentProvince = null;
      chart.setOption(buildCountryOption(data, state.mode), true);
    }

    function drillToProvince(provinceFullName) {
      const adcode = DashboardData.PROVINCE_ADCODE[provinceFullName];
      if (!adcode) return;

      // 找到 shortName
      let shortName = null;
      Object.keys(DashboardData.PROVINCE_FULL_NAME).forEach(function (k) {
        if (DashboardData.PROVINCE_FULL_NAME[k] === provinceFullName) shortName = k;
      });
      if (!shortName) return;

      fetchGeo(GEO_BASE + adcode + '_full.json').then(function (geo) {
        echarts.registerMap(provinceFullName, geo);
        const cityNames = (geo.features || []).map(function (f) {
          return f.properties && f.properties.name;
        }).filter(Boolean);
        const cityData = DashboardData.buildCitiesForProvince(shortName, cityNames, state.activity);
        state.level = 'province';
        state.currentProvince = provinceFullName;
        state.currentProvinceShort = shortName;
        chart.setOption(buildCityOption(cityData, provinceFullName, state.mode), true);
      }).catch(function (err) {
        console.warn('市级地图加载失败', err);
      });
    }

    function backToCountry() {
      if (state.level !== 'country' && state.data) {
        renderCountry(state.data);
      }
    }

    // 在保持当前层级的前提下重新渲染（用于筛选活动变化）
    function rerenderCurrent() {
      if (state.level === 'country' && state.data) {
        chart.setOption(buildCountryOption(state.data, state.mode), true);
      } else if (state.level === 'province' && state.currentProvince) {
        drillToProvince(state.currentProvince);
      }
    }

    function setMode(mode) {
      state.mode = mode;
      if (state.level === 'country' && state.data) {
        chart.setOption(buildCountryOption(state.data, mode), true);
      } else if (state.level === 'province' && state.currentProvince) {
        drillToProvince(state.currentProvince);
      }
    }

    function setActivity(activity) {
      state.activity = activity;
    }

    // 统一渲染入口（首次加载 + 活动筛选切换均调用此方法）
    function render(data) {
      if (!data) return;
      state.data = data;
      if (state.level === 'province' && state.currentProvince) {
        drillToProvince(state.currentProvince);
      } else {
        state.level = 'country';
        state.currentProvince = null;
        chart.setOption(buildCountryOption(data, state.mode), true);
      }
    }

    function getState() { return state; }

    chart.on('click', function (params) {
      if (state.level === 'country' && params.name) {
        drillToProvince(params.name);
      }
    });

    return {
      chart: chart,
      render: render,
      renderCountry: renderCountry,
      backToCountry: backToCountry,
      rerenderCurrent: rerenderCurrent,
      setMode: setMode,
      setActivity: setActivity,
      getState: getState
    };
  }

  // ============================================================
  // 2. 活动引流量排行 - 水平条形图
  // ============================================================
  function createRankChart(dom) {
    const chart = echarts.init(dom);

    function buildOption(data) {
      // 只取订单 > 0 的，最多 Top10
      const list = data.activityRank
        .filter(function (a) { return a.orders > 0; })
        .slice(0, 10)
        .sort(function (a, b) { return a.orders - b.orders; }); // 升序，水平条形图最大值在顶部

      const names = list.map(function (a) { return a.name; });
      const values = list.map(function (a) {
        return {
          value: a.orders,
          itemStyle: {
            color: a.highlight
              ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: hexToRgba(COLOR.goldDeep, 0.6) },
                  { offset: 1, color: COLOR.gold }
                ])
              : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: 'rgba(0,163,255,0.2)' },
                  { offset: 1, color: 'rgba(0,163,255,0.85)' }
                ]),
            borderRadius: [0, 3, 3, 0],
            shadowColor: a.highlight ? 'rgba(255,215,0,0.4)' : 'rgba(0,163,255,0.3)',
            shadowBlur: 8
          }
        };
      });

      return {
        animationDuration: 700,
        animationEasing: 'cubicOut',
        grid: { left: 130, right: 50, top: 8, bottom: 8, containLabel: false },
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'item',
          formatter: function (p) {
            const item = list[p.dataIndex];
            return '<div style="font-weight:600;margin-bottom:4px;">' + item.name + '</div>'
              + '<div style="color:' + COLOR.text2 + ';">线索：<b style="color:' + COLOR.primary + '">' + formatNum(item.orders) + '</b> 条</div>'
              + '<div style="color:' + COLOR.text2 + ';">转化率：<b style="color:' + COLOR.coral + '">' + item.rate.toFixed(2) + '%</b></div>';
          }
        }),
        xAxis: {
          type: 'value',
          show: false,
          max: function (v) { return Math.ceil(v.max * 1.15); }
        },
        yAxis: {
          type: 'category',
          data: names,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: function (val) {
              const item = list.find(function (x) { return x.name === val; });
              return item && item.highlight ? COLOR.gold : COLOR.text2;
            },
            fontSize: 11,
            formatter: function (val) {
              if (val.length > 10) return val.substring(0, 9) + '…';
              return val;
            },
            rich: {}
          }
        },
        series: [{
          type: 'bar',
          data: values,
          barWidth: '55%',
          label: {
            show: true,
            position: 'right',
            color: COLOR.text1,
            fontSize: 11,
            fontFamily: 'DIN Alternate',
            formatter: function (p) { return formatNum(p.value); }
          },
          animationDelay: function (idx) { return idx * 60; }
        }]
      };
    }

    function render(data) {
      chart.setOption(buildOption(data), true);
    }
    return { chart: chart, render: render };
  }

  // ============================================================
  // 3. 桑基图
  // ============================================================
  function createSankeyChart(dom) {
    const chart = echarts.init(dom);

    function buildOption(data) {
      // 过滤极小值，避免视觉噪点
      const maxLink = Math.max.apply(null, data.sankey.links.map(function (l) { return l.value; }).concat([1]));
      const threshold = Math.max(2, Math.round(maxLink * 0.03));
      const links = data.sankey.links
        .filter(function (l) { return l.value >= threshold; })
        .map(function (l) {
          const isGold = l.target.indexOf('项目部') === 0;
          return {
            source: l.source,
            target: l.target,
            value: l.value,
            lineStyle: {
              color: isGold
                ? hexToRgba(COLOR.gold, 0.35)
                : hexToRgba(COLOR.primary, 0.28),
              curveness: 0.5,
              opacity: 0.7
            }
          };
        });

      // 重建 nodes，仅保留 links 中实际引用的
      const usedNames = new Set();
      links.forEach(function (l) { usedNames.add(l.source); usedNames.add(l.target); });
      const nodeMap = {};
      data.sankey.nodes.forEach(function (n) { nodeMap[n.name] = n; });
      const nodes = Array.from(usedNames).map(function (name) {
        return nodeMap[name] || { name: name, itemStyle: { color: COLOR.primary } };
      });

      return {
        animationDuration: 900,
        animationEasing: 'cubicOut',
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'item',
          triggerOn: 'mousemove',
          formatter: function (p) {
            if (p.dataType === 'edge') {
              return p.data.source + ' → ' + p.data.target + '<br/>流量：<b style="color:' + COLOR.primary + '">' + formatNum(p.data.value) + '</b> 条';
            }
            return p.name + '<br/>节点流量：<b>' + (p.value || 0) + '</b>';
          }
        }),
        series: [{
          type: 'sankey',
          left: 10,
          right: 90,
          top: 10,
          bottom: 10,
          nodeWidth: 12,
          nodeGap: 6,
          layoutIterations: 64,
          emphasis: { focus: 'adjacency' },
          lineStyle: { curveness: 0.5 },
          label: {
            color: COLOR.text2,
            fontSize: 10,
            formatter: function (p) {
              const n = String(p.name);
              return n.length > 12 ? n.substring(0, 11) + '…' : n;
            }
          },
          itemStyle: { borderWidth: 0 },
          data: nodes,
          links: links
        }]
      };
    }

    function render(data) {
      chart.setOption(buildOption(data), true);
    }
    return { chart: chart, render: render };
  }

  // ============================================================
  // 4. 双轴组合图（活动线索数柱 + 转化率折线）
  // ============================================================
  function createComboChart(dom) {
    const chart = echarts.init(dom);

    function buildOption(data) {
      const list = data.activityRank.filter(function (a) { return a.orders > 0; });
      const names = list.map(function (a) { return a.name; });
      const orders = list.map(function (a) { return a.orders; });
      const rates = list.map(function (a) { return +a.rate.toFixed(2); });

      return {
        animationDuration: 800,
        animationEasing: 'cubicOut',
        grid: { left: 50, right: 50, top: 30, bottom: 60, containLabel: false },
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'axis',
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,163,255,0.06)' } },
          formatter: function (params) {
            if (!params || !params.length) return '';
            const name = params[0].name;
            const order = params.find(function (p) { return p.seriesName === '线索数'; });
            const rate = params.find(function (p) { return p.seriesName === '转化率'; });
            return '<div style="font-weight:600;margin-bottom:6px;">' + name + '</div>'
              + '<div style="color:' + COLOR.text2 + ';line-height:1.7;">线索：<b style="color:' + COLOR.primary + ';font-family:DIN Alternate;">'
              + formatNum(order ? order.value : 0) + '</b> 条</div>'
              + '<div style="color:' + COLOR.text2 + ';line-height:1.7;">转化率：<b style="color:' + COLOR.coral + ';font-family:DIN Alternate;">'
              + (rate ? rate.value : 0).toFixed(2) + '%</b></div>';
          }
        }),
        legend: { show: false },
        xAxis: {
          type: 'category',
          data: names,
          axisLine: { lineStyle: { color: COLOR.axisLine } },
          axisTick: { show: false },
          axisLabel: {
            color: COLOR.text2,
            fontSize: 10,
            interval: 0,
            rotate: 18,
            formatter: function (val) {
              // 千元礼包前缀加星标
              if (val === '千元礼包') return '★ ' + val;
              return val.length > 7 ? val.substring(0, 6) + '…' : val;
            }
          }
        },
        yAxis: [
          {
            type: 'value',
            name: '线索数',
            nameTextStyle: { color: COLOR.text3, fontSize: 10, padding: [0, 0, 4, -30] },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: COLOR.splitLine, type: 'dashed' } },
            axisLabel: { color: COLOR.text3, fontSize: 10 }
          },
          {
            type: 'value',
            name: '转化率(%)',
            nameTextStyle: { color: COLOR.text3, fontSize: 10, padding: [0, -28, 4, 0] },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: COLOR.text3, fontSize: 10, formatter: '{value}%' }
          }
        ],
        series: [
          {
            name: '线索数',
            type: 'bar',
            data: list.map(function (a) {
              return {
                value: a.orders,
                itemStyle: {
                  color: a.highlight
                    ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: COLOR.gold },
                        { offset: 1, color: hexToRgba(COLOR.goldDeep, 0.5) }
                      ])
                    : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(0,163,255,0.9)' },
                        { offset: 1, color: 'rgba(0,163,255,0.35)' }
                      ]),
                  borderRadius: [3, 3, 0, 0],
                  shadowColor: a.highlight ? 'rgba(255,215,0,0.4)' : 'rgba(0,163,255,0.3)',
                  shadowBlur: 8
                }
              };
            }),
            barWidth: '45%',
            label: {
              show: true,
              position: 'top',
              color: COLOR.text2,
              fontSize: 10,
              fontFamily: 'DIN Alternate',
              formatter: function (p) { return formatNum(p.value); }
            }
          },
          {
            name: '转化率',
            type: 'line',
            yAxisIndex: 1,
            data: rates,
            smooth: true,
            symbol: 'circle',
            symbolSize: function (val, params) {
              const item = list[params.dataIndex];
              return item && item.highlight ? 10 : 6;
            },
            lineStyle: { color: COLOR.coral, width: 2, shadowColor: 'rgba(255,122,69,0.4)', shadowBlur: 8 },
            itemStyle: {
              color: function (params) {
                const item = list[params.dataIndex];
                return item && item.highlight ? COLOR.gold : COLOR.coral;
              },
              borderColor: '#fff',
              borderWidth: 1
            },
            label: {
              show: true,
              position: 'top',
              color: COLOR.coral,
              fontSize: 10,
              fontFamily: 'DIN Alternate',
              formatter: function (p) { return p.value.toFixed(2) + '%'; }
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255,122,69,0.25)' },
                { offset: 1, color: 'rgba(255,122,69,0)' }
              ])
            }
          }
        ]
      };
    }

    function render(data) {
      chart.setOption(buildOption(data), true);
    }
    return { chart: chart, render: render };
  }

  // ============================================================
  // 5. 城市热力 Top10 - 横向条形图（带进度条样式）
  // ============================================================
  function createCityChart(dom) {
    const chart = echarts.init(dom);

    function buildOption(data) {
      const list = data.cityTop.slice(0, 10);
      if (!list.length) {
        return {
          title: {
            text: '当前筛选条件下暂无城市数据',
            left: 'center',
            top: 'center',
            textStyle: { color: COLOR.text3, fontSize: 13, fontWeight: 'normal' }
          }
        };
      }
      const max = Math.max.apply(null, list.map(function (c) { return c.orders; }));
      const sorted = list.slice().sort(function (a, b) { return a.orders - b.orders; });
      const names = sorted.map(function (c) { return c.city; });

      return {
        animationDuration: 700,
        animationEasing: 'cubicOut',
        grid: { left: 80, right: 60, top: 6, bottom: 6, containLabel: false },
        tooltip: Object.assign(commonTooltip(), {
          trigger: 'item',
          formatter: function (p) {
            const item = sorted[p.dataIndex];
            const star = item.gift > 0 ? '<div style="color:' + COLOR.gold + ';font-size:11px;margin-top:2px;">★ 千元礼包重点城市</div>' : '';
            return '<div style="font-weight:600;">' + item.city + '</div>'
              + '<div style="color:' + COLOR.text2 + ';margin-top:4px;">线索：<b style="color:' + COLOR.primary + '">' + formatNum(item.orders) + '</b> 条</div>'
              + star;
          }
        }),
        xAxis: { type: 'value', show: false, max: function (v) { return v.max * 1.1; } },
        yAxis: {
          type: 'category',
          data: names,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: function (val) {
              const item = sorted.find(function (x) { return x.city === val; });
              return item && item.gift > 0 ? COLOR.gold : COLOR.text2;
            },
            fontSize: 11,
            formatter: function (val) {
              const item = sorted.find(function (x) { return x.city === val; });
              return item && item.gift > 0 ? '★ ' + val : val;
            }
          }
        },
        series: [{
          type: 'bar',
          data: sorted.map(function (c) {
            const isGold = c.gift > 0;
            const ratio = c.orders / max;
            return {
              value: c.orders,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: isGold ? hexToRgba(COLOR.goldDeep, 0.3) : 'rgba(0,163,255,0.15)' },
                  { offset: 1, color: isGold ? COLOR.gold : COLOR.primary }
                ]),
                borderRadius: [0, 10, 10, 0],
                shadowColor: isGold ? 'rgba(255,215,0,0.35)' : 'rgba(0,163,255,0.3)',
                shadowBlur: 6
              }
            };
          }),
          barWidth: '52%',
          // 背景轨道
          showBackground: true,
          backgroundStyle: {
            color: 'rgba(255,255,255,0.05)',
            borderRadius: [0, 10, 10, 0]
          },
          label: {
            show: true,
            position: 'right',
            color: COLOR.text1,
            fontSize: 11,
            fontFamily: 'DIN Alternate',
            formatter: function (p) { return formatNum(p.value) + ' 条'; }
          },
          animationDelay: function (idx) { return idx * 50; }
        }]
      };
    }

    function render(data) {
      chart.setOption(buildOption(data), true);
    }
  
  // ============================================================
  // 6. 活动分类 GMV 柱状图
  // ============================================================
  function createGmvBarChart(dom) {
    const chart = echarts.init(dom);

    const CATEGORIES = [
      { name: '千元礼包', highlight: true },
      { name: '省份志愿群', highlight: false },
      { name: '内部专场讲座', highlight: false },
      { name: '小课系列活动', highlight: false }
    ];

    function buildOption(data) {
      const activityRank = data.activityRank || [];
      const items = CATEGORIES.map(function (cat) {
        const found = activityRank.find(function (a) { return a.name === cat.name; });
        return {
          name: cat.name,
          amount: found ? found.amount : 0,
          highlight: cat.highlight
        };
      });
      // 按金额降序
      items.sort(function (a, b) { return b.amount - a.amount; });
      const names = items.map(function (it) { return it.name; });
      const amounts = items.map(function (it) { return it.amount; });

      return {
        animationDuration: 800,
        animationEasing: 'cubicOut',
        grid: { left: 10, right: 20, top: 12, bottom: 28, containLabel: false },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,163,255,0.06)' } },
          backgroundColor: 'rgba(11,26,48,0.92)',
          borderColor: 'rgba(0,163,255,0.3)',
          borderWidth: 1,
          textStyle: { color: '#E6F4FF', fontSize: 12 },
          formatter: function (params) {
            if (!params || !params.length) return '';
            const p = params[0];
            return '<div style="font-weight:600;margin-bottom:4px;">' + p.name + '</div>'
              + '<div style="color:#8AA8C8;">GMV：<b style="color:#00A3FF;font-family:DIN Alternate;">¥' + formatMoney(p.value) + '</b></div>';
          }
        },
        xAxis: {
          type: 'category',
          data: names,
          axisLine: { lineStyle: { color: 'rgba(0,163,255,0.2)' } },
          axisTick: { show: false },
          axisLabel: {
            color: '#8AA8C8',
            fontSize: 11,
            interval: 0,
            formatter: function (val) {
              if (val === '千元礼包') return '★ ' + val;
              return val.length > 6 ? val.substring(0, 5) + '…' : val;
            }
          }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: 'rgba(0,163,255,0.08)', type: 'dashed' } },
          axisLabel: {
            color: '#5C7595',
            fontSize: 10,
            formatter: function (v) { return v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v; }
          }
        },
        series: [{
          type: 'bar',
          data: amounts.map(function (amt, i) {
            const isGold = items[i].highlight;
            return {
              value: amt,
              itemStyle: {
                color: isGold
                  ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: '#FFD700' },
                      { offset: 1, color: 'rgba(201,162,39,0.5)' }
                    ])
                  : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: 'rgba(0,163,255,0.9)' },
                      { offset: 1, color: 'rgba(0,163,255,0.35)' }
                    ]),
                borderRadius: [4, 4, 0, 0],
                shadowColor: isGold ? 'rgba(255,215,0,0.4)' : 'rgba(0,163,255,0.3)',
                shadowBlur: 8
              }
            };
          }),
          barWidth: '50%',
          label: {
            show: true,
            position: 'top',
            color: '#8AA8C8',
            fontSize: 11,
            fontFamily: 'DIN Alternate',
            formatter: function (p) { return '¥' + formatMoney(p.value); }
          }
        }]
      };
    }

    function render(data) {
      chart.setOption(buildOption(data), true);
    }
    return { chart: chart, render: render };
  }

  return { chart: chart, render: render };
  }

  // ============================================================
  // 导出
  // ============================================================
  global.DashboardCharts = {
    COLOR: COLOR,
    GEO_BASE: GEO_BASE,
    fetchGeo: fetchGeo,
    formatNum: formatNum,
    formatMoney: formatMoney,
    createMapChart: createMapChart,
    createRankChart: createRankChart,
    createSankeyChart: createSankeyChart,
    createComboChart: createComboChart,
    createCityChart: createCityChart,
    createGmvBarChart: createGmvBarChart
  };
})(window);
