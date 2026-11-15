/**
 * 番茄小说 / 红果短剧 —— 阅读流插页广告清除（纯字符串值替换版）
 * ===========================================================================
 * 适用：fqnovel_ad_pro.conf 里 /reading/reader/full/ 那条规则
 *
 * 为什么不用 JSON.parse：
 *   旧版对这个接口做 parse → 递归遍历 → stringify，有两个致命问题
 *     1) 删掉了 ad_info 等字段，客户端 [dict objectForKey:] 拿到 nil，
 *        直接抛「网络出错，请点击重试」「加载失败，点击重试」—— 两端同时挂
 *     2) int64 精度、结构变动、格式差异，任何一个都会让页面打不开
 *
 * 现在的做法：一个字节都不动结构，只把广告标记的值改成「非广告」。
 *   read_flow_ad_type : 3  →  0     （客户端据此不渲染广告视图）
 *   insert_ad         : true → false
 *   readFlowAdType    : 3  →  0     （驼峰形态，二进制里两种都在）
 *
 * 代价：几乎为零。纯字符串正则替换，309KB 正文约 0.1ms，不需要 parse。
 * 风险：几乎为零。JSON 结构、字段个数、字段顺序、数字精度全部保持原样。
 */

// 下划线形态与驼峰形态都覆盖
const FLOW_AD = /("read_flow_ad_type"|"readFlowAdType")(\s*:\s*)([1-9]\d*)/g;
const INSERT_AD = /("insert_ad"|"insertAd"|"is_insert_ad")(\s*:\s*)(true|1)(?=\s*[,}\]])/g;

try {
  const body = $response.body;

  if (!body || body.length < 2) {
    $done({});
  } else if (body.indexOf('read_flow_ad_type') < 0 &&
             body.indexOf('readFlowAdType') < 0 &&
             body.indexOf('insert_ad') < 0 &&
             body.indexOf('insertAd') < 0) {
    // 连字段名都没有，直接放行（绝大多数请求走这条）
    $done({});
  } else {
    let out = body;
    let n = 0;

    out = out.replace(FLOW_AD, function (m, key, colon, val) {
      n++;
      return key + colon + '0';
    });
    out = out.replace(INSERT_AD, function (m, key, colon, val) {
      n++;
      return key + colon + 'false';
    });

    if (n > 0) {
      console.log('[fqnovel_ad] 重置阅读流广告标记 ' + n + ' 处');
      $done({ body: out });
    } else {
      $done({});
    }
  }
} catch (e) {
  // 任何异常都原样放行，绝不改坏响应
  $done({});
}
