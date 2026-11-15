# 番茄小说 去广告 · Quantumult X

针对 **番茄小说 iOS 7.4.3**（`com.dragon.read`）的广告拦截规则。

规则不是从别处抄的，是对 `Reading.app` 主二进制（511 MB，未加密）做全量静态逆向得到的：1,920,551 条字符串 → 25,061 个候选 host → 922 个有效域名 → 33 个广告域名 + 39 条广告接口，并用 2,254 条真实 URL 做过回归测试，正文接口零误伤。

## 一键订阅

```
# 完整版（推荐）：开屏 + 激励视频 + Banner + 联盟广告 + 上报
https://xinrui-j.github.io/Quantum-x/fqnovel_ad.conf

# 增强版：完整版 + 书城/搜索流里的广告卡片
https://xinrui-j.github.io/Quantum-x/fqnovel_ad_pro.conf

# 轻量版：只拦广告专用集群，不碰正文域名，零风险
https://xinrui-j.github.io/Quantum-x/fqnovel_ad_lite.conf
```

Quantumult X → **设置 → 重写 → 引用 → 右上角 `+`** → 粘贴上面的地址 → 保存。

若 `github.io` 访问不稳，等价的 jsDelivr 地址（换掉域名即可）：

```
https://cdn.jsdelivr.net/gh/xinrui-j/Quantum-x@main/fqnovel_ad.conf
```

## 三档怎么选

| 文件 | 强度 | 效果 | 风险 |
|---|---|---|---|
| `fqnovel_ad_lite.conf` | A 档 | 激励视频、Banner、联盟广告、广告上报全灭。**开屏广告可能还在**（开屏走主 API） | 零风险，不 MITM 主 API |
| `fqnovel_ad.conf` | B 档 | 上面全部 + **开屏广告**也灭 | 需 MITM 主 API |
| `fqnovel_ad_pro.conf` | B 档 + 脚本 | 上面全部 + **书城「换一换」和搜索结果里的广告卡**也删 | 同 B 档，另有 8 条限制，见下文 |

**建议顺序**：先上 `fqnovel_ad.conf`，用两天没问题再换 `pro`。App 出现转圈/网络异常就退回 `lite`。

## 证书（必须做，否则规则不生效）

设置 → **MitM** → 生成证书 → 配置证书 → 安装到设备 → **再到「设置 → 通用 → 关于本机 → 证书信任设置」里手动打开信任开关**。

很多人卡在这：证书装了但没在「证书信任设置」里信任，QX 显示已安装，实际所有 HTTPS 都没解密。

## 验证是否生效

1. QX → **分析** → 活跃连接，搜 `/api/ad/`，应该看不到任何请求
2. 冷启动番茄小说（后台划掉再开），**不应该再有开屏广告**
3. 阅读页连翻几页，章末不应该弹插屏

开屏还在但 `/api/ad/` 已经被拦住 —— 说明广告走了 HTTP/3（QUIC，UDP 443），绕开了 MITM。在 QX 的 `[filter_local]` 里加一条：

```
AND,((PROTOCOL,UDP),(DEST-PORT,443)),REJECT
```

代价是所有 App 的 QUIC 回退到 TCP，略慢，基本无感。

## 哪些域名不能拦（很容易踩）

| 对象 | 拦了会怎样 |
|---|---|
| `polaris.zijieapi.com` | 全站 AB / 配置下发，含「免广告特权」判定，拦了功能异常 |
| `security.zijieapi.com` | 风控上报，拦了可能触发登录风控 |
| `mon` / `log` / `rtlog.zijieapi.com` | 通用埋点，与阅读时长统计共用通道，拦了影响任务 |
| `/luckycat/novel/v1/privilege/ad_free` | 这是「已开通免广告」的**状态查询**，拦了反而丢掉你自己买的免广告 |
| `lf-*.bytegecko.com`、`byteimg.com`、`fqnovelpic.com` | 素材 CDN，广告素材和**封面插图共用**，整域拦会把书封一起干掉 |

另外，规则默认**没有**拦「看广告得书币 / 开宝箱 / 看广告换时长」这些活动入口。广告是没了，但这些入口还在，点进去会转圈。想连入口一起干掉，把 `fqnovel_ad.conf` 里被注释的那几行放开即可。

## pro 版已知限制

| # | 问题 | 现状 |
|---|---|---|
| 1 | **int64 精度**：字节接口大量用 19 位整数 ID（`book_id` / `item_id` / `uid`），JS 的 Number 只有 53 位精度，`JSON.parse → JSON.stringify` 往返一次就会把 `7145420391827365123` 变成 `7145420391827365000` | 脚本里已做**大整数打标**保护：解析前把 16 位以上整数字面量临时转成带 `__QX_BIG__` 前缀的字符串，输出前还原。21 项单元测试覆盖，含「原本是字符串的 ID 不能变成数字」。**改脚本时别删这段** |
| 2 | **大响应体卡顿**：正文接口几百 KB 到几 MB，递归遍历会让翻页卡顿，QX 还有脚本执行时限 | 超过 **3 MB 直接放行**；`MAX_DEPTH=24` 防深递归 |
| 3 | **正文接口默认关闭**：`/reading/reader/full/` 那条是注释状态 | 章末广告主要走 `/reading/commerceapi/ad/comment/v1/`（已被 ② 拦掉），正文里收益不明显。要开自己取消注释，脚本能保证不错 ID，但会卡 |
| 4 | **可能留下空位**：广告 card 被删后，列表里原本占位的格子可能变成留白 | 删卡片的固有代价，不是 bug。介意就用 `fqnovel_ad.conf` |
| 5 | **弱信号只摘字段、不强删 cell**：单独的 `ad_info` 不足以判定为广告卡，需要「广告主 ID / 落地页 / 广告信息块」三选二 | 防止误删挂空壳 `ad_info` 的正常书籍卡。代价是极少数广告卡会残留 |
| 6 | **QX 会缓存脚本**：改了 js 之后订阅不会自动更新 | 设置 → 重写 → 引用里长按该条资源 → 更新；或清 QX 缓存重启 |
| 7 | **别同时订阅多个去广告合集** | 同一 URL 命中多条规则时行为取决于加载顺序，reject 和 script 可能打架 |
| 8 | **`reject-200` 返回 200 空 body** | 绝大多数接口能容错降级，个别接口（如激励视频任务页）可能停在 loading —— 这是广告被砍掉的正常表现 |

## 规则从哪来的

| 来源 | 取出什么 |
|---|---|
| `Reading.app/Reading`（511 MB 主二进制） | 全部 `/api/ad/*` 接口、`ad.zijieapi.com` 系列、`BDADSDK` / `BDMannor*` 广告框架证据 |
| `Reading.app/tnc.json`（TTNet 网络配置） | **广告专用集群域名** `ads3/5-normal{,-hl,-lf,-lq}.zijieapi.com` —— 静态二进制里没有硬编码，全靠这份配置 |
| `Reading.app/Info.plist` | `NSAllowsArbitraryLoads = true`（全量 HTTP 放行，抓包无 ATS 障碍） |
| Lynx 前端包（`drlynx_monetize.zst` 等 27 个） | 变现模块的接口与素材域名 |

几个容易被忽略的细节：

- 二进制里大量出现的 `2freading.snssdk.com` 不是真实主机，`2f` 是 `%2F` 的转义前缀，真机是 `reading.snssdk.com`
- 番茄的广告体系是字节自研 `BDADSDK` + `BDMannor*`（穿山甲 CSJ 内核），**没有**接入 pangle.io / gdt.qq.com / kwai / Sigmob / Mintegral / AppLovin 任何第三方 SDK 域名，所以网上那些通用广告规则对它基本无效
- 证书校验（`pinnedPublicKeys`）只挂在 `webcast.*` 直播域，主 API 上没有强制 pin 的证据

完整逆向报告见 [`docs/广告网络分析.md`](docs/广告网络分析.md)，域名与接口清单见 [`docs/广告网络清单.csv`](docs/广告网络清单.csv)。

## 常见问题

**Q：订阅后规则列表是空的？**
A：QX 只认 `[rewrite_local]` 段头，且必须走「引用」而不是粘进本地配置。

**Q：开了 B 档 App 一直转圈？**
A：你这台机器的系统版本启用了证书校验。退回 `fqnovel_ad_lite.conf`。

**Q：广告没了，但阅读时长任务不涨了？**
A：任务依赖广告曝光埋点。要任务就换回 lite 档，两个本来互斥。

**Q：pro 版订阅后书城的广告卡还在？**
A：脚本没拉到。`curl -I https://xinrui-j.github.io/Quantum-x/scripts/fqnovel_ad_clean.js` 看是不是 200。

**Q：App 更新到 8.x 还适用吗？**
A：接口大概率还在，路径版本号会变。重跑一遍逆向（流程见 `docs/广告网络分析.md` 第八节），主要就是 grep `/api/ad` 和 tnc.json 里的域名。

## 更新日志

- **2026-11-15** 首个版本。对齐番茄小说 iOS 7.4.3，33 域名 / 39 接口。
  - pro 版脚本含 int64 打标保护、3 MB 上限、强弱信号判定；正文接口默认关闭
  - 21 项单元测试全部通过

## 免责

仅用于个人学习与网络流量分析。规则作用于你自己的设备与自己的网络，不改动服务端、不绕过付费内容。广告是内容平台的收入来源，去广告请自行权衡。
