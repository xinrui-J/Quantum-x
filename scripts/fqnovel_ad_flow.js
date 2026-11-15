/**
 * 番茄小说 阅读流广告清除 + 结构探针
 * ===========================================================================
 * 两个作用：
 *
 * 【1】清广告（只改值，不动结构）
 *   read_flow_ad_type : 非 0  → 0     段落级插页
 *   insert_ad         : true  → false
 *   is_force_watch    : true  → false 强制观看（全屏读秒）
 *   force_watch_time  : N     → 0     读秒时长
 *   patch_min_watch_time : N  → 0     补丁广告最小观看时长
 *
 *   一个字段都不删，JSON 结构、字段顺序、int64 精度全部原样保留。
 *
 * 【2】探针：把这一页里所有「名字含 ad」的字段打到 QX 日志
 *   如果广告还在，把 QX → 更多 → 日志里 [probe] 开头的行发出来，
 *   就能精确知道那块广告挂在哪个字段上，不用再猜。
 *   只在检测到广告特征时才打，不会刷屏。
 */

// ── 广告标记字段：值改成「非广告」──────────────────────────────────────────
const ZERO_FIELDS = [
  'read_flow_ad_type',   // 段落级插页（下划线形态）
  'readFlowAdType',      // 同上，驼峰形态（二进制里两种都在）
  'force_watch_time',    // 强制观看时长
  'patch_min_watch_time' // 补丁广告最小观看时长
];
const FALSE_FIELDS = [
  'insert_ad',
  'insertAd',
  'is_force_watch',
  'isForceWatch',
  'is_insert_ad'
];

const PROBE_TRIGGER = /read_flow_ad_type"\s*:\s*[1-9]|readFlowAdType"\s*:\s*[1-9]|insert_ad"\s*:\s*(?:true|1)|is_force_watch"\s*:\s*(?:true|1)|force_watch_time"\s*:\s*[1-9]|patch_min_watch_time"\s*:\s*[1-9]|interstitial_ad_info|video_patch_ad_config|patch_ad_scene|audio_patch_ad|gold_coin_patch_ad|top_view_reader_ad|feed_ad|novel_ad/;

try {
  const body = $response.body;

  if (!body || body.length < 2) {
    $done({});
  } else if (!PROBE_TRIGGER.test(body)) {
    // 没有广告特征，零开销放行
    $done({});
  } else {
    let out = body;
    let n = 0;

    // 数值型：非 0 改 0
    for (let i = 0; i < ZERO_FIELDS.length; i++) {
      const f = ZERO_FIELDS[i];
      const re = new RegExp('("' + f + '"\\s*:\\s*)([1-9]\\d*)', 'g');
      out = out.replace(re, function (m, p) { n++; return p + '0'; });
    }

    // 布尔型：true/1 改 false
    for (let i = 0; i < FALSE_FIELDS.length; i++) {
      const f = FALSE_FIELDS[i];
      const re = new RegExp('("' + f + '"\\s*:\\s*)(true|1)(?=\\s*[,}\\]])', 'g');
      out = out.replace(re, function (m, p) { n++; return p + 'false'; });
    }

    // ── 探针：把含 ad 的字段名与关键片段打出来 ──────────────────────────
    try {
      const keys = body.match(/"[a-z0-9_]*(?:ad|Ad)[a-z0-9_]*"\s*:/g) || [];
      const uniq = [];
      for (let i = 0; i < keys.length && uniq.length < 40; i++) {
        const k = keys[i].replace(/\s*:$/, '');
        if (uniq.indexOf(k) < 0) uniq.push(k);
      }
      if (uniq.length) {
        console.log('[probe] len=' + body.length + ' changed=' + n);
        console.log('[probe] keys=' + uniq.join(' , '));
        // 找最像全屏广告的片段，截一小段
        const m = body.match(/"(?:interstitial_ad_info|video_patch_ad_config|patch_ad_scene|audio_patch_ad|gold_coin_patch_ad)"[^,}]{0,160}/);
        if (m) console.log('[probe] hit=' + m[0].slice(0, 220));
      }
    } catch (e) {}

    if (n > 0) {
      $done({ body: out });
    } else {
      $done({});
    }
  }
} catch (e) {
  $done({});
}
