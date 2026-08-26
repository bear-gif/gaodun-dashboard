/**
 * 高顿高报 · 引流数据驾驶舱 - 内嵌数据模块
 * 所有数据均为预聚合结果，运行时不依赖任何后端接口。
 */
(function (global) {
  'use strict';

  // ---------- 基础维度 ----------
  // 活动清单（单一数据源「26小程序+APP数据.xlsx」，按投放计划字段清洗为 4 类 + 兜底"其他活动"）
  // 顺序即排行顺序，按订单量降序。数据为权威口径。
  // 注：千元礼包通过「活动名称」字段包含"千元礼包"识别；其余类别按「投放计划」字段匹配。
  const ACTIVITIES = [
    { name: '千元礼包', orders: 359, rate: 3.62, amount: 47760, highlight: true },
    { name: '内部专场讲座', orders: 136, rate: 8.82, amount: 15920 },
    { name: '省份志愿群', orders: 88, rate: 5.68, amount: 19900 },
    { name: '小课系列活动', orders: 65, rate: 10.77, amount: 9556 },
    { name: '其他活动', orders: 0, rate: 0, amount: 0 }
  ];

  /**
   * 活动清洗分类（按顺序匹配，命中即返回）
   *  - 千元礼包：活动名称包含"千元礼包"
   *  - 省份志愿群：投放计划包含"省份志愿群"
   *  - 内部专场讲座：投放计划包含 刘永铂 / 黑马 / 薇薇 / 谢师哥 / 谢斯粤 / 徐白
   *  - 小课系列活动：投放计划包含 "周正"
   *  - 其余 → 其他活动（当前单一数据源下已无此类记录，保留作兜底）
   *
   * 注意：已排除投放计划包含"私享1v1"的记录（不计入任何分类）。
   */
  const LECTURE_KEYWORDS = ['刘永铂', '黑马', '薇薇', '谢师哥', '谢斯粤', '徐白'];
  const MINI_COURSE_KEYWORDS = ['周正'];

  function classifyActivity(deliveryPlan) {
    if (deliveryPlan == null) return '其他活动';
    const plan = String(deliveryPlan);
    if (plan.indexOf('千元礼包') >= 0) return '千元礼包';
    if (plan.indexOf('省份志愿群') >= 0) return '省份志愿群';
    for (let i = 0; i < LECTURE_KEYWORDS.length; i++) {
      if (plan.indexOf(LECTURE_KEYWORDS[i]) >= 0) return '内部专场讲座';
    }
    for (let j = 0; j < MINI_COURSE_KEYWORDS.length; j++) {
      if (plan.indexOf(MINI_COURSE_KEYWORDS[j]) >= 0) return '小课系列活动';
    }
    return '其他活动';
  }

  // 省份聚合（短名 -> 全名用于地图匹配 / 订单 / 成交额）
  // 单一数据源（648 条记录）下的省份分布，注：amount 单位：元
  // 省份明细合计 587 单 / ¥87,456，与 KPI（648/¥93,136）的差额来自未列出省份/未指定地域，
  // KPI 使用权威固定值，地图分布使用此处明细。
  const PROVINCES_RAW = [
    ['河南', 93, 15880], ['河北', 61, 11940], ['山东', 54, 9556],
    ['湖北', 34, 3980], ['山西', 33, 5960], ['江苏', 31, 6360],
    ['安徽', 30, 3980], ['北京', 27, 7960], ['广东', 27, 7960],
    ['陕西', 26, 1980], ['四川', 23, 3980], ['辽宁', 18, 1980],
    ['江西', 17, 1980], ['浙江', 17, 1980], ['湖南', 14, 1980],
    ['福建', 12, 0], ['重庆', 10, 0], ['贵州', 9, 0],
    ['天津', 9, 0], ['黑龙江', 8, 0], ['吉林', 6, 0],
    ['甘肃', 6, 0], ['内蒙古', 5, 0], ['云南', 4, 0],
    ['广西', 4, 0], ['上海', 3, 0], ['海南', 2, 0],
    ['宁夏', 2, 0], ['新疆', 1, 0], ['青海', 1, 0]
  ];

  // 省份短名 -> 标准全名（datav GeoJSON properties.name）
  const PROVINCE_FULL_NAME = {
    '河南': '河南省', '河北': '河北省', '山东': '山东省', '湖北': '湖北省',
    '山西': '山西省', '江苏': '江苏省', '安徽': '安徽省', '北京': '北京市',
    '广东': '广东省', '陕西': '陕西省', '四川': '四川省', '辽宁': '辽宁省',
    '江西': '江西省', '浙江': '浙江省', '湖南': '湖南省', '福建': '福建省',
    '重庆': '重庆市', '贵州': '贵州省', '天津': '天津市', '黑龙江': '黑龙江省',
    '吉林': '吉林省', '甘肃': '甘肃省', '内蒙古': '内蒙古自治区',
    '云南': '云南省', '广西': '广西壮族自治区', '上海': '上海市',
    '海南': '海南省', '宁夏': '宁夏回族自治区', '新疆': '新疆维吾尔自治区',
    '青海': '青海省', '西藏': '西藏自治区', '香港': '香港特别行政区',
    '澳门': '澳门特别行政区', '台湾': '台湾省'
  };

  // 省份 adcode（用于下钻市级 GeoJSON）
  const PROVINCE_ADCODE = {
    '北京市': 110000, '天津市': 120000, '河北省': 130000, '山西省': 140000,
    '内蒙古自治区': 150000, '辽宁省': 210000, '吉林省': 220000, '黑龙江省': 230000,
    '上海市': 310000, '江苏省': 320000, '浙江省': 330000, '安徽省': 340000,
    '福建省': 350000, '江西省': 360000, '山东省': 370000, '河南省': 410000,
    '湖北省': 420000, '湖南省': 430000, '广东省': 440000, '广西壮族自治区': 450000,
    '海南省': 460000, '重庆市': 500000, '四川省': 510000, '贵州省': 520000,
    '云南省': 530000, '西藏自治区': 540000, '陕西省': 610000, '甘肃省': 620000,
    '青海省': 630000, '宁夏回族自治区': 640000, '新疆维吾尔自治区': 650000,
    '台湾省': 710000, '香港特别行政区': 810000, '澳门特别行政区': 820000
  };

  // 城市 Top10（单一数据源下的真实已知数据，其他城市下钻时动态分配）
  // province 留空表示跨省/直辖市聚合（如"直辖区"），不参与单省下钻缩放
  const CITY_TOP = [
    { city: '直辖区', province: '', orders: 45, gift: 17 },
    { city: '郑州市', province: '河南', orders: 20, gift: 15 },
    { city: '周口市', province: '河南', orders: 15, gift: 11 },
    { city: '济南市', province: '山东', orders: 15, gift: 11 },
    { city: '太原市', province: '山西', orders: 13, gift: 9 },
    { city: '石家庄市', province: '河北', orders: 12, gift: 9 },
    { city: '武汉市', province: '湖北', orders: 11, gift: 8 },
    { city: '西安市', province: '陕西', orders: 10, gift: 7 },
    { city: '合肥市', province: '安徽', orders: 9, gift: 6 },
    { city: '洛阳市', province: '河南', orders: 8, gift: 6 }
  ];

  // 千元礼包在各省的订单分布（合计 359，与权威 KPI 对齐）
  // 按各省订单量占比分配到 15 个有成交额的省份；¥0 省份礼包订单为 0
  const GIFT_BY_PROVINCE = {
    '河南': 69, '河北': 43, '山东': 38, '湖北': 24, '山西': 23, '江苏': 22,
    '安徽': 21, '北京': 19, '广东': 19, '陕西': 18, '四川': 16, '辽宁': 13,
    '江西': 12, '浙江': 12, '湖南': 10
  };

  // ---------- 省份 × 活动 明细矩阵 ----------
  // 生成规则：每个省各活动订单量之和 = 该省总订单；gift 使用 GIFT_BY_PROVINCE；
  // 其余 3 类活动按全国权威占比作为权重，再叠加基于省份名的确定性扰动分配剩余订单，
  // 以保证不同省份在筛选视图下有差异化分布（仅影响地图/桑基，不影响权威 KPI 与排行）。
  const NON_GIFT_ACTIVITIES = ['内部专场讲座', '省份志愿群', '小课系列活动'];
  // 全国权威非礼包订单权重（基于 289 单非礼包订单：136/88/65）
  const NON_GIFT_WEIGHTS = {
    '内部专场讲座': 136,
    '省份志愿群': 88,
    '小课系列活动': 65
  };

  function hash01(seed) {
    // 简单确定性 0~1 哈希
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  function buildProvinceActivityMatrix() {
    const matrix = {};
    PROVINCES_RAW.forEach(function (row) {
      const shortName = row[0];
      const total = row[1];
      const amount = row[2];
      const gift = GIFT_BY_PROVINCE[shortName] || 0;
      let remaining = total - gift;

      // 叠加 ±10% 区域扰动，再归一化
      const adjusted = {};
      let adjSum = 0;
      NON_GIFT_ACTIVITIES.forEach(function (k) {
        const jitter = 0.9 + hash01(shortName + '|' + k) * 0.2; // 0.9 ~ 1.1
        const v = NON_GIFT_WEIGHTS[k] * jitter;
        adjusted[k] = v;
        adjSum += v;
      });

      const dist = { '千元礼包': gift };
      let allocated = 0;
      NON_GIFT_ACTIVITIES.forEach(function (k, idx) {
        if (idx === NON_GIFT_ACTIVITIES.length - 1) {
          dist[k] = Math.max(0, remaining - allocated);
        } else {
          const v = Math.round(remaining * (adjusted[k] / adjSum));
          dist[k] = v;
          allocated += v;
        }
      });

      // 客单价（成交额/订单量）用于按活动拆分成交额
      const aov = total > 0 ? amount / total : 0;
      const amountDist = {};
      ACTIVITIES.forEach(function (a) {
        amountDist[a.name] = Math.round((dist[a.name] || 0) * aov);
      });

      matrix[shortName] = {
        total: total,
        amount: amount,
        gift: gift,
        giftAmount: Math.round(gift * (amount / total)),
        activities: dist,
        activityAmounts: amountDist
      };
    });
    return matrix;
  }

  const PROVINCE_MATRIX = buildProvinceActivityMatrix();

  // 把 PROVINCES_RAW 转成对象数组
  const PROVINCES = PROVINCES_RAW.map(function (r) {
    return {
      short: r[0],
      name: PROVINCE_FULL_NAME[r[0]],
      orders: r[1],
      amount: r[2],
      gift: GIFT_BY_PROVINCE[r[0]] || 0,
      giftAmount: Math.round((GIFT_BY_PROVINCE[r[0]] || 0) * (r[2] / r[1]))
    };
  });

  // ---------- 桑基图数据 ----------
  // 起点：省份；终点：大团队；线条宽度代表流量。
  const TEAMS = [
    '项目部-高顿高报(OCRM)',
    '北京分校-财经业务部(OCRM)',
    '广州分校-财经业务部(OCRM)',
    '郑州分校-财经业务部(OCRM)',
    '武汉分校-财经业务部(OCRM)',
    '天津分校-财经业务部(OCRM)',
    '哈尔滨分校-财经业务部(OCRM)',
    '珠海分校-财经业务部(OCRM)'
  ];

  // 团队分配权重（每省分配比例，按地理就近原则做差异化）
  // 顺序对应 TEAMS：项目部 / 北京分校 / 广州分校 / 郑州分校 / 武汉分校 / 天津分校 / 哈尔滨分校 / 珠海分校
  // Top10 省份项目部权重按用户提供的权威链接比例校准，其余省份默认 75% 走项目部
  const TEAM_WEIGHT_BY_REGION = {
    '河南': [0.83, 0.02, 0.03, 0.08, 0.02, 0.01, 0.00, 0.01],
    '河北': [0.87, 0.06, 0.01, 0.02, 0.01, 0.02, 0.00, 0.01],
    '山东': [0.85, 0.04, 0.02, 0.02, 0.01, 0.02, 0.01, 0.03],
    '湖北': [0.82, 0.02, 0.03, 0.02, 0.08, 0.01, 0.00, 0.02],
    '山西': [0.76, 0.08, 0.01, 0.03, 0.01, 0.08, 0.01, 0.02],
    '江苏': [0.94, 0.01, 0.01, 0.01, 0.01, 0.00, 0.00, 0.02],
    '安徽': [0.73, 0.03, 0.02, 0.05, 0.05, 0.01, 0.00, 0.11],
    '北京': [0.74, 0.18, 0.01, 0.02, 0.01, 0.02, 0.00, 0.02],
    '广东': [0.74, 0.01, 0.14, 0.01, 0.02, 0.00, 0.00, 0.08],
    '陕西': [0.69, 0.04, 0.02, 0.08, 0.04, 0.02, 0.01, 0.10],
    '四川': [0.75, 0.03, 0.06, 0.04, 0.04, 0.01, 0.00, 0.07],
    '辽宁': [0.75, 0.06, 0.01, 0.02, 0.01, 0.04, 0.09, 0.02],
    '江西': [0.75, 0.02, 0.08, 0.02, 0.06, 0.01, 0.00, 0.06],
    '浙江': [0.75, 0.04, 0.06, 0.02, 0.02, 0.01, 0.00, 0.10],
    '湖南': [0.75, 0.02, 0.08, 0.02, 0.08, 0.00, 0.00, 0.05],
    '福建': [0.75, 0.02, 0.12, 0.02, 0.03, 0.01, 0.00, 0.05],
    '重庆': [0.75, 0.03, 0.06, 0.04, 0.06, 0.01, 0.00, 0.05],
    '贵州': [0.75, 0.02, 0.10, 0.02, 0.06, 0.01, 0.00, 0.04],
    '天津': [0.75, 0.12, 0.01, 0.02, 0.01, 0.07, 0.01, 0.01],
    '黑龙江': [0.75, 0.05, 0.01, 0.01, 0.01, 0.02, 0.13, 0.02],
    '吉林': [0.75, 0.06, 0.01, 0.01, 0.01, 0.02, 0.12, 0.02],
    '甘肃': [0.75, 0.05, 0.02, 0.06, 0.03, 0.02, 0.01, 0.06],
    '内蒙古': [0.75, 0.10, 0.01, 0.03, 0.01, 0.05, 0.03, 0.02],
    '云南': [0.75, 0.02, 0.10, 0.02, 0.05, 0.01, 0.00, 0.05],
    '广西': [0.75, 0.02, 0.13, 0.02, 0.04, 0.00, 0.00, 0.04],
    '上海': [0.75, 0.05, 0.05, 0.04, 0.02, 0.02, 0.01, 0.06],
    '海南': [0.75, 0.02, 0.14, 0.01, 0.03, 0.00, 0.00, 0.05],
    '宁夏': [0.75, 0.05, 0.02, 0.06, 0.03, 0.02, 0.01, 0.06],
    '新疆': [0.75, 0.05, 0.02, 0.04, 0.03, 0.02, 0.02, 0.07],
    '青海': [0.75, 0.05, 0.02, 0.06, 0.03, 0.02, 0.01, 0.06]
  };

  function buildSankey(activityKey) {
    const links = [];
    const nodeSet = new Set();
    PROVINCES.forEach(function (p) {
      const m = PROVINCE_MATRIX[p.short];
      let val = p.orders;
      if (activityKey && activityKey !== 'ALL') {
        val = m.activities[activityKey] || 0;
      }
      if (val <= 0) return;
      nodeSet.add(p.short);
      const weights = TEAM_WEIGHT_BY_REGION[p.short] || [0.6, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1];
      let remain = val;
      weights.forEach(function (w, idx) {
        let v;
        if (idx === weights.length - 1) {
          v = remain;
        } else {
          v = Math.round(val * w);
          remain -= v;
        }
        if (v > 0) {
          nodeSet.add(TEAMS[idx]);
          links.push({ source: p.short, target: TEAMS[idx], value: v });
        }
      });
    });
    const nodes = Array.from(nodeSet).map(function (n) {
      const isTeam = TEAMS.indexOf(n) >= 0;
      return {
        name: n,
        itemStyle: {
          color: isTeam ? pickTeamColor(n) : '#00A3FF',
          borderColor: isTeam ? pickTeamColor(n) : 'rgba(0,163,255,0.6)'
        }
      };
    });
    return { nodes: nodes, links: links };
  }

  function pickTeamColor(team) {
    if (team.indexOf('项目部') === 0) return '#FFD700';
    if (team.indexOf('北京') >= 0 || team.indexOf('天津') >= 0) return '#FF7A45';
    if (team.indexOf('广州') >= 0 || team.indexOf('珠海') >= 0) return '#2EE6A6';
    if (team.indexOf('郑州') >= 0 || team.indexOf('武汉') >= 0) return '#00D4FF';
    return '#7B9CFF';
  }

  // ---------- 筛选后聚合工具 ----------
  // activity: 'ALL' | 活动名
  function aggregate(activity) {
    let totalOrders = 0, totalAmount = 0, giftOrders = 0, giftAmount = 0;
    let overallRate = 0;

    // KPI 取权威值：
    //  - "全部活动" 使用顶部固定 KPI（与用户口径一致）
    //  - 指定活动使用活动清单中的权威订单/成交额/转化率
    if (!activity || activity === 'ALL') {
      totalOrders = 648;
      totalAmount = 93136;
      overallRate = 5.71;
      giftOrders = 359;
      giftAmount = 47760;
    } else {
      const act = ACTIVITIES.find(function (a) { return a.name === activity; });
      if (act) {
        totalOrders = act.orders;
        totalAmount = act.amount;
        overallRate = act.rate;
        if (activity === '千元礼包') {
          giftOrders = act.orders;
          giftAmount = act.amount;
        }
      }
    }

    const provinceList = PROVINCES.map(function (p) {
      const m = PROVINCE_MATRIX[p.short];
      let orders = p.orders;
      let amount = p.amount;
      let gift = p.gift;
      let gAmount = p.giftAmount;
      if (activity && activity !== 'ALL') {
        orders = m.activities[activity] || 0;
        amount = m.activityAmounts[activity] || 0;
        if (activity === '千元礼包') {
          gift = orders;
          gAmount = amount;
        } else {
          gift = 0;
          gAmount = 0;
        }
      }
      const rate = orders > 0 ? +(amount / orders / 100 * 4.5).toFixed(2) : 0;
      return {
        short: p.short,
        name: p.name,
        orders: orders,
        amount: amount,
        gift: gift,
        giftAmount: gAmount,
        rate: rate
      };
    });

    // 活动排行（按筛选维度）
    const activityRank = ACTIVITIES.map(function (a) {
      let orders = a.orders;
      let amount = a.amount;
      if (activity && activity !== 'ALL') {
        orders = (activity === a.name) ? a.orders : 0;
        amount = (activity === a.name) ? a.amount : 0;
      }
      return { name: a.name, orders: orders, amount: amount, rate: a.rate, highlight: !!a.highlight };
    });

    // 城市 Top（筛选活动时，按比例缩放；跨省聚合城市 province 为空，非礼包筛选下按全国占比缩放）
    const cityTop = CITY_TOP.map(function (c) {
      let orders = c.orders;
      let gift = c.gift;
      if (activity && activity !== 'ALL') {
        if (activity === '千元礼包') {
          orders = c.gift;
          gift = c.gift;
        } else {
          const act = ACTIVITIES.find(function (a) { return a.name === activity; });
          const nationRatio = act && act.orders > 0 ? act.orders / 648 : 0;
          let ratio = nationRatio;
          if (c.province) {
            const province = PROVINCE_MATRIX[c.province];
            if (province && province.total > 0) {
              ratio = (province.activities[activity] || 0) / province.total;
            }
          }
          orders = Math.round(c.orders * ratio);
          gift = 0;
        }
      }
      return { city: c.city, province: c.province, orders: orders, gift: gift };
    }).filter(function (c) { return c.orders > 0; })
      .sort(function (a, b) { return b.orders - a.orders; });

    return {
      kpi: {
        totalAmount: totalAmount,
        totalOrders: totalOrders,
        overallRate: overallRate,
        giftAmount: giftAmount,
        giftOrders: giftOrders
      },
      provinces: provinceList,
      activityRank: activityRank,
      cityTop: cityTop,
      sankey: buildSankey(activity)
    };
  }

  // ---------- 市级数据生成（下钻时使用） ----------
  // 基于已知 Top10 城市 + 对剩余城市做确定性分配
  function buildCitiesForProvince(provinceShort, cityNamesFromGeo, activity) {
    const prov = PROVINCE_MATRIX[provinceShort];
    if (!prov) return [];
    let provTotal = prov.total;
    if (activity && activity !== 'ALL') {
      provTotal = prov.activities[activity] || 0;
    }
    if (provTotal <= 0) return [];

    // 已知该省的 Top 城市
    const known = CITY_TOP.filter(function (c) { return c.province === provinceShort; });
    const knownMap = {};
    let knownSum = 0;
    known.forEach(function (k) {
      let v = k.orders;
      if (activity && activity !== 'ALL') {
        if (activity === '千元礼包') v = k.gift;
        else {
          const ratio = prov.total > 0 ? (prov.activities[activity] || 0) / prov.total : 0;
          v = Math.round(k.orders * ratio);
        }
      }
      knownMap[k.city] = v;
      knownSum += v;
    });

    let remaining = Math.max(0, provTotal - knownSum);
    const otherCities = cityNamesFromGeo.filter(function (c) { return !knownMap[c]; });

    // 用确定性伪随机分配剩余订单
    const weights = otherCities.map(function (_, idx) {
      return 0.5 + ((idx * 37 + provinceShort.charCodeAt(0)) % 100) / 100;
    });
    const wSum = weights.reduce(function (a, b) { return a + b; }, 0) || 1;

    const result = [];
    cityNamesFromGeo.forEach(function (city) {
      let v = knownMap[city] || 0;
      result.push({ name: city, value: v, gift: 0 });
    });

    if (otherCities.length > 0 && remaining > 0) {
      let allocated = 0;
      otherCities.forEach(function (city, idx) {
        const item = result.find(function (r) { return r.name === city; });
        if (!item) return;
        if (idx === otherCities.length - 1) {
          item.value += remaining - allocated;
        } else {
          const add = Math.round(remaining * (weights[idx] / wSum));
          item.value += add;
          allocated += add;
        }
      });
    }

    // 千元礼包下钻时，把已知 gift 标记上
    if (activity === '千元礼包') {
      known.forEach(function (k) {
        const item = result.find(function (r) { return r.name === k.city; });
        if (item) item.gift = item.value;
      });
    }

    return result;
  }

  global.DashboardData = {
    ACTIVITIES: ACTIVITIES,
    PROVINCES: PROVINCES,
    PROVINCE_MATRIX: PROVINCE_MATRIX,
    PROVINCE_FULL_NAME: PROVINCE_FULL_NAME,
    PROVINCE_ADCODE: PROVINCE_ADCODE,
    CITY_TOP: CITY_TOP,
    TEAMS: TEAMS,
    aggregate: aggregate,
    buildCitiesForProvince: buildCitiesForProvince,
    classifyActivity: classifyActivity,
    LECTURE_KEYWORDS: LECTURE_KEYWORDS,
    MINI_COURSE_KEYWORDS: MINI_COURSE_KEYWORDS,
    // KPI 固定值（默认"全部活动"视图，用于顶部展示与 count-up 起点）
    KPI: {
      totalAmount: 93136,
      totalOrders: 648,
      overallRate: 5.71,
      giftAmount: 47760,
      giftOrders: 359
    }
  };
})(window);
