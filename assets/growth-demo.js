(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GrowthDemo = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { api.mount(document); });
    else api.mount(document);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_LEVEL = 12;
  var RATES = Object.freeze({ gather: 3, process: 5 });
  var DEFAULTS = Object.freeze({
    dailyMinutes: 30,
    gatherPercent: 60,
    baseCost: 180,
    costGrowthPercent: 18,
    productivityPercent: 8,
    targetLevel: 8,
    horizon: 60
  });
  var FIELDS = Object.freeze({
    dailyMinutes: { label: "每日投入", min: 5, max: 90, unit: "分钟" },
    gatherPercent: { label: "采集时间占比", min: 20, max: 80, unit: "%" },
    baseCost: { label: "首次升级需求", min: 80, max: 400, unit: "成长点" },
    costGrowthPercent: { label: "逐级需求增幅", min: 5, max: 35, unit: "%" },
    productivityPercent: { label: "每级产能加成", min: 0, max: 20, unit: "%" },
    targetLevel: { label: "目标等级", min: 3, max: MAX_LEVEL, integer: true, unit: "级" },
    horizon: { label: "观察窗口", min: 30, max: 120, integer: true, choices: [30, 60, 90, 120], unit: "天" }
  });
  var PRESETS = Object.freeze({
    baseline: Object.freeze(Object.assign({}, DEFAULTS)),
    short: Object.freeze(Object.assign({}, DEFAULTS, { dailyMinutes: 20, gatherPercent: 62.5, baseCost: 160, costGrowthPercent: 16, productivityPercent: 8 })),
    gentle: Object.freeze(Object.assign({}, DEFAULTS, { dailyMinutes: 30, gatherPercent: 62.5, baseCost: 200, costGrowthPercent: 12, productivityPercent: 6 }))
  });
  var SENSITIVITY_KEYS = ["dailyMinutes", "gatherPercent", "baseCost", "costGrowthPercent", "productivityPercent"];
  var EPSILON = 1e-9;

  function validate(input) {
    var parameters = {};
    var errors = {};
    input = input || {};
    Object.keys(FIELDS).forEach(function (key) {
      var spec = FIELDS[key];
      var raw = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : DEFAULTS[key];
      var number = (typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")) ? Number(raw) : NaN;
      if (!Number.isFinite(number)) errors[key] = "请输入有效数字。";
      else if (number < spec.min || number > spec.max) errors[key] = "范围为 " + spec.min + "–" + spec.max + " " + spec.unit + "。";
      else if (spec.integer && !Number.isInteger(number)) errors[key] = "请输入整数。";
      else if (spec.choices && spec.choices.indexOf(number) === -1) errors[key] = "请选择 30、60、90 或 120 天。";
      else parameters[key] = number;
    });
    return { valid: Object.keys(errors).length === 0, parameters: parameters, errors: errors };
  }

  function requireParameters(input) {
    var checked = validate(input);
    if (!checked.valid) {
      var error = new RangeError("演示参数无效：" + Object.keys(checked.errors).map(function (key) { return FIELDS[key].label + checked.errors[key]; }).join(" "));
      error.fields = checked.errors;
      throw error;
    }
    return checked.parameters;
  }

  function thresholdsFor(parameters) {
    var thresholds = [0, 0];
    var sum = 0;
    var ratio = 1 + parameters.costGrowthPercent / 100;
    for (var level = 2; level <= MAX_LEVEL; level += 1) {
      sum += parameters.baseCost * Math.pow(ratio, level - 2);
      thresholds[level] = sum;
    }
    return thresholds;
  }

  function simulate(input) {
    var p = requireParameters(input);
    var thresholds = thresholdsFor(p);
    var targetPoints = thresholds[p.targetLevel];
    var level = 1;
    var points = 0;
    var stock = 0;
    var totalGathered = 0;
    var totalCapacity = 0;
    var targetDay = null;
    var rows = [{ day: 0, level: 1, startLevel: 1, points: 0, stock: 0, gathered: 0, capacity: 0, crafted: 0 }];
    for (var day = 1; day <= p.horizon; day += 1) {
      var startLevel = level;
      var boost = 1 + p.productivityPercent / 100 * (startLevel - 1);
      var gathered = p.dailyMinutes * p.gatherPercent / 100 * RATES.gather * boost;
      var capacity = p.dailyMinutes * (1 - p.gatherPercent / 100) * RATES.process * boost;
      var crafted = Math.min(stock + gathered, capacity);
      stock = Math.max(0, stock + gathered - crafted);
      points += crafted;
      totalGathered += gathered;
      totalCapacity += capacity;
      while (level < MAX_LEVEL && points + EPSILON >= thresholds[level + 1]) level += 1;
      if (targetDay === null && points + EPSILON >= targetPoints) targetDay = day;
      rows.push({
        day: day, level: level, startLevel: startLevel, points: points,
        stock: stock, gathered: gathered, capacity: capacity, crafted: crafted
      });
    }
    return {
      parameters: p, rows: rows, thresholds: thresholds, targetPoints: targetPoints,
      targetDay: targetDay, reached: targetDay !== null,
      finalPoints: points, finalLevel: level, finalStock: stock,
      totalGathered: totalGathered, totalCapacity: totalCapacity,
      processingUtilization: totalCapacity > 0 ? points / totalCapacity : 0,
      targetProgress: Math.min(1, points / targetPoints)
    };
  }

  function baselineFor(input) {
    var p = requireParameters(input);
    return Object.assign({}, DEFAULTS, { targetLevel: p.targetLevel, horizon: p.horizon });
  }

  function sensitivity(input) {
    var p = requireParameters(input);
    var reference = simulate(p);
    return SENSITIVITY_KEYS.map(function (key) {
      function alternative(multiplier) {
        var value = Number((p[key] * multiplier).toFixed(8));
        var changed = Object.assign({}, p);
        changed[key] = value;
        var checked = validate(changed);
        if (!checked.valid) return { valid: false, value: value, reason: checked.errors[key] };
        var run = simulate(changed);
        return {
          valid: true, value: value, unchanged: value === p[key],
          targetDay: run.targetDay, reached: run.reached,
          dayDifference: run.reached && reference.reached ? run.targetDay - reference.targetDay : null,
          finalPoints: run.finalPoints,
          pointsChangePercent: reference.finalPoints > 0 ? (run.finalPoints / reference.finalPoints - 1) * 100 : 0
        };
      }
      return { key: key, label: FIELDS[key].label, unit: FIELDS[key].unit, lower: alternative(0.9), upper: alternative(1.1) };
    });
  }

  function exportData(input) {
    return { synthetic: true, parameters: requireParameters(input) };
  }

  function format(number, digits) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits === undefined ? 0 : digits }).format(number);
  }

  function signed(number, digits) {
    return (number > 0 ? "+" : "") + format(number, digits);
  }

  function dayText(run, horizon) {
    return run.targetDay === null ? horizon + " 天内未达标" : "第 " + run.targetDay + " 天";
  }

  function niceScale(maximum) {
    var raw = maximum / 5;
    var magnitude = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var normalized = raw / magnitude;
    var multipliers = [1, 2, 2.5, 5, 10];
    var chosen = multipliers.find(function (n) { return n >= normalized; }) || 10;
    var step = chosen * magnitude;
    return { max: Math.ceil(maximum / step) * step, step: step };
  }

  function createChart(current, baseline) {
    var width = 780, height = 330;
    var pad = { left: 72, right: 28, top: 38, bottom: 48 };
    var plotWidth = width - pad.left - pad.right;
    var plotHeight = height - pad.top - pad.bottom;
    var scale = niceScale(Math.max(current.finalPoints, baseline.finalPoints, current.targetPoints, baseline.targetPoints) * 1.08);
    function x(day) { return pad.left + day / current.parameters.horizon * plotWidth; }
    function y(points) { return height - pad.bottom - points / scale.max * plotHeight; }
    function line(rows) { return rows.map(function (row) { return x(row.day).toFixed(2) + "," + y(row.points).toFixed(2); }).join(" "); }
    var svg = [
      '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-labelledby="growth-chart-title growth-chart-desc" xmlns="http://www.w3.org/2000/svg">',
      '<title id="growth-chart-title">当前方案与固定基准的累计成长曲线</title>',
      '<desc id="growth-chart-desc">横轴为天数，纵轴为累计成长点。当前方案：' + dayText(current, current.parameters.horizon) + '；固定基准：' + dayText(baseline, baseline.parameters.horizon) + '。目标线采用各自的成长需求。</desc>',
      '<text class="axis-label" x="10" y="18">累计成长（点）</text>'
    ];
    for (var tick = 0; tick <= scale.max + EPSILON; tick += scale.step) {
      svg.push('<line class="grid-line" x1="' + pad.left + '" y1="' + y(tick).toFixed(2) + '" x2="' + (width - pad.right) + '" y2="' + y(tick).toFixed(2) + '"/>');
      svg.push('<text class="tick-label" x="' + (pad.left - 12) + '" y="' + (y(tick) + 4).toFixed(2) + '" text-anchor="end">' + format(tick) + '</text>');
    }
    var xStep = current.parameters.horizon / 6;
    for (var d = 0; d <= current.parameters.horizon; d += xStep) {
      svg.push('<text class="tick-label" x="' + x(d).toFixed(2) + '" y="' + (height - 24) + '" text-anchor="middle">' + format(d) + '</text>');
    }
    svg.push('<text class="axis-label" x="' + (width - pad.right) + '" y="' + (height - 4) + '" text-anchor="end">时间（天）</text>');
    var equalTargets = Math.abs(current.targetPoints - baseline.targetPoints) < EPSILON;
    svg.push('<line class="target-line current-target" x1="' + pad.left + '" y1="' + y(current.targetPoints).toFixed(2) + '" x2="' + (width - pad.right) + '" y2="' + y(current.targetPoints).toFixed(2) + '"/>');
    svg.push('<text class="target-label" x="' + (pad.left + 8) + '" y="' + (y(current.targetPoints) - 6).toFixed(2) + '">' + (equalTargets ? "共同目标" : "当前目标") + ' ' + format(current.targetPoints) + ' 点</text>');
    if (!equalTargets) {
      svg.push('<line class="target-line baseline-target" x1="' + pad.left + '" y1="' + y(baseline.targetPoints).toFixed(2) + '" x2="' + (width - pad.right) + '" y2="' + y(baseline.targetPoints).toFixed(2) + '"/>');
      var targetGap = Math.abs(y(current.targetPoints) - y(baseline.targetPoints));
      var baselineLabelY = targetGap < 25 ? y(baseline.targetPoints) + 16 : y(baseline.targetPoints) - 6;
      svg.push('<text class="target-label baseline-label" x="' + (width - pad.right - 6) + '" y="' + baselineLabelY.toFixed(2) + '" text-anchor="end">基准目标 ' + format(baseline.targetPoints) + ' 点</text>');
    }
    svg.push('<polyline class="baseline-curve" points="' + line(baseline.rows) + '"/>');
    svg.push('<polyline class="current-curve" points="' + line(current.rows) + '"/>');
    if (baseline.reached) svg.push('<circle class="baseline-dot" cx="' + x(baseline.targetDay).toFixed(2) + '" cy="' + y(baseline.rows[baseline.targetDay].points).toFixed(2) + '" r="4.5"/>');
    if (current.reached) svg.push('<circle class="current-dot" cx="' + x(current.targetDay).toFixed(2) + '" cy="' + y(current.rows[current.targetDay].points).toFixed(2) + '" r="4.5"/>');
    svg.push('</svg>');
    return svg.join("");
  }

  function mount(doc) {
    var form = doc.getElementById("growth-controls");
    if (!form || form.dataset.mounted === "true") return;
    form.dataset.mounted = "true";
    var lastParameters = null;
    var results = doc.getElementById("growth-results-body");
    var status = doc.getElementById("growth-validation");
    var exportButton = doc.getElementById("growth-export");
    var presetLabel = doc.getElementById("growth-preset-label");
    var numberKeys = Object.keys(FIELDS);
    function text(id, value) { doc.getElementById(id).textContent = value; }
    function read() {
      var values = {};
      numberKeys.forEach(function (key) { values[key] = form.elements.namedItem(key).value; });
      return values;
    }
    function describeDifference(current, baseline) {
      if (!current.reached && !baseline.reached) return "两方案均未在观察窗口内达到目标。";
      if (!current.reached) return "基准于第 " + baseline.targetDay + " 天达标；当前方案尚未达标。";
      if (!baseline.reached) return "当前方案已达标；基准尚未达标。";
      var difference = current.targetDay - baseline.targetDay;
      if (difference === 0) return "与基准在同一天达到目标。";
      return "较基准" + (difference < 0 ? "提前 " : "延后 ") + Math.abs(difference) + " 天。";
    }
    function sensitivityCell(variant, row, horizon) {
      var value = format(variant.value, 2) + " " + row.unit;
      if (!variant.valid) return '<td><strong>' + value + '</strong><span class="sensitivity-note">超出可调范围，未计算</span></td>';
      var reach = dayText(variant, horizon);
      var delta = variant.dayDifference === null ? "" : "（" + signed(variant.dayDifference) + " 天）";
      var note = variant.unchanged ? "原值为 0，扰动后不变" : "末日成长 " + signed(variant.pointsChangePercent, 1) + "%";
      return '<td><strong>' + value + '</strong><span>' + reach + delta + '</span><span class="sensitivity-note">' + note + '</span></td>';
    }
    function render() {
      var checked = validate(read());
      numberKeys.forEach(function (key) {
        var input = form.elements.namedItem(key);
        input.setAttribute("aria-invalid", checked.errors[key] ? "true" : "false");
        text("growth-error-" + key, checked.errors[key] || "");
      });
      results.hidden = !checked.valid;
      exportButton.disabled = !checked.valid;
      status.hidden = checked.valid;
      if (!checked.valid) {
        status.textContent = "请修正标出的参数后继续计算；此时不显示旧结果。";
        doc.getElementById("growth-sensitivity").innerHTML = '<tr><td colspan="3">请先修正标出的参数，敏感性分析将自动更新。</td></tr>';
        text("growth-live-summary", "参数无效，请修正标出的输入。");
        lastParameters = null;
        return;
      }
      lastParameters = checked.parameters;
      var current = simulate(lastParameters);
      var baseline = simulate(baselineFor(lastParameters));
      var p = current.parameters;
      text("growth-target-day", current.reached ? current.targetDay + " 天" : "未达标");
      text("growth-target-detail", current.reached ? "第 " + current.targetDay + " 天日末达到 " + p.targetLevel + " 级" : p.horizon + " 天内到达 " + current.finalLevel + " 级，目标为 " + p.targetLevel + " 级");
      text("growth-day-comparison", describeDifference(current, baseline));
      text("growth-points", format(current.finalPoints) + " 点");
      text("growth-points-detail", "第 " + p.horizon + " 天累计 · 基准 " + format(baseline.finalPoints) + " 点");
      text("growth-stock", format(current.finalStock) + " 份");
      text("growth-stock-detail", "观察期末原料库存 · 基准 " + format(baseline.finalStock) + " 份");
      text("growth-utilization", format(current.processingUtilization * 100, 1) + "%");
      text("growth-utilization-detail", "累计加工量 / 加工容量 · 基准 " + format(baseline.processingUtilization * 100, 1) + "%");
      text("growth-chart-caption", "观察窗口 " + p.horizon + " 天 · 目标 " + p.targetLevel + " 级 · 升级于当日日末结算，产能加成次日生效。");
      doc.getElementById("growth-chart").innerHTML = createChart(current, baseline);
      var dailyGather = p.dailyMinutes * p.gatherPercent / 100 * RATES.gather;
      var dailyCapacity = p.dailyMinutes * (1 - p.gatherPercent / 100) * RATES.process;
      var bottleneck = Math.abs(dailyGather - dailyCapacity) < EPSILON ? "采集与加工刚好平衡" : dailyGather < dailyCapacity ? "采集供给限制了加工产出" : "加工容量限制了产出，未加工原料会积累";
      var judgment = "起始日产出 " + format(Math.min(dailyGather, dailyCapacity), 1) + " 点；" + bottleneck + "。";
      judgment += "当前目标需要 " + format(current.targetPoints, 1) + " 点，基准需要 " + format(baseline.targetPoints, 1) + " 点。";
      text("growth-insight", judgment);
      var comparisonRows = [
        ["目标等级 / 需求", p.targetLevel + " 级 / " + format(current.targetPoints, 1) + " 点", p.targetLevel + " 级 / " + format(baseline.targetPoints, 1) + " 点"],
        ["到达目标", dayText(current, p.horizon), dayText(baseline, p.horizon)],
        ["第 30 天累计", format(current.rows[30].points) + " 点", format(baseline.rows[30].points) + " 点"],
        ["观察期末等级", current.finalLevel + " 级", baseline.finalLevel + " 级"],
        ["目标完成度", format(current.targetProgress * 100, 1) + "%", format(baseline.targetProgress * 100, 1) + "%"]
      ];
      doc.getElementById("growth-comparison").innerHTML = comparisonRows.map(function (row) {
        return "<tr><th scope=\"row\">" + row[0] + "</th><td>" + row[1] + "</td><td>" + row[2] + "</td></tr>";
      }).join("");
      doc.getElementById("growth-sensitivity").innerHTML = sensitivity(p).map(function (row) {
        return '<tr><th scope="row">' + row.label + '</th>' + sensitivityCell(row.lower, row, p.horizon) + sensitivityCell(row.upper, row, p.horizon) + '</tr>';
      }).join("");
      text("growth-live-summary", "已更新。当前方案" + dayText(current, p.horizon) + "；" + describeDifference(current, baseline));
    }
    function applyPreset(name) {
      var preset = PRESETS[name];
      numberKeys.forEach(function (key) { form.elements.namedItem(key).value = preset[key]; });
      var labels = { baseline: "基准起点", short: "紧凑日程", gentle: "缓坡成长" };
      presetLabel.textContent = "已载入：" + labels[name];
      form.querySelectorAll("[data-growth-preset]").forEach(function (button) {
        button.setAttribute("aria-pressed", button.dataset.growthPreset === name ? "true" : "false");
      });
      text("growth-export-status", "");
      render();
    }
    form.addEventListener("input", function () {
      presetLabel.textContent = "正在查看：自定义参数";
      form.querySelectorAll("[data-growth-preset]").forEach(function (button) { button.setAttribute("aria-pressed", "false"); });
      text("growth-export-status", "");
      render();
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); render(); });
    form.querySelectorAll("[data-growth-preset]").forEach(function (button) {
      button.addEventListener("click", function () { applyPreset(button.dataset.growthPreset); });
    });
    exportButton.addEventListener("click", function () {
      if (!lastParameters) return;
      var blob = new Blob([JSON.stringify(exportData(lastParameters), null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = "mist-isle-synthetic-parameters.json";
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      text("growth-export-status", "已生成演示参数 JSON，含 synthetic: true 标记。");
    });
    applyPreset("baseline");
  }

  return Object.freeze({
    DEFAULTS: DEFAULTS, FIELDS: FIELDS, PRESETS: PRESETS, MAX_LEVEL: MAX_LEVEL, RATES: RATES,
    validate: validate, simulate: simulate, baselineFor: baselineFor,
    sensitivity: sensitivity, exportData: exportData, createChart: createChart, mount: mount
  });
}));
