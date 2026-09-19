# 测试 / 演示环境

和线上部署完全隔离的第二套，用来改内容、试功能、录 demo。

| | 线上 | 测试 |
|---|---|---|
| 地址 | https://study-base.evanzhang.app | http://100.126.176.101:3002 |
| 登录 | Google 登录 | **无登录**（每页顶部有橙色横幅提示） |
| 数据库 | `./data/` | `./data-test/` |
| 上传文件 | `./src/data/uploads/` | `./uploads-test/` |
| 容器 | `studybase` | `studybase-test` |
| 公网 | 经 cloudflared | **不接公网** |

两者只共用同一份代码和同一个 AI Key，其余互不影响：在测试环境删课、删资料，线上不受任何影响。

## 常用命令

```bash
# 启动 / 重建（改完代码后）
docker compose -f docker-compose.test.yml up -d --build

# 看日志
docker compose -f docker-compose.test.yml logs -f studybase

# 停止
docker compose -f docker-compose.test.yml down

# 用线上当前数据重置测试环境（会覆盖测试环境里的改动）
docker compose -f docker-compose.test.yml stop studybase
cp data/studybase.db data-test/studybase.db
rm -rf uploads-test/* && cp -r src/data/uploads/. uploads-test/
docker compose -f docker-compose.test.yml start studybase
```

线上照旧用 `docker compose up -d --build`，两条命令互不干扰。

## 两件要注意的

**没有登录。** 绑在 Tailscale 地址上，只有你自己的设备能访问，但在那个范围内是完全敞开的。不要给它配公网域名。

**两套都会跑定时任务。** 各自的 LEARN 同步和 AI 生成都会照常执行，也就是说 AI 额度会被两边一起消耗。录 demo 期间如果不想让它自己动，可以先 `docker compose -f docker-compose.test.yml stop studybase`，需要时再 start。
