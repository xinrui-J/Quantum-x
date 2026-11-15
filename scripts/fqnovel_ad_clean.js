/**
 * 番茄小说 / 红果短剧 广告响应体清洗脚本 (Quantumult X script-response-body)
 * ---------------------------------------------------------------------------
 * 适用：fqnovel_ad_pro.conf 里全部 script-response-body 规则
 *       （chapter_end/resource、reader/full、batch_full、bookmall/cell/change、search/tab）
 * 来源：Reading.app 与 Eggplant.app（均 7.4.3）主二进制中出现的广告字段与方法名
 *       两者同为 com.dragon / com.phoenix 双产品，广告字段出现次数逐个相同
 *   _ad_info / __ad_info / _ad_extra_data / _ad_extra_dict / _ad_id / _ad_type
 *   _native_site_ad_info / _has_ad_info / _is_ad_channel / _comment_ad_type
 *   _read_flow_ad_type / _rit_identity / _report_ad_id / _csj_ad_id / _ios_csj_ad_id
 *
 * ===========================================================================
 * 三个必须防的坑（都已在代码里处理，改脚本时别删）
 * ===========================================================================
 * ① int64 精度：字节接口大量使用 19 位整数 ID（book_id / item_id / uid），
 *    JS 的 Number 只有 53 位精度，JSON.parse → JSON.stringify 往返一次就会
 *    把 7145420391827365123 变成 7145420391827365000，导致书籍 ID 对不上、
 *    正文拉不到、书架错乱。→ 解析前给大整数打标记转字符串，输出前还原。
 *
 * ② 大响应体卡顿：正文接口一次返回几百 KB 到几 MB，递归遍历会让每次翻页
 *    都卡一下。→ 超过 SIZE_LIMIT 直接放行，不碰。
 *
 * ③ 非 JSON 响应：protobuf / 图片 / 纯文本 JSON.parse 会抛异常。
 *    → catch 后 $done({}) 原样放行，绝不清空 body。
 */

// ── 可调参数 ────────────────────────────────────────────────────────────────
const SIZE_LIMIT = 3 * 1024 * 1024; // 超过 3 MB 的响应直接放过
const MAX_DEPTH = 24;               // 递归深度保护
const BIGINT_MARK = '__QX_BIG__';   // 大整数标记前缀（正常数据里不可能出现）

// ── 广告字段 ────────────────────────────────────────────────────────────────
const AD_FLAG_KEYS = [
  'ad_info', '__ad_info', 'native_site_ad_info', 'ad_extra', 'ad_extra_data',
  'ad_extra_dict', 'ad_extra_raw_data', 'ad_creative', 'ad_material'
];

// 字段名命中这些时，说明容器本身装的就是广告数据 → 清成空
const AD_CONTAINER_KEYS = [
  'ad_data', 'ad_list', 'ads', 'splash_ad', 'splash_ad_list', 'splash_data',
  'banner_list', 'banner_ad', 'inspire_ad', 'reward_ad', 'union_ad',
  'recall_ads', 'aggregate_ads', 'ad_slot_list', 'material_list',
  'draw_info', 'ad_draw_info',
  // 章末/阅读页插入广告
  'chapter_end_ad', 'insert_ads', 'insert_ad_list', 'ad_cards', 'native_ad_list'
];

const AD_TYPE_RE = /^(ad|ads|advert|advertisement|splash_ad|splashad|banner_ad|bannerad|inspire_ad|inspiread|reward_ad|rewardad|union_ad|unionad|mix_ad|mixad|ecom_ad|live_ad|game_ad|app_ad)$/i;

// 评论数据保护：这些字段存在且非空时，绝不把该节点当广告删除
const PROTECT_KEYS = [
  'comment_list', 'comments', 'comment_info', 'comment',
  'reply_list', 'replies', 'reply',
  'ugc_comment', 'novel_comment', 'book_comment'
];

// ── 大整数保护 ──────────────────────────────────────────────────────────────
// 只处理「值位置」上的 16 位以上整数：冒号/中括号/逗号之后，逗号/右括号之前
const BIG_INT_SEAL = /([:\[,]\s*)(-?\d{16,})(?=\s*[,\}\]])/g;
const BIG_INT_OPEN = new RegExp('"' + BIGINT_MARK + '(-?\\d{16,})"', 'g');

function sealBigInt(text) {
  return text.replace(BIG_INT_SEAL, function (m, pre, num) {
    return pre + '"' + BIGINT_MARK + num + '"';
  });
}

function unsealBigInt(text) {
  return text.replace(BIG_INT_OPEN, '$1');
}

// ── 判定 ────────────────────────────────────────────────────────────────────
function isAdCell(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;

  // 0) 评论数据保护：带评论内容的节点一律不当作广告删
  //    （chapter_end/resource 里评论卡与广告卡混排，误删会导致评论区空白）
  for (let i = 0; i < PROTECT_KEYS.length; i++) {
    const v = o[PROTECT_KEYS[i]];
    if (v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : v !== '')) return false;
  }

  // 0b) 阅读流插入广告：二进制证据 ad_insert_interval / insert_ad_rit_type /
  //     natural_ad_insert_fix_v703 / ad_insert_failed(adId,chapterId,paraId)
  //     —— 广告是按段落插进正文的，read_flow_ad_type 非 0 即该段是广告
  if (o.read_flow_ad_type !== undefined && o.read_flow_ad_type !== null &&
      o.read_flow_ad_type !== 0 && o.read_flow_ad_type !== '0') return true;
  if (o.insert_ad === true || o.insert_ad === 1 || o.is_insert_ad === true) return true;

  // 1) 布尔 / 数值广告标记（显式声明，最强信号）
  if (o.is_ad === true || o.is_ad === 1 || o.is_ad === '1') return true;
  if (o.isAd === true || o.isAd === 1) return true;
  if (o.has_ad === true || o.has_ad === 1) return true;

  // 2) cell 类型命中广告枚举
  const typeKeys = ['cell_type', 'type', 'cellType', 'data_type', 'item_type', 'card_type'];
  for (let i = 0; i < typeKeys.length; i++) {
    const v = o[typeKeys[i]];
    if (typeof v === 'string' && AD_TYPE_RE.test(v.trim())) return true;
  }

  // 3) 广告主标识 / 落地页 / 广告信息块，三选二才判定为广告 cell
  //    单独一个 ad_info 不算（正常 cell 也可能挂着空壳），避免误删内容
  let signal = 0;
  const hasAdv = o.ad_id !== undefined || o.ad_type !== undefined ||
                 o.rit_identity !== undefined || o.ad_cid !== undefined;
  const hasLand = o.open_url !== undefined || o.web_url !== undefined ||
                  o.scheme !== undefined || o.deeplink !== undefined;
  let hasAdInfo = false;
  for (let i = 0; i < AD_FLAG_KEYS.length; i++) {
    const v = o[AD_FLAG_KEYS[i]];
    if (v !== undefined && v !== null && v !== false && v !== '') { hasAdInfo = true; break; }
  }
  if (hasAdv) signal++;
  if (hasLand) signal++;
  if (hasAdInfo) signal++;

  return signal >= 2;
}

function isAdContainerKey(k) {
  const lk = String(k).toLowerCase();
  for (let i = 0; i < AD_CONTAINER_KEYS.length; i++) {
    const x = AD_CONTAINER_KEYS[i];
    if (lk === x || lk.indexOf(x) === 0) return true;
  }
  return false;
}

// ── 清洗 ────────────────────────────────────────────────────────────────────
let removed = 0;

function clean(node, depth) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    const out = [];
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      if (isAdCell(item)) { removed++; continue; }
      out.push(clean(item, depth + 1));
    }
    return out;
  }

  const out = {};
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = node[k];

    if (isAdContainerKey(k)) {
      if (Array.isArray(v)) { removed += v.length; out[k] = []; continue; }
      if (v && typeof v === 'object') { removed++; out[k] = {}; continue; }
    }

    if (AD_FLAG_KEYS.indexOf(k) >= 0) { removed++; continue; }

    out[k] = clean(v, depth + 1);
  }
  return out;
}

// ── 入口 ────────────────────────────────────────────────────────────────────
try {
  const body = $response.body;

  if (!body || body.length < 2) {
    $done({});
  } else if (body.length > SIZE_LIMIT) {
    // 太大，判不起，直接放过（正文接口常走到这里）
    $done({});
  } else {
    let obj;
    try {
      obj = JSON.parse(sealBigInt(body));
    } catch (e) {
      // 非 JSON，原样放行
      $done({});
      obj = null;
    }

    if (obj !== null && obj !== undefined) {
      const cleaned = clean(obj, 0);
      if (removed > 0) {
        console.log('[fqnovel_ad] 清除广告节点 ' + removed + ' 个');
        $done({ body: unsealBigInt(JSON.stringify(cleaned)) });
      } else {
        // 没广告，一个字都不改，避免无谓的 JSON 往返
        $done({});
      }
    }
  }
} catch (e) {
  $done({});
}
