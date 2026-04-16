import { Bot } from 'grammy';
import { config } from './config';
import { shouldAlert } from './alertState';
import { checkPm2Processes, type Pm2CheckResult } from './checks/pm2';
import { checkHttp, type HttpCheckResult } from './checks/http';
import { getSystemStats, type SystemStats } from './checks/system';

const bot = new Bot(config.botToken);

// ── Silence mode ────────────────────────────────────────────────────────────
let silencedUntil = 0;
function isSilenced() { return Date.now() < silencedUntil; }

// ── Send alert (with silence check) ─────────────────────────────────────────
async function sendAlert(text: string, force = false): Promise<void> {
  if (!force && isSilenced()) return;
  try {
    await bot.api.sendMessage(config.ownerId, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[monitor] sendAlert error:', err);
  }
}

// ── Format helpers ───────────────────────────────────────────────────────────
function bar(pct: number): string {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`;
}

function uptime(ms: number): string {
  if (ms <= 0) return '-';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Build status message ─────────────────────────────────────────────────────
function buildStatusMessage(
  pm2Results: Pm2CheckResult[],
  httpResults: HttpCheckResult[],
  sys: SystemStats,
): string {
  const lines: string[] = [];
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  lines.push(`<b>📡 Server Status</b>`);
  lines.push(`<i>${ts} WIB</i>`);
  lines.push('');

  // pm2
  lines.push('<b>Proses (pm2):</b>');
  for (const p of pm2Results) {
    const icon = p.online ? '🟢' : '🔴';
    const meta = p.online
      ? `uptime ${uptime(p.uptimeMs)} · ${p.memoryMb}MB · ${p.restarts}x restart`
      : `status: ${p.status}`;
    lines.push(`${icon} <b>${p.name}</b> — ${meta}`);
  }

  // HTTP
  lines.push('');
  lines.push('<b>HTTP Services:</b>');
  for (const h of httpResults) {
    const icon = h.ok ? '🟢' : '🔴';
    const detail = h.ok
      ? `HTTP ${h.statusCode} · ${h.latencyMs}ms`
      : h.error ?? `HTTP ${h.statusCode}`;
    lines.push(`${icon} <b>${h.name}</b> — ${detail}`);
  }

  // System
  lines.push('');
  lines.push('<b>Sistem:</b>');
  lines.push(`CPU  ${bar(Math.min(sys.cpuPercent, 100))}`);
  lines.push(`RAM  ${bar(sys.ramPercent)} (${sys.ramUsedMb}/${sys.ramTotalMb}MB)`);
  lines.push(`Disk ${bar(sys.diskPercent)} (${sys.diskUsed}/${sys.diskTotal})`);

  if (isSilenced()) {
    const remaining = Math.round((silencedUntil - Date.now()) / 60_000);
    lines.push('');
    lines.push(`🔕 Alert dimatikan (${remaining}m lagi)`);
  }

  return lines.join('\n');
}

// ── Main check loop ──────────────────────────────────────────────────────────
async function runChecks(): Promise<void> {
  const [pm2Results, httpResults, sys] = await Promise.all([
    checkPm2Processes(config.pm2Processes),
    Promise.all(config.httpServices.map(s => checkHttp(s.name, s.url, s.timeoutMs))),
    getSystemStats(),
  ]);

  // ── pm2 alerts
  for (const p of pm2Results) {
    const key = `pm2:${p.name}`;
    if (shouldAlert(key, !p.online, config.alertCooldownMs)) {
      const msg = p.online
        ? `✅ <b>RECOVER</b> — proses <code>${p.name}</code> kembali online`
        : `🔴 <b>DOWN</b> — proses <code>${p.name}</code> tidak berjalan\nStatus: ${p.status}`;
      await sendAlert(msg);
    }
  }

  // ── HTTP alerts
  for (const h of httpResults) {
    const key = `http:${h.name}`;
    if (shouldAlert(key, !h.ok, config.alertCooldownMs)) {
      const msg = h.ok
        ? `✅ <b>RECOVER</b> — <b>${h.name}</b> kembali dapat diakses (HTTP ${h.statusCode})`
        : `🔴 <b>DOWN</b> — <b>${h.name}</b> tidak dapat diakses\nURL: <code>${h.url}</code>\nError: ${h.error ?? `HTTP ${h.statusCode}`}`;
      await sendAlert(msg);
    }
  }

  // ── System resource alerts
  const resourceChecks = [
    { key: 'sys:cpu', label: 'CPU', value: sys.cpuPercent, threshold: config.thresholds.cpuPercent },
    { key: 'sys:ram', label: 'RAM', value: sys.ramPercent, threshold: config.thresholds.ramPercent },
    { key: 'sys:disk', label: 'Disk', value: sys.diskPercent, threshold: config.thresholds.diskPercent },
  ];

  for (const r of resourceChecks) {
    const isHigh = r.value > r.threshold;
    if (shouldAlert(r.key, isHigh, config.alertCooldownMs)) {
      const msg = isHigh
        ? `⚠️ <b>${r.label} tinggi</b> — ${r.value}% (threshold ${r.threshold}%)`
        : `✅ <b>${r.label} normal</b> — ${r.value}%`;
      await sendAlert(msg);
    }
  }
}

// ── Bot commands ─────────────────────────────────────────────────────────────

// Guard: owner only
bot.use((ctx, next) => {
  if (ctx.from?.id.toString() !== config.ownerId) return;
  return next();
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '👁 <b>Monitor Bot aktif</b>\n\nMemantau: ' +
    [...config.pm2Processes, ...config.httpServices.map(s => s.name)].join(', ') +
    '\n\n/status — cek semua service sekarang\n/silence [menit] — matikan alert sementara\n/unsilence — aktifkan kembali',
    { parse_mode: 'HTML' }
  );
});

bot.command('status', async (ctx) => {
  const msg = await ctx.reply('Mengecek...');
  const [pm2Results, httpResults, sys] = await Promise.all([
    checkPm2Processes(config.pm2Processes),
    Promise.all(config.httpServices.map(s => checkHttp(s.name, s.url, s.timeoutMs))),
    getSystemStats(),
  ]);
  await ctx.api.editMessageText(
    ctx.chat.id,
    msg.message_id,
    buildStatusMessage(pm2Results, httpResults, sys),
    { parse_mode: 'HTML' }
  );
});

bot.command('silence', async (ctx) => {
  const minutes = parseInt(ctx.match || '60', 10);
  if (isNaN(minutes) || minutes <= 0) {
    await ctx.reply('Format: /silence <menit>. Contoh: /silence 30');
    return;
  }
  silencedUntil = Date.now() + minutes * 60_000;
  await ctx.reply(`🔕 Alert dimatikan selama ${minutes} menit.`);
});

bot.command('unsilence', async (ctx) => {
  silencedUntil = 0;
  await ctx.reply('🔔 Alert diaktifkan kembali.');
});

// ── Startup ───────────────────────────────────────────────────────────────────
bot.start({
  onStart: async (info) => {
    console.log(`[monitor] @${info.username} running`);
    // Notify owner on start
    await sendAlert(
      `🚀 <b>Monitor Bot dimulai</b>\nMemantau: ${[...config.pm2Processes, ...config.httpServices.map(s => s.name)].join(', ')}`,
      true // force — ignore silence
    );
    // Run first check immediately
    runChecks().catch(err => console.error('[monitor] initial check error:', err));
    // Schedule recurring checks
    setInterval(() => {
      runChecks().catch(err => console.error('[monitor] check error:', err));
    }, config.checkIntervalMs);
  },
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
