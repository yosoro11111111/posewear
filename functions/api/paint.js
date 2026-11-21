// 衣姿 PoseWear 画图服务端端点：口令门 + 上游转发。
// 上游地址与密钥在 functions/api/paint.config.js（由 CI 从 GitHub Secrets 生成，不入仓库、不下发浏览器）。
// 浏览器只看到 /api/paint 与口令头；口令校验、密钥注入都在本函数内完成。
// 支持：GET = 转发模型列表（测试连接用）；POST = 转发 chat/completions 画图请求。
import { F2A_BASE, F2A_KEY, PAINT_PASS } from './paint.config.js';

// 每 isolate 内存限流（尽力而为）：口令爆破防护 + 基本用量控制
const RL = new Map(), WIN = 60e3, MAX = 20;
function limited(ip) {
  const now = Date.now(); let e = RL.get(ip);
  if (!e || now - e.t > WIN) { e = { t: now, n: 0 }; RL.set(ip, e); }
  e.n++;
  if (RL.size > 5000) for (const [x, v] of RL) if (now - v.t > WIN) RL.delete(x);
  return e.n > MAX;
}

const j = (s, m) => new Response(JSON.stringify({ error: { message: m } }), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export async function onRequest(ctx) {
  const { request } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const ip = request.headers.get('cf-connecting-ip') || '0';
  if (limited(ip)) return j(429, '请求过于频繁，请稍后再试');
  const pass = request.headers.get('x-paint-pass') || '';
  if (!pass) return j(401, '请先在设置里输入画图口令');
  if (pass !== PAINT_PASS) return j(403, '口令不正确，请在设置里重新输入');
  const h = { Authorization: 'Bearer ' + F2A_KEY };
  try {
    if (request.method === 'GET') {
      const r = await fetch(F2A_BASE + '/models', { headers: h });
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
    }
    if (request.method === 'POST') {
      let body;
      try { body = JSON.parse(await request.text()); } catch (e) { return j(400, '请求体格式不正确'); }
      // 强制流式：Function 立刻把响应头与数据流转发给客户端，长时间生成不会被边缘掐断
      body.stream = true;
      const r = await fetch(F2A_BASE + '/chat/completions', {
        method: 'POST', headers: Object.assign(h, { 'Content-Type': 'application/json' }), body: JSON.stringify(body)
      });
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/event-stream', 'cache-control': 'no-store' } });
    }
    return j(405, '只支持 GET / POST');
  } catch (e) {
    return j(502, '画图服务暂时不可用，请稍后重试');
  }
}
