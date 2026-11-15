# 番茄小说 & 红果短剧 去广告 · Quantumult X

一个订阅，同时覆盖两个 App。

```
https://xinrui-j.github.io/Quantum-x/fqnovel_ad_pro.conf
```

Quantumult X → **设置 → 重写 → 引用 → 右上角 `+`** → 粘贴上面的地址 → 保存。

若 `github.io` 访问不稳，等价地址：`https://cdn.jsdelivr.net/gh/xinrui-j/Quantum-x@main/fqnovel_ad_pro.conf`

## 为什么一份规则能通吃两个 App

不是猜的。两个包是**同一代码基线的双产品**，同为 7.4.3：

| 对比项 | 番茄小说 `Reading.app` | 红果短剧 `Eggplant.app` | 差异 |
|---|---|---|---|
| Bundle ID | `com.dragon.read` | `com.phoenix.video` | — |
| 主二进制 | 511.6 MB | 494.8 MB | — |
| `tnc.json` 网络配置 | 83 个域名 | 83 个域名 | **零差异** |
| 广告接口路径 | 151 条 | 151 条 | **零差异** |
| `ad.zijieapi.com` 出现次数 | 10 | 10 | 相同 |
| `chapter_end_ad` | 8 | 8 | 相同 |
| `read_flow_ad_type` | 4 | 4 | 相同 |
| `api/ad/v1/inspire` | 2 | 2 | 相同 |
| `ad_insert_interval` | 1 | 1 | 相同 |

网络层是同一份配置，广告接口是同一套路径，连字段出现的次数都逐个对得上。所以规则天然通吃，不存在「番茄能用红果不能用」的问题。

## 覆盖的广告形态

| 形态 | 接口 | 处理 |
|---|---|---|
| **开屏广告** | `/api/ad/splash/*`（novelapp/v15、get_atp_config、stock/realtime、stat/ack、splash_shake_switch） | 整族拒绝 |
| **激励视频** | `/api/ad/v1/inspire/`、`inspire_send`（短剧解锁、书币任务都走这里） | 整族拒绝 |
| **联盟 / Banner** | `/api/ad/union/sdk/get_ads/`、`/api/ad/v1/banner/`、`recall_ads`、`aggregate` | 整族拒绝 |
| **广告上报** | `/api/ad/v1/report/`、`flash/ack`、`dislike` | 整族拒绝 |
| **章末 / 剧集插页** | `/reading/commerceapi/ad/*`（comment、mix_game、delivery_plan、patch_plan、feature、report、auth_benefit） | 整族拒绝 |
| **章末卡片位广告** | `/reading/commerceapi/chapter_end/resource/v1/` | 脚本删广告卡，评论/推荐/优惠券保留 |
| **正文段落插入广告** | `/reading/reader/full/`、`batch_full/` 里的 `read_flow_ad_type` 非 0 段 | 脚本删段 |
| **信息流广告卡** | `bookmall/cell/change`、`search/tab` | 脚本删卡 |
| **广告落地页** | `ad-experience.bytedance.com`、`chengzijianzhan.com` | 整域拒绝 |
| **广告 JSSDK 埋点** | `lf3-analytics.bytescm.com/obj/adjssdk/` | 整族拒绝 |
| **广告集群** | `ad/ads*.zijieapi.com`（TNC 下发的专用集群） | 整域拒绝 |
| **看广告得书币入口** | `luckycat/.../get_ad_info`、`excitation_ad_*`、`reader/bonus/ad_reward` | 整族拒绝 |

共 19 条规则，其中 5 条挂脚本做响应体清洗。

## 两个副作用（提前说清楚）

**1. 书币任务会失效**

`luckycat` 那几条断掉后，「看广告得书币」「开宝箱」「看广告换阅读时长」这些入口点进去会转圈 —— 因为奖励本身就是广告换来的，广告没了奖励自然也没有。想要奖励就把 conf 里 ⑫⑬ 三行注释掉，代价是广告会回来。

**2. 翻页可能轻微卡顿**

`reader/full` 那条挂脚本后，番茄每翻一页要跑一遍 JSON 往返。QX 的 JSC 引擎处理几百 KB 的 body 有可感知延迟。真觉得卡就把 ⑩ 那行注释掉，其余广告不受影响。短剧以视频为主，基本感觉不到。

## 证书（必须做，否则规则不生效）

设置 → **MitM** → 生成证书 → 配置证书 → 安装到设备 → **再到「设置 → 通用 → 关于本机 → 证书信任设置」里手动打开信任开关**。

很多人卡在这：证书装了但没在「证书信任设置」里信任，QX 显示已安装，实际所有 HTTPS 都没解密。

## 验证是否生效

1. QX → **分析** → 活跃连接，搜 `/api/ad/`，应该看不到任何请求
2. 冷启动 App，**不应该再有开屏广告**
3. 番茄翻到章节末尾，**不应该弹插页广告**
4. 红果刷到剧集中间，**不应该弹激励广告**

开屏还在但 `/api/ad/` 已拦住 —— 说明广告走了 HTTP/3（QUIC，UDP 443），绕开了 MITM。在 QX 的 `[filter_local]` 里加：

```
AND,((PROTOCOL,UDP),(DEST-PORT,443)),REJECT
```

代价是所有 App 的 QUIC 回退到 TCP，略慢，基本无感。

## 哪些域名不能拦（很容易踩）

| 对象 | 拦了会怎样 |
|---|---|
| `polaris.zijieapi.com` | 全站 AB / 配置下发，含「免广告特权」判定，拦了功能异常 |
| `security.zijieapi.com` | 风控上报，拦了可能触发登录风控 |
| `mon` / `log` / `rtlog.zijieapi.com` | 通用埋点，与阅读时长统计共用通道 |
| `/luckycat/novel/v1/privilege/ad_free` | 这是「已开通免广告」的**状态查询**，拦了反而丢掉你自己买的免广告 |
| `lf-*.bytegecko.com`、`byteimg.com`、`fqnovelpic.com` | 素材 CDN，广告素材和**封面/剧照共用**，整域拦会把图片一起干掉 |

## 已知限制

| # | 问题 | 现状 |
|---|---|---|
| 1 | **int64 精度**：接口大量用 19 位整数 ID（`book_id` / `item_id` / `uid`），JS 的 Number 只有 53 位精度，`JSON.parse → JSON.stringify` 往返会把 `7145420391827365123` 变成 `7145420391827365000` | 脚本已做**大整数打标**保护：解析前把 16 位以上整数字面量临时转成带 `__QX_BIG__` 前缀的字符串，输出前还原。30 项单元测试覆盖，含「原本是字符串的 ID 不能变成数字」。**改脚本时别删这段** |
| 2 | **大响应体卡顿** | 超过 **3 MB 直接放行**，`MAX_DEPTH=24` 防深递归 |
| 3 | **可能留下空位**：广告卡被删后列表里原本占位的格子可能变留白 | 删卡片的固有代价，不是 bug |
| 4 | **弱信号只摘字段**：单独一个 `ad_info` 不足以判定为广告卡，需要「广告主 ID / 落地页 / 广告信息块」三选二 | 防止误删挂空壳 `ad_info` 的正常卡片 |
| 5 | **QX 会缓存脚本** | 改完要长按资源 → 更新，或清缓存重启 |
| 6 | **别同时订阅多个去广告合集** | 同一 URL 命中多条规则时行为取决于加载顺序 |
| 7 | **`reject-200` 返回 200 空 body** | 绝大多数接口能容错降级，个别页面可能停在 loading，属正常表现 |

## 数据来源

| 来源 | 取出什么 |
|---|---|
| `Reading.app/Reading`（511.6 MB） | 番茄的全部 `/api/ad/*`、`ad.zijieapi.com` 系列、`BDADSDK` / `BDMannor*` 广告框架 |
| `Eggplant.app/Eggplant`（494.8 MB） | 红果的同一套接口（零差异验证） |
| 两份 `tnc.json` | 广告专用集群 `ads3/5-normal{,-hl,-lf,-lq}.zijieapi.com` —— 静态二进制里没硬编码，全在这份配置 |
| 两份 `Info.plist` | `NSAllowsArbitraryLoads = true`，抓包无 ATS 障碍 |

几个容易忽略的细节：

- 二进制里大量出现的 `2freading.snssdk.com` 不是真实主机，`2f` 是 `%2F` 的转义前缀，真机是 `reading.snssdk.com`
- 广告体系是字节自研 `BDADSDK` + `BDMannor*`（穿山甲 CSJ 内核），**没有**接入 pangle.io / gdt.qq.com / kwai / Sigmob / Mintegral / AppLovin 任何第三方 SDK 域名，网上那些通用广告规则对它基本无效
- 证书校验（`pinnedPublicKeys`）只挂在 `webcast.*` 直播域，主 API 上没有强制 pin 的证据
- 插入式广告按段落定位：`ad_insert_failed, adId=%@, chapterId=%@, paraId=%@`

完整逆向报告见 [`docs/广告网络分析.md`](docs/广告网络分析.md)，域名与接口清单见 [`docs/广告网络清单.csv`](docs/广告网络清单.csv)。

## 常见问题

**Q：订阅后规则列表是空的？**
A：QX 只认 `[rewrite_local]` 段头，且必须走「引用」而不是粘进本地配置。

**Q：两个 App 都装在手机上，会互相干扰吗？**
A：不会。规则按 URL 匹配，两个 App 打的接口完全一样，谁发起请求都会命中。

**Q：App 更新到 8.x 还适用吗？**
A：接口大概率还在，路径版本号会变。重跑一遍逆向（流程见 `docs/广告网络分析.md` 第八节），主要就是 grep `/api/ad` 和 tnc.json 里的域名。

## 更新日志

- **2026-11-15** v3：合并为单文件，同时覆盖番茄小说与红果短剧。
  - 19 条规则，5 条脚本清洗
  - 补 `commerceapi/ad`（章末插页）、`chapter_end/resource`（章末卡片位）、`reader/full`（正文插段）
  - 单测 30 项全过
- **2026-11-15** v2：补上正文/章末插入广告（原版漏了 `/reading/commerceapi/ad/`）
- **2026-11-15** v1：首版，仅覆盖 `/api/ad/` 与广告集群

## 免责

仅用于个人学习与网络流量分析。规则作用于你自己的设备与自己的网络，不改动服务端、不绕过付费内容。广告是内容平台的收入来源，去广告请自行权衡。
