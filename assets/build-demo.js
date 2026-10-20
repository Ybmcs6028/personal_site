(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BuildDemo = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { api.mount(document); });
    else api.mount(document);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WEAPONS = {
    burst: { name: '连发弩', power: 26, shots: 3, period: 1, accuracy: 0.86, detail: '每回合 3 次攻击；每次 26 点；基础命中 86%。' },
    heavy: { name: '重型弩', power: 128, shots: 1, period: 2, accuracy: 0.90, detail: '奇数回合 1 次攻击；每次 128 点；基础命中 90%；偶数回合装填。' },
    precise: { name: '定准弩', power: 62, shots: 1, period: 1, accuracy: 1.00, detail: '每回合 1 次攻击；每次 62 点；基础命中 100%。' }
  };
  var MODULES = {
    scope: { name: '校准镜', damage: 0, penetration: 0, accuracy: 0.12, detail: '命中率 +12 个百分点；总命中率上限 100%。' },
    pierce: { name: '破甲槽', damage: 0, penetration: 14, accuracy: 0, detail: '每次攻击忽略 14 点护甲；剩余护甲最低为 0。' },
    boost: { name: '增压芯', damage: 7, penetration: 0, accuracy: 0, detail: '每次原始伤害 +7 点，再参与战术倍率。' }
  };
  var TACTICS = {
    rush: { name: '抢攻', detail: '第 1、2 回合原始伤害 ×1.40，之后 ×1.00；装填不暂停计时。' },
    steady: { name: '稳进', detail: '每回合原始伤害 ×1.12。' },
    ramp: { name: '蓄势', detail: '第 1 回合 ×1.00，此后每回合倍率 +0.04；装填不暂停计时。' }
  };
  var WEATHER = {
    clear: { name: '晴朗', penalty: 0 },
    mist: { name: '薄雾', penalty: 0.10 },
    gust: { name: '横风', penalty: 0.20 }
  };
  var DEFAULTS = {
    scenario: { targetHp: 500, armor: 14, rounds: 8, weather: 'mist' },
    build: { weapon: 'burst', module: 'pierce', tactic: 'steady' },
    baseline: { weapon: 'heavy', module: 'scope', tactic: 'steady' },
    objective: 'defeat'
  };

  function deepFreeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object') deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }
  [WEAPONS, MODULES, TACTICS, WEATHER, DEFAULTS].forEach(deepFreeze);
  function owns(object, key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  // Twelve rounds of decimal arithmetic can accumulate a few binary rounding errors.
  // Compare at machine precision, not at the two-decimal display precision.
  function compareNumbers(a, b) {
    var difference = a - b;
    var tolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(difference) <= tolerance ? 0 : difference;
  }
  function positiveDifference(a, b) { return compareNumbers(a, b) > 0 ? a - b : 0; }
  function copyBuild(build) { return { weapon: build.weapon, module: build.module, tactic: build.tactic }; }
  function buildId(build) { return build.weapon + '/' + build.module + '/' + build.tactic; }
  function buildName(build) { return WEAPONS[build.weapon].name + ' · ' + MODULES[build.module].name + ' · ' + TACTICS[build.tactic].name; }
  function parseNumber(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && value.trim() === '') return NaN;
    return Number(value);
  }
  function validateScenario(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var value = { targetHp: parseNumber(raw.targetHp), armor: parseNumber(raw.armor), rounds: parseNumber(raw.rounds), weather: raw.weather };
    var errors = [];
    if (!Number.isFinite(value.targetHp) || value.targetHp < 1 || value.targetHp > 5000) errors.push({ field: 'targetHp', message: '目标生命须为 1–5000 点。' });
    if (!Number.isFinite(value.armor) || value.armor < 0 || value.armor > 45) errors.push({ field: 'armor', message: '单次护甲须为 0–45 点。' });
    if (!Number.isInteger(value.rounds) || value.rounds < 1 || value.rounds > 12) errors.push({ field: 'rounds', message: '观察窗口须为 1–12 个整数回合。' });
    if (!owns(WEATHER, value.weather)) errors.push({ field: 'weather', message: '请选择有效环境。' });
    return { ok: errors.length === 0, errors: errors, value: errors.length ? null : value };
  }
  function validateBuild(build) {
    var errors = [];
    if (!build || !owns(WEAPONS, build.weapon)) errors.push({ field: 'weapon', message: '请选择有效武器。' });
    if (!build || !owns(MODULES, build.module)) errors.push({ field: 'module', message: '请选择有效模组。' });
    if (!build || !owns(TACTICS, build.tactic)) errors.push({ field: 'tactic', message: '请选择有效战术。' });
    return { ok: errors.length === 0, errors: errors };
  }
  function multiplier(tactic, round) {
    if (tactic === 'rush') return round <= 2 ? 1.4 : 1;
    if (tactic === 'steady') return 1.12;
    return 1 + 0.04 * (round - 1);
  }
  function simulate(build, rawScenario) {
    var scenarioCheck = validateScenario(rawScenario);
    var buildCheck = validateBuild(build);
    if (!scenarioCheck.ok || !buildCheck.ok) return { ok: false, errors: scenarioCheck.errors.concat(buildCheck.errors), timeline: [], defeated: false, killRound: null };
    var scenario = scenarioCheck.value;
    var weapon = WEAPONS[build.weapon];
    var mod = MODULES[build.module];
    var rawAccuracy = weapon.accuracy - WEATHER[scenario.weather].penalty + mod.accuracy;
    var accuracy = clamp(rawAccuracy, 0, 1);
    var effectiveArmor = Math.max(0, scenario.armor - mod.penetration);
    var total = 0;
    var killRound = null;
    var crossingDamage = null;
    var timeline = [];
    for (var round = 1; round <= scenario.rounds; round += 1) {
      var active = (round - 1) % weapon.period === 0;
      var factor = multiplier(build.tactic, round);
      var rawHitDamage = (weapon.power + mod.damage) * factor;
      var hitDamage = Math.max(1, rawHitDamage - effectiveArmor);
      var damage = active ? hitDamage * weapon.shots * accuracy : 0;
      total += damage;
      var crossed = killRound === null && compareNumbers(total, scenario.targetHp) >= 0;
      if (crossed) {
        killRound = round;
        crossingDamage = total;
      }
      timeline.push({
        round: round, active: active, shots: active ? weapon.shots : 0, multiplier: factor,
        rawHitDamage: rawHitDamage, hitDamage: hitDamage, damage: damage, cumulative: total,
        remainingHp: positiveDifference(scenario.targetHp, total), firstCrossing: crossed
      });
    }
    return {
      ok: true, synthetic: true, build: copyBuild(build), id: buildId(build), name: buildName(build),
      scenario: scenario, accuracy: accuracy, accuracyOverflow: Math.max(0, rawAccuracy - 1),
      effectiveArmor: effectiveArmor, timeline: timeline, totalDamage: total,
      defeated: killRound !== null, killRound: killRound, crossingDamage: crossingDamage,
      overkill: crossingDamage === null ? null : positiveDifference(crossingDamage, scenario.targetHp),
      remainingHp: positiveDifference(scenario.targetHp, total)
    };
  }
  function enumerateBuilds() {
    var builds = [];
    Object.keys(WEAPONS).forEach(function (weapon) {
      Object.keys(MODULES).forEach(function (mod) {
        Object.keys(TACTICS).forEach(function (tactic) { builds.push({ weapon: weapon, module: mod, tactic: tactic }); });
      });
    });
    return builds;
  }
  function scoreCompare(a, b, objective) {
    if (objective === 'damage') return compareNumbers(b.totalDamage, a.totalDamage);
    if (a.defeated !== b.defeated) return a.defeated ? -1 : 1;
    if (a.defeated) {
      if (a.killRound !== b.killRound) return a.killRound - b.killRound;
      return compareNumbers(a.overkill, b.overkill);
    }
    return compareNumbers(b.totalDamage, a.totalDamage);
  }
  function rankBuilds(scenario, objective) {
    var checked = validateScenario(scenario);
    if (!checked.ok) return { ok: false, errors: checked.errors, results: [] };
    if (objective !== 'defeat' && objective !== 'damage') return { ok: false, errors: [{ field: 'objective', message: '请选择有效排名目标。' }], results: [] };
    var results = enumerateBuilds().map(function (build) { return simulate(build, checked.value); });
    results.sort(function (a, b) { return scoreCompare(a, b, objective) || a.id.localeCompare(b.id); });
    results.forEach(function (result, index) {
      result.rank = index > 0 && scoreCompare(results[index - 1], result, objective) === 0 ? results[index - 1].rank : index + 1;
    });
    return { ok: true, objective: objective, results: results };
  }
  function compare(buildA, buildB, scenario) {
    var a = simulate(buildA, scenario);
    var b = simulate(buildB, scenario);
    if (!a.ok || !b.ok) return { ok: false, errors: (a.errors || []).concat(b.errors || []) };
    return { ok: true, a: a, b: b, damageDifference: compareNumbers(a.totalDamage, b.totalDamage), killRoundDifference: a.defeated && b.defeated ? a.killRound - b.killRound : null };
  }
  function createExport(buildA, buildB, rawScenario, objective) {
    var checked = validateScenario(rawScenario);
    var aCheck = validateBuild(buildA);
    var bCheck = validateBuild(buildB);
    if (!checked.ok || !aCheck.ok || !bCheck.ok || (objective !== 'defeat' && objective !== 'damage')) return { ok: false, errors: checked.errors.concat(aCheck.errors, bCheck.errors, objective !== 'defeat' && objective !== 'damage' ? [{ field: 'objective', message: '请选择有效排名目标。' }] : []) };
    return {
      ok: true,
      data: {
        schema: 'original-build-demo/v1', synthetic: true,
        disclaimer: '原创虚构案例；场景、规则与参数均为演示设计，不对应实际项目。',
        scenario: checked.value, buildA: copyBuild(buildA), buildB: copyBuild(buildB), objective: objective
      }
    };
  }
  function num(value) { return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(value) { return (value * 100).toFixed(0) + '%'; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]; }); }
  function chartSvg(a, b) {
    var width = 700, height = 345, left = 66, right = 22, top = 36, bottom = 48;
    var plotW = width - left - right, plotH = height - top - bottom;
    var cap = Math.max(a.totalDamage, b.totalDamage, a.scenario.targetHp);
    var scale = Math.pow(10, Math.floor(Math.log10(cap)));
    var max = Math.ceil((cap * 1.08) / (scale / 2)) * (scale / 2);
    var x = function (round) { return left + plotW * round / a.scenario.rounds; };
    var y = function (value) { return top + plotH * (1 - value / max); };
    var chart = ['<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="build-chart-title build-chart-desc" xmlns="http://www.w3.org/2000/svg"><title id="build-chart-title">A/B 累计期望伤害对比</title><desc id="build-chart-desc">横轴为回合，纵轴为累计期望伤害点数。A 窗口伤害 ' + num(a.totalDamage) + ' 点，B 为 ' + num(b.totalDamage) + ' 点。目标生命 ' + num(a.scenario.targetHp) + ' 点。详细数据见逐回合表。</desc>'];
    chart.push('<text x="' + left + '" y="17" fill="#65716c" font-size="12">累计期望伤害 / 点</text>');
    for (var i = 0; i <= 4; i += 1) {
      var value = max * i / 4, gy = y(value);
      chart.push('<line x1="' + left + '" y1="' + gy + '" x2="' + (width - right) + '" y2="' + gy + '" stroke="#dce0d9" stroke-width="1"/><text x="' + (left - 11) + '" y="' + (gy + 4) + '" text-anchor="end" fill="#65716c" font-size="11">' + Math.round(value).toLocaleString('zh-CN') + '</text>');
    }
    for (var round = 0; round <= a.scenario.rounds; round += 1) chart.push('<text x="' + x(round) + '" y="' + (height - 24) + '" text-anchor="middle" fill="#65716c" font-size="11">' + round + '</text>');
    chart.push('<text x="' + (width - right) + '" y="' + (height - 5) + '" text-anchor="end" fill="#65716c" font-size="11">回合</text>');
    var targetY = y(a.scenario.targetHp);
    chart.push('<line x1="' + left + '" y1="' + targetY + '" x2="' + (width - right) + '" y2="' + targetY + '" stroke="#77807b" stroke-dasharray="5 5"/><text x="' + (left + 5) + '" y="' + (targetY - 7) + '" fill="#65716c" font-size="11">目标 ' + num(a.scenario.targetHp) + ' 点</text>');
    [[b, '#b76e37', 'B'], [a, '#225e53', 'A']].forEach(function (entry) {
      var data = entry[0], color = entry[1], label = entry[2];
      var points = [x(0) + ',' + y(0)].concat(data.timeline.map(function (item) { return x(item.round) + ',' + y(item.cumulative); })).join(' ');
      chart.push('<polyline fill="none" stroke="' + color + '" stroke-width="2.8" stroke-linejoin="round" points="' + points + '"/>');
      data.timeline.forEach(function (item) { chart.push('<circle cx="' + x(item.round) + '" cy="' + y(item.cumulative) + '" r="' + (item.firstCrossing ? 5 : 2.5) + '" fill="' + color + '"><title>' + label + ' 第 ' + item.round + ' 回合：累计 ' + num(item.cumulative) + ' 点' + (item.firstCrossing ? '，首次达到目标生命' : '') + '</title></circle>'); });
    });
    chart.push('</svg>');
    return chart.join('');
  }
  function explanation(result, best, objective) {
    var build = result.build;
    var lines = [];
    if (build.weapon === 'burst') lines.push('连发弩每回合结算 3 次。当前每次承受 ' + num(result.effectiveArmor) + ' 点有效护甲，多段加值与多次减免都会被放大。');
    if (build.weapon === 'heavy') lines.push('重型弩本窗口开火 ' + result.timeline.filter(function (row) { return row.active; }).length + ' 次。延长窗口时，新增偶数回合只会装填、不增加伤害；新增奇数回合会开火。');
    if (build.weapon === 'precise') lines.push('定准弩每回合结算 1 次，基础命中为 100%。环境惩罚与命中上限决定校准镜能否完全发挥。');
    if (build.module === 'scope') lines.push('校准镜使有效命中达到 ' + pct(result.accuracy) + (result.accuracyOverflow > 0 ? '，其中 ' + (result.accuracyOverflow * 100).toFixed(0) + ' 个百分点超过上限、不会产生额外收益。' : '，其收益取决于原始伤害与当前命中缺口。'));
    if (build.module === 'pierce') lines.push('破甲槽实际移除了 ' + num(Math.min(result.scenario.armor, 14)) + ' 点单次护甲；穿透超过目标护甲的部分不转化为额外伤害。');
    if (build.module === 'boost') lines.push('增压芯给每次攻击增加 7 点原始伤害，并参与战术倍率；多段攻击可多次获得加值。');
    if (build.tactic === 'rush') lines.push('抢攻只覆盖第 1、2 个自然回合。适合尽早越过生命阈值；重型弩的第 2 回合装填仍会消耗增益时间。');
    if (build.tactic === 'steady') lines.push('稳进提供固定 12% 原始伤害加成。它无需等待启动，也不会因前期效果到期而回落。');
    if (build.tactic === 'ramp') lines.push('蓄势在第 ' + result.scenario.rounds + ' 回合达到 ' + multiplier('ramp', result.scenario.rounds).toFixed(2) + ' 倍；这是较长窗口下的优势，前期仍需承受启动成本。');
    var bestNote = objective === 'damage' ? '按窗口伤害排序，' : '按当前击败优先规则排序，';
    bestNote += best.name + ' 位于第 1 名' + (best.defeated ? '，预计第 ' + best.killRound + ' 回合越过生命阈值。' : '；它仍未击败，窗口结束剩余 ' + num(best.remainingHp) + ' 点生命。');
    return '<p class="small-label">为什么会得到这个结果</p>' + lines.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('') + '<p><strong>当前情景结论：</strong>' + escapeHtml(bestNote) + ' 改变生命、护甲或观察窗口，排序会重新计算。</p>';
  }
  function mount(doc) {
    var form = doc.getElementById('build-form');
    if (!form || form.dataset.mounted === 'true') return;
    form.dataset.mounted = 'true';
    var el = function (id) { return doc.getElementById(id); };
    var builds = enumerateBuilds();
    var buildMap = {};
    builds.forEach(function (build) { buildMap[buildId(build)] = build; });
    el('baseline').innerHTML = builds.map(function (build) { return '<option value="' + buildId(build) + '">' + buildName(build) + '</option>'; }).join('');
    el('baseline').value = buildId(DEFAULTS.baseline);
    var current = null;
    function readBuild() { return { weapon: el('weapon').value, module: el('module').value, tactic: el('tactic').value }; }
    function readScenario() { return { targetHp: el('target-hp').value, armor: el('armor').value, rounds: el('rounds').value, weather: el('weather').value }; }
    function setBuild(build) {
      el('weapon').value = build.weapon;
      el('module').value = build.module;
      el('tactic').value = build.tactic;
    }
    function invalidate(errors) {
      current = null;
      el('input-status').dataset.kind = 'error';
      el('input-status').textContent = errors.map(function (error) { return error.message; }).join(' ');
      el('result-summary').textContent = '输入需要修正，结果已暂停。';
      ['metric-damage', 'metric-kill', 'metric-accuracy', 'metric-rank'].forEach(function (id) { el(id).textContent = '—'; });
      el('build-chart').innerHTML = '<p class="muted">修正输入后将显示对比曲线。</p>';
      el('build-explanation').innerHTML = '';
      el('ranking-body').innerHTML = '<tr><td colspan="6">输入无效，暂无排名。</td></tr>';
      el('round-body').innerHTML = '<tr><td colspan="7">输入无效，暂无结算过程。</td></tr>';
      el('scenario-label').textContent = '等待有效输入';
      el('export-build').disabled = true;
      errors.forEach(function (error) {
        var field = error.field === 'targetHp' ? el('target-hp') : el(error.field);
        if (field) field.setAttribute('aria-invalid', 'true');
      });
    }
    function render() {
      ['target-hp', 'armor', 'rounds', 'weather', 'weapon', 'module', 'tactic'].forEach(function (id) { el(id).removeAttribute('aria-invalid'); });
      var scenario = validateScenario(readScenario());
      var build = readBuild();
      var buildCheck = validateBuild(build);
      if (!scenario.ok || !buildCheck.ok) return invalidate(scenario.errors.concat(buildCheck.errors));
      var baseline = buildMap[el('baseline').value];
      if (!baseline) return invalidate([{ field: 'baseline', message: '请选择有效对照构筑。' }]);
      var objective = el('objective').value;
      var ranking = rankBuilds(scenario.value, objective);
      if (!ranking.ok) return invalidate(ranking.errors);
      var pair = compare(build, baseline, scenario.value);
      var a = pair.a, b = pair.b;
      var rank = ranking.results.find(function (result) { return result.id === a.id; }).rank;
      current = { build: build, baseline: baseline, scenario: scenario.value, objective: objective };
      el('input-status').dataset.kind = 'ok';
      el('input-status').textContent = '参数有效 · A/B 已按同一环境重算';
      el('export-build').disabled = false;
      el('weapon-detail').textContent = WEAPONS[build.weapon].detail;
      el('module-detail').textContent = MODULES[build.module].detail;
      el('tactic-detail').textContent = TACTICS[build.tactic].detail;
      el('scenario-label').textContent = scenario.value.rounds + ' 回合 · ' + WEATHER[scenario.value.weather].name + ' · ' + num(scenario.value.armor) + ' 点护甲';
      el('metric-damage').innerHTML = num(a.totalDamage) + '<em>点</em>';
      el('metric-kill').innerHTML = a.defeated ? a.killRound + '<em>回合</em>' : '未击败';
      el('metric-accuracy').textContent = pct(a.accuracy);
      el('metric-rank').innerHTML = rank + '<em>/ 27</em>';
      var delta = pair.damageDifference;
      var diff = delta === 0 ? '与 B 的窗口伤害相同' : '比 B ' + (delta > 0 ? '多' : '少') + ' ' + num(Math.abs(delta)) + ' 点窗口期望伤害';
      el('result-summary').textContent = 'A：' + a.name + '。' + diff + '；' + (a.defeated ? '预计第 ' + a.killRound + ' 回合达到目标生命。' : '本窗口未击败，剩余 ' + num(a.remainingHp) + ' 点生命。');
      el('build-chart').innerHTML = chartSvg(a, b);
      el('build-explanation').innerHTML = explanation(a, ranking.results[0], objective);
      el('ranking-method').textContent = objective === 'damage' ? '按整个窗口的累计期望伤害从高到低排序，击败后仍按练习靶继续结算。' : '先比预计击败回合；同回合优先越界溢出更少；未击败方案按窗口伤害排序。';
      el('ranking-body').innerHTML = ranking.results.map(function (result) {
        var selected = result.id === a.id;
        return '<tr' + (selected ? ' class="is-current"' : '') + '><td class="num">' + result.rank + '</td><td>' + result.name + (selected ? '<span class="tag-mini">A</span>' : '') + (result.id === b.id ? '<span class="tag-mini">B</span>' : '') + '</td><td class="num">' + num(result.totalDamage) + '</td><td class="num">' + (result.defeated ? result.killRound : '未击败') + '</td><td class="num">' + (result.defeated ? '溢出 ' + num(result.overkill) : '剩余 ' + num(result.remainingHp)) + '</td><td><button type="button" class="table-action" data-build="' + result.id + '"' + (selected ? ' disabled' : '') + ' aria-label="载入 A：' + result.name + '">' + (selected ? '当前 A' : '载入 A') + '</button></td></tr>';
      }).join('');
      el('round-body').innerHTML = a.timeline.map(function (row, index) {
        var other = b.timeline[index];
        function state(item) { return item.active ? item.shots + ' 次 · ×' + item.multiplier.toFixed(2) + (item.firstCrossing ? ' · 首达阈值' : '') : '装填'; }
        return '<tr><td>' + row.round + '</td><td>' + state(row) + '</td><td class="num">' + num(row.damage) + '</td><td class="num">' + num(row.cumulative) + '</td><td>' + state(other) + '</td><td class="num">' + num(other.damage) + '</td><td class="num">' + num(other.cumulative) + '</td></tr>';
      }).join('');
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    form.addEventListener('input', render);
    form.addEventListener('change', render);
    el('objective').addEventListener('change', render);
    el('ranking-body').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-build]');
      if (!button || !buildMap[button.dataset.build]) return;
      setBuild(buildMap[button.dataset.build]);
      render();
      el('result-summary').scrollIntoView({ behavior: 'auto', block: 'nearest' });
    });
    el('pin-baseline').addEventListener('click', function () {
      var build = readBuild();
      if (!validateBuild(build).ok) return;
      el('baseline').value = buildId(build);
      render();
    });
    el('reset-build').addEventListener('click', function () {
      el('target-hp').value = DEFAULTS.scenario.targetHp;
      el('armor').value = DEFAULTS.scenario.armor;
      el('rounds').value = DEFAULTS.scenario.rounds;
      el('weather').value = DEFAULTS.scenario.weather;
      el('objective').value = DEFAULTS.objective;
      el('baseline').value = buildId(DEFAULTS.baseline);
      setBuild(DEFAULTS.build);
      render();
    });
    el('export-build').addEventListener('click', function () {
      if (!current) return;
      var exported = createExport(current.build, current.baseline, current.scenario, current.objective);
      if (!exported.ok) return;
      var blob = new Blob([JSON.stringify(exported.data, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = doc.createElement('a');
      link.href = url;
      link.download = 'original-build-demo.synthetic.json';
      doc.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      el('input-status').textContent = '已导出原创虚构案例参数（synthetic: true）。';
    });
    render();
  }
  return {
    WEAPONS: WEAPONS, MODULES: MODULES, TACTICS: TACTICS, WEATHER: WEATHER, DEFAULTS: DEFAULTS,
    validateScenario: validateScenario, validateBuild: validateBuild, buildId: buildId, buildName: buildName,
    enumerateBuilds: enumerateBuilds, simulate: simulate, rankBuilds: rankBuilds, compare: compare,
    createExport: createExport, mount: mount
  };
}));
