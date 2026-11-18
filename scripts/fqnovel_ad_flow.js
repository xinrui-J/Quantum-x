/**
 * 番茄小说 阅读流广告清除 + 自检通知
 * ===========================================================================
 * 版本说明：
 *   上一版用 console.log 打探针，用户日志里看不到 —— 可能脚本没执行，
 *   也可能 QX 没开脚本日志。这一版改用 $notify 直接弹通知，绕开日志。
 *
 * 通知策略：最多弹 5 次，避免刷屏。看到通知就说明脚本确实在被调用。
 *
 * 清广告部分（只改值，不动结构）：
 *   read_flow_ad_type / readFlowAdType : 非 0 → 0
 *   insert_ad / insertAd               : true → false
 *   is_force_watch / isForceWatch      : true → false
 *   force_watch_time                   : N    → 0
 *   patch_min_watch_time               : N    → 0
 */

const ZERO_FIELDS = [
  'read_flow_ad_type', 'readFlowAdType',
  'force_watch_time', 'forceWatchTime',
  'patch_min_watch_time'
];
const FALSE_FIELDS = [
  'insert_ad', 'insertAd', 'is_insert_ad',
  'is_force_watch', 'isForceWatch'
];

// 只要响应里出现这些，就认为「值得上报一次结构」
const PROBE_TRIGGER = /read_flow_ad_type"\s*:\s*[1-9]|readFlowAdType"\s*:\s*[1-9]|insert_ad"\s*:\s*(?:true|1)|is_force_watch"\s*:\s*(?:true|1)|force_watch_time"\s*:\s*[1-9]|patch_min_watch_time"\s*:\s*[1-9]|interstitial_ad_info|video_patch_ad_config|patch_ad_scene|audio_patch_ad|gold_coin_patch_ad|top_view_reader_ad|feed_ad|novel_ad|landing_ad|detail_ad|splash_ad|top_view_ad/;

let _changed = 0;
let _bodyLen = 0;

function notifyOnce(title, sub, body) {
  try {
    let n = 0;
    try { n = parseInt($persistentStore.read('fq_probe_n') || '0', 10) || 0; } catch (e) {}
    if (n >= 5) return;
    try { $persistentStore.write(String(n + 1), 'fq_probe_n'); } catch (e) {}
    $notify('番茄探针 ' + (n + 1) + '/5', title, sub + ' | ' + body);
  } catch (e) {}
}

try {
  const body = $response.body;
  _bodyLen = body ? body.length : 0;

  // 无论有没有广告特征，前 5 次都通知一次，用来确认脚本到底跑没跑
  let url = '';
  try { url = $request && $request.url ? $request.url : '(no url)'; } catch (e) { url = '(err)'; }

  if (!body || body.length < 2) {
    notifyOnce('空响应', 'len=' + _bodyLen, url.slice(0, 80));
    $done({});
  } else {
    let out = body;
    let n = 0;

    for (let i = 0; i < ZERO_FIELDS.length; i++) {
      const re = new RegExp('("' + ZERO_FIELDS[i] + '"\\s*:\\s*)([1-9]\\d*)', 'g');
      out = out.replace(re, function (m, p) { n++; return p + '0'; });
    }
    for (let i = 0; i < FALSE_FIELDS.length; i++) {
      const re = new RegExp('("' + FALSE_FIELDS[i] + '"\\s*:\\s*)(true|1)(?=\\s*[,}\\]])', 'g');
      out = out.replace(re, function (m, p) { n++; return p + 'false'; });
    }
    _changed = n;

    // 结构上报：把含 ad 的字段名带出来
    let keyInfo = 'no-ad-field';
    try {
      const keys = body.match(/"[a-zA-Z0-9_]*(?:ad|Ad)[a-zA-Z0-9_]*"\s*:/g) || [];
      const uniq = [];
      for (let i = 0; i < keys.length && uniq.length < 10; i++) {
        const k = keys[i].replace(/\s*:$/, '').replace(/"/g, '');
        if (uniq.indexOf(k) < 0) uniq.push(k);
      }
      if (uniq.length) keyInfo = uniq.join(',');
    } catch (e) {}

    const isAdPage = PROBE_TRIGGER.test(body);
    notifyOnce(
      (isAdPage ? 'AD ' : '-  ') + 'len=' + body.length + ' chg=' + n,
      url.replace(/^https?:\/\//, '').slice(0, 90),
      keyInfo.slice(0, 200)
    );

    if (n > 0) {
      $done({ body: out });
    } else {
      $done({});
    }
  }
} catch (e) {
  try { $notify('番茄探针异常', String(e).slice(0, 60), ''); } catch (e2) {}
  $done({});
}
