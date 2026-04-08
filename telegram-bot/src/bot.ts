import { Bot, Context, session, InlineKeyboard, Keyboard } from 'grammy';
import { FileAdapter } from '@grammyjs/storage-file';
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from '@grammyjs/conversations';
import { config } from './config';
import { db } from './services/supabase';
import { sheets } from './services/sheets';
import { categorizeTransaction, generateInsight, batchCategorizeTransactions } from './services/openai';
import {
  formatRupiah,
  formatTransactionMessage,
  formatSummaryMessage,
  parseAmount,
} from './services/formatter';
import dayjs from 'dayjs';
import { Account, Category } from './types';

// ── Types ───────────────────────────────────
type MyContext = Context & ConversationFlavor;

// ── Bulk Input ──────────────────────────────
interface BulkEntry {
  date: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  account_id: string;
  account_name: string;
  category_id?: string;
  category_name?: string;
  category_icon?: string;
}

// In-memory store untuk pending bulk sessions (single-user bot, simple Map cukup)
const pendingBulk = new Map<string, BulkEntry[]>();
// Chat IDs yang sedang menunggu input bulk (setelah /bulk tanpa teks)
const waitingForBulk = new Set<number>();

function matchAccount(token: string, accounts: Account[]): Account | null {
  const lower = token.toLowerCase();
  return (
    accounts.find((a) => a.name.toLowerCase() === lower) ||
    accounts.find((a) => a.name.toLowerCase().includes(lower)) ||
    accounts.find((a) => lower.includes(a.name.toLowerCase().split(' ')[0])) ||
    null
  );
}

// Parse optional date prefix "DD/MM" or "DD/MM/YYYY", returns ISO string or null
function parseDatePrefix(token: string): string | null {
  const m = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3]) : dayjs().year();
  const d = dayjs(`${year}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[1])).padStart(2, '0')}`);
  return d.isValid() ? d.startOf('day').toISOString() : null;
}

function parseBulkLine(
  line: string,
  accounts: Account[]
): Omit<BulkEntry, 'category_id' | 'category_name' | 'category_icon'> | null {
  let rest = line.trim();
  if (!rest) return null;

  let isIncome = false;
  if (rest.startsWith('+')) { isIncome = true; rest = rest.slice(1).trim(); }
  else if (rest.startsWith('-')) { rest = rest.slice(1).trim(); }

  const tokens = rest.split(/\s+/);
  if (tokens.length < 3) return null;

  // Date: DD/MM or DD/MM/YYYY
  const dateMatch = tokens[0].match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!dateMatch) return null;
  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]);
  const year = dateMatch[3] ? parseInt(dateMatch[3]) : dayjs().year();
  const date = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  if (!date.isValid()) return null;

  // Amount
  const amount = parseAmount(tokens[1]);
  if (!amount || amount <= 0) return null;

  // Try to match last token as account name
  const lastToken = tokens[tokens.length - 1];
  const accountMatch = tokens.length > 3 ? matchAccount(lastToken, accounts) : null;
  const descTokens = accountMatch ? tokens.slice(2, -1) : tokens.slice(2);
  const description = descTokens.join(' ').trim();
  if (!description) return null;

  const account = accountMatch || accounts.find((a) => a.name === 'Cash') || accounts[0];

  return {
    date: date.toISOString(),
    type: isIncome ? 'income' : 'expense',
    amount,
    description,
    account_id: account.id,
    account_name: account.name,
  };
}
type MyConversation = Conversation<MyContext>;

// ── Guard: hanya owner yang bisa pakai ──────
function ownerOnly(ctx: MyContext, next: () => Promise<void>) {
  if (ctx.from?.id.toString() !== config.telegram.ownerId) {
    return ctx.reply('⛔ Bot ini hanya untuk pemiliknya.');
  }
  return next();
}

// ── Main Menu Keyboard ──────────────────────
const mainMenu = new Keyboard()
  .text('💰 Catat Income')
  .text('💸 Catat Expense')
  .row()
  .text('📊 Laporan Hari Ini')
  .text('📈 Dashboard')
  .row()
  .text('🤖 Tanya AI')
  .text('⚙️ Pengaturan')
  .resized()
  .persistent();

// ── Bot Init ────────────────────────────────
export function createBot() {
  const bot = new Bot<MyContext>(config.telegram.botToken);

  // Middleware — file-based session agar conversation survive restart
  bot.use(session({
    initial: () => ({}),
    storage: new FileAdapter({ dirName: 'sessions' }),
  }));
  bot.use(conversations());
  bot.use(ownerOnly);

  // ── Conversation: Record Expense ──────────
  async function recordExpenseConvo(conversation: MyConversation, ctx: MyContext) {
    // Step 0: Tanggal
    const dateKeyboard = new InlineKeyboard()
      .text(`📅 Hari ini (${dayjs().format('DD/MM')})`, 'date_today')
      .text(`📅 Kemarin (${dayjs().subtract(1, 'day').format('DD/MM')})`, 'date_yesterday')
      .row()
      .text('📅 Tanggal lain...', 'date_custom');
    await ctx.reply('Tanggal transaksi:', { reply_markup: dateKeyboard });

    let transactionDate = dayjs().toISOString();
    const dateCtx = await conversation.waitForCallbackQuery(/^date_/);
    await dateCtx.answerCallbackQuery();
    if (dateCtx.callbackQuery.data === 'date_yesterday') {
      transactionDate = dayjs().subtract(1, 'day').startOf('day').toISOString();
    } else if (dateCtx.callbackQuery.data === 'date_custom') {
      await ctx.reply('Ketik tanggal (format DD/MM atau DD/MM/YYYY):', { reply_markup: { force_reply: true } });
      const dateMsg = await conversation.wait();
      const parsed = parseDatePrefix(dateMsg.message?.text?.trim() || '');
      if (parsed) transactionDate = parsed;
    }

    await ctx.reply('Masukkan nominal pengeluaran:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) {
      return ctx.reply('❌ Nominal tidak valid. Coba lagi dengan /expense');
    }

    await ctx.reply('Deskripsi singkat:', { reply_markup: { force_reply: true } });
    const descMsg = await conversation.wait();
    const description = descMsg.message?.text || '';

    // Auto-suggest kategori via AI
    const categories = await db.getCategories('expense');
    const suggestedId = await categorizeTransaction(description, undefined, 'expense', categories);
    const suggested = categories.find((c) => c.id === suggestedId);

    // Tampilkan kategori dengan inline keyboard
    const catKeyboard = new InlineKeyboard();
    if (suggested) {
      catKeyboard.text(`✅ ${suggested.icon} ${suggested.name}`, `cat_${suggested.id}`).row();
    }
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.icon} ${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(`💸 ${formatRupiah(amount)} — ${description}\n\nPilih kategori:`, {
      reply_markup: catKeyboard,
    });

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.callbackQuery.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    // Pilih akun
    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.icon} ${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Dari akun mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.callbackQuery.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    // Simpan transaksi
    const txn = await db.insertTransaction({
      type: 'expense',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      verified: true,
      transaction_date: transactionDate,
    });

    // Update saldo akun
    await db.updateAccountBalance(accountId!, -amount);

    const category = categories.find((c) => c.id === categoryId);
    const account = accounts.find((a) => a.id === accountId);

    // Sheets sync (fire-and-forget)
    sheets.syncTransaction({ ...txn, category_name: category?.name, account_name: account?.name }).catch(() => {});

    await ctx.reply(
      formatTransactionMessage({
        type: 'expense',
        amount,
        description,
        category_name: category?.name,
        category_icon: category?.icon,
        account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
        verified: true,
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // ── Conversation: Record Income ───────────
  async function recordIncomeConvo(conversation: MyConversation, ctx: MyContext) {
    // Step 0: Tanggal
    const dateKeyboard = new InlineKeyboard()
      .text(`📅 Hari ini (${dayjs().format('DD/MM')})`, 'date_today')
      .text(`📅 Kemarin (${dayjs().subtract(1, 'day').format('DD/MM')})`, 'date_yesterday')
      .row()
      .text('📅 Tanggal lain...', 'date_custom');
    await ctx.reply('Tanggal transaksi:', { reply_markup: dateKeyboard });

    let transactionDate = dayjs().toISOString();
    const dateCtx = await conversation.waitForCallbackQuery(/^date_/);
    await dateCtx.answerCallbackQuery();
    if (dateCtx.callbackQuery.data === 'date_yesterday') {
      transactionDate = dayjs().subtract(1, 'day').startOf('day').toISOString();
    } else if (dateCtx.callbackQuery.data === 'date_custom') {
      await ctx.reply('Ketik tanggal (format DD/MM atau DD/MM/YYYY):', { reply_markup: { force_reply: true } });
      const dateMsg = await conversation.wait();
      const parsed = parseDatePrefix(dateMsg.message?.text?.trim() || '');
      if (parsed) transactionDate = parsed;
    }

    await ctx.reply('Masukkan nominal pemasukan:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) {
      return ctx.reply('❌ Nominal tidak valid. Coba lagi.');
    }

    await ctx.reply('Deskripsi singkat:', { reply_markup: { force_reply: true } });
    const descMsg = await conversation.wait();
    const description = descMsg.message?.text || '';

    const categories = await db.getCategories('income');
    const suggestedId = await categorizeTransaction(description, undefined, 'income', categories);
    const suggested = categories.find((c) => c.id === suggestedId);

    const catKeyboard = new InlineKeyboard();
    if (suggested) {
      catKeyboard.text(`✅ ${suggested.icon} ${suggested.name}`, `cat_${suggested.id}`).row();
    }
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.icon} ${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(`💰 ${formatRupiah(amount)} — ${description}\n\nPilih kategori:`, {
      reply_markup: catKeyboard,
    });

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.callbackQuery.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.icon} ${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Masuk ke akun mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.callbackQuery.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    const txn = await db.insertTransaction({
      type: 'income',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      verified: true,
      transaction_date: transactionDate,
    });

    await db.updateAccountBalance(accountId!, amount);

    const category = categories.find((c) => c.id === categoryId);
    const account = accounts.find((a) => a.id === accountId);

    // Sheets sync (fire-and-forget)
    sheets.syncTransaction({ ...txn, category_name: category?.name, account_name: account?.name }).catch(() => {});

    await ctx.reply(
      formatTransactionMessage({
        type: 'income',
        amount,
        description,
        category_name: category?.name,
        category_icon: category?.icon,
        account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
        verified: true,
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // ── Conversation: Record Transfer ────────
  async function recordTransferConvo(conversation: MyConversation, ctx: MyContext) {
    await ctx.reply('Masukkan nominal transfer:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) return ctx.reply('❌ Nominal tidak valid. Coba lagi dengan /transfer');

    // Pilih akun sumber
    const accounts = await db.getAccounts();
    const fromKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      fromKeyboard.text(`${a.icon} ${a.name}`, `from_${a.id}`);
      if (i % 3 === 2) fromKeyboard.row();
    });

    await ctx.reply(`🔄 ${formatRupiah(amount)}\n\nDari akun mana?`, { reply_markup: fromKeyboard });
    const fromCallback = await conversation.waitForCallbackQuery(/^from_/);
    const fromAccountId = fromCallback.callbackQuery.data?.replace('from_', '');
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    await fromCallback.answerCallbackQuery();

    // Pilih akun tujuan (exclude akun sumber)
    const toKeyboard = new InlineKeyboard();
    accounts
      .filter((a) => a.id !== fromAccountId)
      .forEach((a, i) => {
        toKeyboard.text(`${a.icon} ${a.name}`, `to_${a.id}`);
        if (i % 3 === 2) toKeyboard.row();
      });

    await ctx.reply(`Ke akun mana? (dari ${fromAccount?.icon} ${fromAccount?.name})`, {
      reply_markup: toKeyboard,
    });
    const toCallback = await conversation.waitForCallbackQuery(/^to_/);
    const toAccountId = toCallback.callbackQuery.data?.replace('to_', '');
    const toAccount = accounts.find((a) => a.id === toAccountId);
    await toCallback.answerCallbackQuery();

    await ctx.reply('Catatan (opsional, ketik "-" untuk skip):', {
      reply_markup: { force_reply: true },
    });
    const noteMsg = await conversation.wait();
    const note = noteMsg.message?.text || '';
    const description = note === '-' ? `Transfer ${fromAccount?.name} → ${toAccount?.name}` : note;

    const txn = await db.insertTransaction({
      type: 'transfer',
      amount,
      description,
      account_id: fromAccountId,
      to_account_id: toAccountId,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    // Update saldo: kurangi dari, tambah ke
    await db.updateAccountBalance(fromAccountId!, -amount);
    await db.updateAccountBalance(toAccountId!, amount);

    // Sheets sync (fire-and-forget)
    sheets.syncTransaction({ ...txn, account_name: fromAccount?.name }).catch(() => {});

    await ctx.reply(
      formatTransactionMessage({
        type: 'transfer',
        amount,
        description,
        account_name: `${fromAccount?.name} → ${toAccount?.name}`,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
        verified: true,
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // Register conversations
  bot.use(createConversation(recordExpenseConvo));
  bot.use(createConversation(recordIncomeConvo));
  bot.use(createConversation(recordTransferConvo));

  // ── /start ────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '👋 <b>Halo! Aku Finance Tracker Bot kamu.</b>\n\n' +
        'Aku bisa bantu catat semua income & expense kamu, ' +
        'baik manual maupun otomatis dari email.\n\n' +
        'Gunakan menu di bawah atau ketik /help untuk bantuan.',
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  });

  // ── Menu button handlers ──────────────────
  bot.hears('💸 Catat Expense', (ctx) => ctx.conversation.enter('recordExpenseConvo'));
  bot.hears('💰 Catat Income', (ctx) => ctx.conversation.enter('recordIncomeConvo'));
  bot.hears('📊 Laporan Hari Ini', async (ctx) => {
    const today = dayjs().startOf('day').toISOString();
    const tomorrow = dayjs().endOf('day').toISOString();
    const summary = await db.getSummary(today, tomorrow);
    await ctx.reply(formatSummaryMessage('Hari Ini', summary), { parse_mode: 'HTML' });
  });
  bot.hears('📈 Dashboard', async (ctx) => {
    await ctx.reply(
      '📈 Dashboard web sedang dalam pengembangan.\n\nGunakan /report week untuk laporan mingguan.',
      { parse_mode: 'HTML' }
    );
  });
  bot.hears('🤖 Tanya AI', async (ctx) => {
    await ctx.reply(
      'Ketik pertanyaan kamu tentang keuangan. Contoh:\n<i>"Berapa total pengeluaran makan minggu ini?"</i>',
      { parse_mode: 'HTML' }
    );
  });

  // ── /expense (quick command) ──────────────
  bot.command('expense', async (ctx) => {
    const args = ctx.match;
    if (!args) {
      return ctx.conversation.enter('recordExpenseConvo');
    }
    const parts = args.split(' ');
    // Optional DD/MM date prefix
    let dateArg = parseDatePrefix(parts[0]);
    const rest = dateArg ? parts.slice(1) : parts;
    const transactionDate = dateArg || new Date().toISOString();

    const amount = parseAmount(rest[0] || '');
    if (!amount) return ctx.reply('❌ Format: /expense [DD/MM] [nominal] [deskripsi]');
    const description = rest.slice(1).join(' ') || 'Pengeluaran';

    const categories = await db.getCategories('expense');
    const categoryId = await categorizeTransaction(description, undefined, 'expense', categories);

    const txn = await db.insertTransaction({
      type: 'expense',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: transactionDate,
    });

    const category = categories.find((c) => c.id === categoryId);
    const dateLabel = dateArg ? ` | 📅 ${dayjs(transactionDate).format('DD/MM')}` : '';
    await ctx.reply(
      `✅ Tercatat: -${formatRupiah(amount)} | ${description} | ${category?.icon || '📦'} ${category?.name || 'Uncategorized'}${dateLabel}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /income (quick command) ───────────────
  bot.command('income', async (ctx) => {
    const args = ctx.match;
    if (!args) {
      return ctx.conversation.enter('recordIncomeConvo');
    }
    const parts = args.split(' ');
    // Optional DD/MM date prefix
    let dateArg = parseDatePrefix(parts[0]);
    const rest = dateArg ? parts.slice(1) : parts;
    const transactionDate = dateArg || new Date().toISOString();

    const amount = parseAmount(rest[0] || '');
    if (!amount) return ctx.reply('❌ Format: /income [DD/MM] [nominal] [deskripsi]');
    const description = rest.slice(1).join(' ') || 'Pemasukan';

    const categories = await db.getCategories('income');
    const categoryId = await categorizeTransaction(description, undefined, 'income', categories);

    await db.insertTransaction({
      type: 'income',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: transactionDate,
    });

    const category = categories.find((c) => c.id === categoryId);
    await ctx.reply(
      `✅ Tercatat: +${formatRupiah(amount)} | ${description} | ${category?.icon || '📦'} ${category?.name || 'Uncategorized'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /balance ──────────────────────────────
  bot.command('balance', async (ctx) => {
    const accounts = await db.getAccounts();
    const lines = accounts.map((a) => `${a.icon} <b>${a.name}</b>: ${formatRupiah(a.balance)}`);
    const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    await ctx.reply(
      `🏦 <b>Saldo Akun</b>\n━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━\n💎 <b>Total: ${formatRupiah(total)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /report ───────────────────────────────
  bot.command('report', async (ctx) => {
    const period = ctx.match || 'today';
    let startDate: string, endDate: string, label: string;

    switch (period.toLowerCase()) {
      case 'week':
        startDate = dayjs().startOf('week').toISOString();
        endDate = dayjs().endOf('week').toISOString();
        label = 'Minggu Ini';
        break;
      case 'month':
        startDate = dayjs().startOf('month').toISOString();
        endDate = dayjs().endOf('month').toISOString();
        label = 'Bulan Ini';
        break;
      case 'year':
        startDate = dayjs().startOf('year').toISOString();
        endDate = dayjs().endOf('year').toISOString();
        label = 'Tahun Ini';
        break;
      default:
        startDate = dayjs().startOf('day').toISOString();
        endDate = dayjs().endOf('day').toISOString();
        label = 'Hari Ini';
    }

    const summary = await db.getSummary(startDate, endDate);
    const breakdown = await db.getCategoryBreakdown(startDate, endDate);

    let msg = formatSummaryMessage(label, summary);
    if (breakdown.length > 0) {
      msg += '\n\n📂 <b>Breakdown Kategori:</b>\n';
      breakdown.slice(0, 8).forEach((b) => {
        msg += `${b.category_icon} ${b.category_name}: ${formatRupiah(b.total_amount)} (${b.percentage}%)\n`;
      });
    }

    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // ── /undo ─────────────────────────────────
  bot.command('undo', async (ctx) => {
    const lastTxn = await db.getLastTransaction();
    if (!lastTxn) {
      return ctx.reply('❌ Tidak ada transaksi untuk di-undo.');
    }
    await db.softDeleteTransaction(lastTxn.id!);

    if (lastTxn.account_id) {
      const delta = lastTxn.type === 'income' ? -lastTxn.amount : lastTxn.amount;
      await db.updateAccountBalance(lastTxn.account_id, delta);
    }

    await ctx.reply(
      `↩️ Transaksi terakhir dibatalkan:\n${lastTxn.type === 'income' ? '+' : '-'}${formatRupiah(lastTxn.amount)} | ${lastTxn.description || '-'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /installment ──────────────────────────
  bot.command('installment', async (ctx) => {
    const raw = (ctx.match || '').toString().trim();

    // No args → list active installments
    if (!raw) {
      const list = await db.getInstallments('active');
      if (list.length === 0) {
        return ctx.reply(
          `💳 <b>Belum ada cicilan aktif</b>\n\n` +
            `Gunakan:\n` +
            `<code>/installment add Nama|monthly|total_months|akun|[due_day]|[kategori]</code>\n\n` +
            `Contoh:\n` +
            `<code>/installment add Laptop|500000|12|BCA|15|Elektronik</code>`,
          { parse_mode: 'HTML' }
        );
      }
      let msg = `💳 <b>Cicilan Aktif (${list.length})</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;
      list.forEach((inst, i) => {
        const remaining = inst.total_months - inst.paid_months;
        const progress = Math.round((inst.paid_months / inst.total_months) * 100);
        const totalRemaining = remaining * Number(inst.monthly_amount);
        msg += `\n${i + 1}. <b>${inst.name}</b>\n`;
        msg += `   💰 ${formatRupiah(inst.monthly_amount)}/bln × ${inst.total_months}\n`;
        msg += `   📊 ${inst.paid_months}/${inst.total_months} (${progress}%) — sisa ${formatRupiah(totalRemaining)}\n`;
        if (inst.due_day) msg += `   📅 Jatuh tempo tiap tgl ${inst.due_day}\n`;
        if (inst.account_name) msg += `   🏦 ${inst.account_name}\n`;
      });
      msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `<i>/installment pay &lt;nama&gt; — bayar 1 bulan\n`;
      msg += `/installment detail &lt;nama&gt; — lihat detail</i>`;
      return ctx.reply(msg, { parse_mode: 'HTML' });
    }

    const [cmd, ...rest] = raw.split(/\s+/);
    const argStr = rest.join(' ').trim();

    // ── add ──
    if (cmd === 'add') {
      const parts = argStr.split('|').map((p) => p.trim());
      // Format fixed:    Nama|monthly|total_months|akun|[due_day]|[kategori]
      // Format variable: Nama|1520593,1304533,...|akun|[due_day]|[kategori]
      if (parts.length < 3) {
        return ctx.reply(
          `❌ Format salah.\n\n` +
          `<b>Fixed:</b> <code>/installment add Nama|monthly|total_months|akun|[due_day]|[kategori]</code>\n` +
          `<b>Variable:</b> <code>/installment add Nama|1520000,1304533,1237800,...|akun|[due_day]|[kategori]</code>`,
          { parse_mode: 'HTML' }
        );
      }

      const [name, amountField, ...restParts] = parts;

      // Detect variable schedule (comma-separated amounts in field 2)
      const isVariable = amountField.includes(',');
      let monthly: number;
      let totalMonths: number;
      let schedule: string | undefined;
      let accountToken: string;
      let dueDayStr: string | undefined;
      let categoryToken: string | undefined;

      if (isVariable) {
        const amounts = amountField.split(',').map((s) => parseAmount(s.trim())).filter(Boolean) as number[];
        if (amounts.length < 1) return ctx.reply('❌ Schedule amount tidak valid.');
        schedule = amounts.join(',');
        totalMonths = amounts.length;
        monthly = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
        [accountToken, dueDayStr, categoryToken] = restParts;
      } else {
        const [monthlyStr, monthsStr, ...rest2] = restParts;
        monthly = parseAmount(amountField) || 0;
        totalMonths = parseInt(monthsStr || '');
        [accountToken, dueDayStr, categoryToken] = rest2;
        if (!monthly || !totalMonths || totalMonths < 1) {
          return ctx.reply('❌ Nominal / total_months tidak valid.');
        }
      }

      if (!name || !accountToken) return ctx.reply('❌ Nama atau akun tidak boleh kosong.');
      const accounts = await db.getAccounts();
      const account = matchAccount(accountToken, accounts);
      if (!account) return ctx.reply(`❌ Akun "${accountToken}" tidak ditemukan.`);

      let categoryId: string | undefined;
      let categoryLabel = '';
      if (categoryToken) {
        const cats = await db.getCategories('expense');
        const cat = cats.find((c) => c.name.toLowerCase().includes(categoryToken.toLowerCase()));
        if (cat) {
          categoryId = cat.id;
          categoryLabel = ` ${cat.icon} ${cat.name}`;
        }
      }

      const dueDay = dueDayStr ? parseInt(dueDayStr) : undefined;
      const existing = await db.getInstallmentByName(name);
      if (existing) return ctx.reply(`❌ Cicilan "${name}" sudah ada.`);

      const inst = await db.insertInstallment({
        name,
        monthly_amount: monthly,
        total_months: totalMonths,
        paid_months: 0,
        start_date: dayjs().format('YYYY-MM-DD'),
        due_day: dueDay,
        account_id: account.id,
        category_id: categoryId,
        schedule,
        status: 'active',
      });

      const total = schedule
        ? schedule.split(',').reduce((s, v) => s + Number(v), 0)
        : monthly * totalMonths;
      return ctx.reply(
        `✅ <b>Cicilan ditambahkan</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 <b>${inst.name}</b>\n` +
          (isVariable
            ? `💰 Variable ${totalMonths} bln = ${formatRupiah(total)}\n`
            : `💰 ${formatRupiah(monthly)}/bln × ${totalMonths} = ${formatRupiah(total)}\n`) +
          `🏦 ${account.name}${categoryLabel}\n` +
          (dueDay ? `📅 Jatuh tempo tiap tgl ${dueDay}\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Gunakan <code>/installment pay ${inst.name}</code> saat bayar.`,
        { parse_mode: 'HTML' }
      );
    }

    // ── pay ──
    if (cmd === 'pay') {
      if (!argStr) return ctx.reply('❌ Format: <code>/installment pay &lt;nama&gt; [x2] [amount]</code>', { parse_mode: 'HTML' });

      // Parse last token: "x2" → multi-month, number → amount override, else → 1 month
      const payTokens = argStr.trim().split(/\s+/);
      const lastToken = payTokens[payTokens.length - 1];
      const multiMatch = lastToken.match(/^x(\d+)$/i);
      const overrideAmount = !multiMatch ? parseAmount(lastToken) : null;
      const hasModifier = multiMatch || (overrideAmount && payTokens.length > 1);
      const instName = hasModifier ? payTokens.slice(0, -1).join(' ') : argStr;
      const monthCount = multiMatch ? parseInt(multiMatch[1]) : 1;

      const inst = await db.getInstallmentByName(instName);
      if (!inst) return ctx.reply(`❌ Cicilan "${instName}" tidak ditemukan.`);
      if (inst.status !== 'active') return ctx.reply(`❌ Cicilan "${inst.name}" sudah ${inst.status}.`);
      if (inst.paid_months >= inst.total_months) return ctx.reply(`❌ Cicilan "${inst.name}" sudah lunas.`);

      const maxPayable = inst.total_months - inst.paid_months;
      const actualCount = Math.min(monthCount, maxPayable);
      const scheduleAmounts = inst.schedule ? inst.schedule.split(',').map(Number) : null;

      // Determine per-month amounts
      const monthAmounts: number[] = [];
      for (let i = 0; i < actualCount; i++) {
        if (overrideAmount && actualCount === 1) {
          monthAmounts.push(overrideAmount);
        } else if (scheduleAmounts) {
          monthAmounts.push(scheduleAmounts[inst.paid_months + i] ?? Number(inst.monthly_amount));
        } else {
          monthAmounts.push(Number(inst.monthly_amount));
        }
      }

      const totalPayAmount = monthAmounts.reduce((s, v) => s + v, 0);
      const fromMonth = inst.paid_months + 1;
      const toMonth = inst.paid_months + actualCount;
      const descLabel = actualCount > 1
        ? `Cicilan ${inst.name} (${fromMonth}-${toMonth}/${inst.total_months})`
        : `Cicilan ${inst.name} (${fromMonth}/${inst.total_months})`;

      const txn = await db.insertTransaction({
        type: 'expense',
        amount: totalPayAmount,
        description: descLabel,
        category_id: inst.category_id,
        account_id: inst.account_id,
        installment_id: inst.id,
        source: 'manual_telegram',
        verified: true,
        transaction_date: new Date().toISOString(),
      });

      const newPaid = inst.paid_months + actualCount;
      if (inst.account_id) await db.updateAccountBalance(inst.account_id, -totalPayAmount);
      await db.setInstallmentPaid(inst.id, newPaid);

      sheets.syncTransaction({
        ...txn,
        category_name: inst.category_name,
        account_name: inst.account_name,
      }).catch(() => {});

      const remaining = inst.total_months - newPaid;
      const done = newPaid >= inst.total_months;

      const breakdown = actualCount > 1
        ? '\n' + monthAmounts.map((a, i) => `  Bulan ${fromMonth + i}: ${formatRupiah(a)}`).join('\n')
        : '';

      let nextInfo = '';
      if (!done && scheduleAmounts) {
        const nextAmt = scheduleAmounts[newPaid];
        if (nextAmt) nextInfo = `\n📅 Tagihan bulan depan: ${formatRupiah(nextAmt)}`;
      }

      return ctx.reply(
        `${done ? '🎉' : '✅'} <b>Pembayaran cicilan tercatat</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 ${inst.name}\n` +
          `💸 -${formatRupiah(totalPayAmount)}` + breakdown + '\n' +
          `📊 ${newPaid}/${inst.total_months}` +
          (done ? ' — <b>LUNAS!</b> 🎊' : ` (sisa ${remaining} bln)`) +
          nextInfo +
          `\n━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    // ── append ──
    if (cmd === 'append') {
      // Format: /installment append <name> amt1,amt2,...[|N]
      // N = 1-based month position to start merging (default = current calendar month)
      const appendTokens = argStr.trim().split(/\s+/);
      const rawField = appendTokens[appendTokens.length - 1];
      const instName = appendTokens.slice(0, -1).join(' ');

      if (!instName || !rawField) {
        return ctx.reply(
          `❌ Format: <code>/installment append &lt;nama&gt; amt1,amt2,...[|N]</code>\n\n` +
          `Contoh (mulai bulan ini):\n<code>/installment append SPayLater 500000,500000,500000</code>\n` +
          `Contoh (mulai bulan ke-5):\n<code>/installment append SPayLater 500000,500000,500000|5</code>`,
          { parse_mode: 'HTML' }
        );
      }

      const inst = await db.getInstallmentByName(instName);
      if (!inst) return ctx.reply(`❌ Cicilan "${instName}" tidak ditemukan.`);
      if (inst.status === 'completed' || inst.status === 'cancelled') {
        return ctx.reply(`❌ Cicilan "${inst.name}" sudah ${inst.status}, tidak bisa ditambah.`);
      }

      // Parse amounts and optional |N offset
      const [amountsStr, offsetStr] = rawField.split('|');
      const newAmounts = amountsStr.split(',').map((s) => parseAmount(s.trim()) ?? 0).filter(Boolean);
      if (newAmounts.length === 0) return ctx.reply('❌ Nominal tidak valid.');

      // Determine start index (0-based): default = current calendar month relative to start_date
      let startIdx: number;
      if (offsetStr) {
        startIdx = Math.max(0, parseInt(offsetStr) - 1); // user inputs 1-based
      } else {
        startIdx = Math.max(0, dayjs().startOf('month').diff(dayjs(inst.start_date).startOf('month'), 'month'));
      }

      // Build full existing schedule
      const existingFull: number[] = inst.schedule
        ? inst.schedule.split(',').map(Number)
        : Array(inst.total_months).fill(Number(inst.monthly_amount));

      // Merge: add new amounts starting at startIdx, extend if needed
      const newLen = Math.max(existingFull.length, startIdx + newAmounts.length);
      const merged: number[] = Array(newLen).fill(0).map((_, i) => existingFull[i] ?? 0);
      for (let i = 0; i < newAmounts.length; i++) {
        merged[startIdx + i] = (merged[startIdx + i] ?? 0) + newAmounts[i];
      }

      const newSchedule = merged.join(',');
      const newTotal = merged.length;
      await db.updateInstallmentSchedule(inst.id, newSchedule, newTotal);

      // Show upcoming from paid_months onward
      const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
      const unpaid = merged.slice(inst.paid_months);
      const startDisplay = dayjs(inst.start_date).add(inst.paid_months, 'month');
      let upcoming = '';
      unpaid.slice(0, 6).forEach((amt, i) => {
        const m = startDisplay.add(i, 'month');
        const isNew = (inst.paid_months + i) >= startIdx && (inst.paid_months + i) < startIdx + newAmounts.length;
        upcoming += `  ${monthNames[m.month()]} ${m.year()}: ${formatRupiah(amt)}${isNew ? ' ✨' : ''}\n`;
      });
      if (unpaid.length > 6) upcoming += `  ... +${unpaid.length - 6} bulan lagi\n`;

      const totalRemaining = unpaid.reduce((s, v) => s + v, 0);
      const startMonthName = monthNames[dayjs(inst.start_date).add(startIdx, 'month').month()];

      return ctx.reply(
        `✅ <b>Cicilan diperbarui</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 ${inst.name}\n` +
          `➕ Tambahan mulai bulan ke-${startIdx + 1} (${startMonthName})\n` +
          `📊 ${inst.paid_months}/${newTotal} (${unpaid.length} bln sisa)\n` +
          `💵 Total sisa: ${formatRupiah(totalRemaining)}\n\n` +
          `📋 <b>Tagihan ke depan</b> (✨ = baru ditambah):\n${upcoming}` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    // ── detail ──
    if (cmd === 'detail') {
      if (!argStr) return ctx.reply('❌ Format: <code>/installment detail &lt;nama&gt;</code>', { parse_mode: 'HTML' });
      const inst = await db.getInstallmentByName(argStr);
      if (!inst) return ctx.reply(`❌ Cicilan "${argStr}" tidak ditemukan.`);

      const remaining = inst.total_months - inst.paid_months;
      const progress = Math.round((inst.paid_months / inst.total_months) * 100);
      const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

      let totalAmt: number;
      let paidTotal: number;
      let scheduleInfo = '';

      if (inst.schedule) {
        const amounts = inst.schedule.split(',').map(Number);
        totalAmt = amounts.reduce((s, v) => s + v, 0);
        paidTotal = amounts.slice(0, inst.paid_months).reduce((s, v) => s + v, 0);
        const unpaidAmounts = amounts.slice(inst.paid_months);
        const remainingTotal = unpaidAmounts.reduce((s, v) => s + v, 0);

        scheduleInfo = `\n📋 <b>Sisa tagihan:</b>\n`;
        const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
        const startMonth = dayjs(inst.start_date).add(inst.paid_months, 'month');
        unpaidAmounts.slice(0, 6).forEach((amt, i) => {
          const m = startMonth.add(i, 'month');
          scheduleInfo += `  ${monthNames[m.month()]} ${m.year()}: ${formatRupiah(amt)}\n`;
        });
        if (unpaidAmounts.length > 6) scheduleInfo += `  ... +${unpaidAmounts.length - 6} bulan lagi\n`;
        scheduleInfo += `  Total sisa: <b>${formatRupiah(remainingTotal)}</b>`;
      } else {
        totalAmt = Number(inst.monthly_amount) * inst.total_months;
        paidTotal = Number(inst.monthly_amount) * inst.paid_months;
        const remainingTotal = Number(inst.monthly_amount) * remaining;
        scheduleInfo = `⏳ Sisa: ${remaining} bln (${formatRupiah(remainingTotal)})\n`;
      }

      return ctx.reply(
        `💳 <b>${inst.name}</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `📊 <code>${bar}</code> ${progress}%\n` +
          `💵 Total: ${formatRupiah(totalAmt)}\n` +
          `✅ Dibayar: ${inst.paid_months} bln (${formatRupiah(paidTotal)})\n` +
          scheduleInfo + '\n' +
          (inst.due_day ? `📅 Jatuh tempo tiap tgl ${inst.due_day}\n` : '') +
          (inst.account_name ? `🏦 ${inst.account_name}\n` : '') +
          (inst.category_name ? `📂 ${inst.category_icon || ''} ${inst.category_name}\n` : '') +
          `📌 Status: ${inst.status}\n` +
          `📆 Mulai: ${dayjs(inst.start_date).format('DD MMM YYYY')}\n` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    return ctx.reply(
      `❌ Subcommand tidak dikenal.\n\n` +
        `<code>/installment</code> — list aktif\n` +
        `<code>/installment add ...</code> — tambah\n` +
        `<code>/installment pay &lt;nama&gt; [x2]</code> — bayar 1 atau lebih bulan\n` +
        `<code>/installment append &lt;nama&gt; amt,amt,...</code> — tambah cicilan baru ke yang ada\n` +
        `<code>/installment detail &lt;nama&gt;</code> — lihat detail`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /transfer ─────────────────────────────
  bot.command('transfer', (ctx) => ctx.conversation.enter('recordTransferConvo'));
  bot.hears('🔄 Transfer', (ctx) => ctx.conversation.enter('recordTransferConvo'));

  // ── /category ─────────────────────────────
  bot.command('category', async (ctx) => {
    const categories = await db.getCategories();
    const expenseList = categories
      .filter((c) => c.type === 'expense')
      .map((c) => `${c.icon} ${c.name}`)
      .join('\n');
    const incomeList = categories
      .filter((c) => c.type === 'income')
      .map((c) => `${c.icon} ${c.name}`)
      .join('\n');

    await ctx.reply(
      `📂 <b>Kategori Aktif</b>\n\n` +
        `💸 <b>Pengeluaran:</b>\n${expenseList}\n\n` +
        `💰 <b>Pemasukan:</b>\n${incomeList}`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /sync ─────────────────────────────────
  bot.command('sync', async (ctx) => {
    await ctx.reply('🔄 Menyinkronkan data ke Google Sheets...');
    try {
      const transactions = await db.getRecentTransactions(1000);
      await sheets.syncAllTransactions(transactions);
      const accounts = await db.getAccounts();
      await sheets.syncAccounts(accounts);
      const installments = await db.getInstallments();
      await sheets.syncInstallments(installments);
      await ctx.reply('✅ Sinkronisasi ke Google Sheets selesai!', { reply_markup: mainMenu });
    } catch (err) {
      await ctx.reply(`❌ Gagal sync: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });

  // ── /reset ─────────────────────────────────
  bot.command('reset', async (ctx) => {
    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Ya, hapus semua', 'reset_confirm')
      .text('❌ Batal', 'reset_cancel');

    await ctx.reply(
      '⚠️ <b>RESET DATA</b>\n\nSemua transaksi akan dihapus permanen dan saldo akun di-reset ke 0.\n\nYakin?',
      { parse_mode: 'HTML', reply_markup: confirmKeyboard }
    );
  });

  bot.callbackQuery('reset_confirm', async (ctx) => {
    const count = await db.resetAllTransactions();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🗑️ Reset selesai! ${count} transaksi dihapus, semua saldo di-reset ke Rp 0.`,
    );
  });

  bot.callbackQuery('reset_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('👍 Reset dibatalkan.');
  });

  // ── /ask (AI Query) ───────────────────────
  bot.command('ask', async (ctx) => {
    const question = ctx.match;
    if (!question) {
      return ctx.reply('❓ Contoh: /ask Berapa pengeluaran terbesar bulan ini?');
    }

    await ctx.reply('🤔 Sedang menganalisis...');

    const monthlySummary = await db.getSummary(
      dayjs().startOf('month').toISOString(),
      dayjs().endOf('month').toISOString()
    );
    const breakdown = await db.getCategoryBreakdown(
      dayjs().startOf('month').toISOString(),
      dayjs().endOf('month').toISOString()
    );
    const recent = await db.getRecentTransactions(20);

    const dataContext = JSON.stringify(
      { monthlySummary, breakdown, recentTransactions: recent },
      null,
      2
    );
    const insight = await generateInsight(dataContext, question);

    await ctx.reply(`🤖 <b>AI Analysis</b>\n\n${insight}`, { parse_mode: 'HTML' });
  });

  // ── /bulk ─────────────────────────────────
  bot.command('bulk', async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) {
      waitingForBulk.add(ctx.chat!.id);
      setTimeout(() => waitingForBulk.delete(ctx.chat!.id), 10 * 60 * 1000);
      return ctx.reply(
        '📋 <b>Bulk Input</b>\n\n' +
          'Format per baris:\n' +
          '<code>DD/MM nominal deskripsi [akun]</code>\n\n' +
          'Contoh:\n' +
          '<code>01/04 50rb makan siang gopay\n01/04 200rb bensin bca\n02/04 15rb kopi\n+02/04 5jt gaji bsi\n03/04 80rb shopee tokopedia</code>\n\n' +
          '• Prefix <code>+</code> = income, default = expense\n' +
          '• Akun di akhir baris opsional (default: Cash)\n' +
          '• Nominal: <code>50rb</code> / <code>1.5jt</code> / <code>200000</code>\n\n' +
          '👇 <b>Kirim baris transaksi sekarang:</b>',
        { parse_mode: 'HTML' }
      );
    }

    const processingMsg = await ctx.reply('⏳ Memproses dan mengkategorisasi...');

    const lines = text.split('\n').filter((l) => l.trim());
    const [accounts, expenseCats, incomeCats] = await Promise.all([
      db.getAccounts(),
      db.getCategories('expense'),
      db.getCategories('income'),
    ]);

    const parsed = lines.map((line) => parseBulkLine(line, accounts));
    const valid = parsed.filter(Boolean) as Omit<BulkEntry, 'category_id' | 'category_name' | 'category_icon'>[];
    const invalidCount = lines.length - valid.length;

    if (valid.length === 0) {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Tidak ada baris yang valid.\n\nFormat: <code>DD/MM nominal deskripsi</code>', { parse_mode: 'HTML' });
    }

    // Batch kategorisasi: 1 OpenAI call untuk semua transaksi
    const categoryIds = await batchCategorizeTransactions(
      valid.map((e) => ({ description: e.description, type: e.type })),
      { expense: expenseCats, income: incomeCats }
    );

    const allCats = [...expenseCats, ...incomeCats];
    const entries: BulkEntry[] = valid.map((entry, i) => {
      const cat = allCats.find((c) => c.id === categoryIds[i]);
      return {
        ...entry,
        category_id: cat?.id,
        category_name: cat?.name || 'Lainnya',
        category_icon: cat?.icon || '📦',
      };
    });

    // Simpan ke pending sessions (expire 10 menit)
    const sessionId = Date.now().toString();
    pendingBulk.set(sessionId, entries);
    setTimeout(() => pendingBulk.delete(sessionId), 10 * 60 * 1000);

    // Build preview
    const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);

    let preview = `📋 <b>Preview Bulk Input (${entries.length} transaksi)</b>`;
    if (invalidCount > 0) preview += `\n⚠️ ${invalidCount} baris dilewati (format tidak valid)`;
    preview += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    entries.forEach((e, i) => {
      const sign = e.type === 'income' ? '+' : '-';
      preview += `${i + 1}. <b>${sign}${formatRupiah(e.amount)}</b> ${e.description}\n`;
      preview += `   📅 ${dayjs(e.date).format('DD/MM')} | ${e.category_icon} ${e.category_name} | ${e.account_name}\n`;
    });
    preview += '━━━━━━━━━━━━━━━━━━━━━\n';
    if (totalExpense > 0) preview += `💸 Total Expense: -${formatRupiah(totalExpense)}\n`;
    if (totalIncome > 0) preview += `💰 Total Income: +${formatRupiah(totalIncome)}\n`;

    const keyboard = new InlineKeyboard()
      .text(`✅ Simpan ${entries.length} Transaksi`, `bulk_confirm_${sessionId}`)
      .text('❌ Batal', `bulk_cancel_${sessionId}`);

    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(preview, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^bulk_confirm_(.+)$/, async (ctx) => {
    const sessionId = ctx.match![1];
    const entries = pendingBulk.get(sessionId);
    if (!entries) {
      await ctx.answerCallbackQuery('❌ Session expired, coba lagi.').catch(() => {});
      return ctx.editMessageText('❌ Session expired. Kirim ulang /bulk.');
    }

    await ctx.answerCallbackQuery('Menyimpan...').catch(() => {});
    await ctx.editMessageText(`⏳ Menyimpan ${entries.length} transaksi...`);

    let saved = 0;
    const errors: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const txn = await db.insertTransaction({
          type: e.type,
          amount: e.amount,
          description: e.description,
          category_id: e.category_id,
          account_id: e.account_id,
          source: 'manual_telegram',
          verified: true,
          transaction_date: e.date,
        });
        const delta = e.type === 'income' ? e.amount : -e.amount;
        await db.updateAccountBalance(e.account_id, delta);
        sheets.syncTransaction({ ...txn, category_name: e.category_name, account_name: e.account_name }).catch(() => {});
        saved++;
      } catch {
        errors.push(i + 1);
      }
    }

    pendingBulk.delete(sessionId);

    let resultMsg = `✅ <b>Bulk input selesai!</b>\n\n${saved}/${entries.length} transaksi berhasil disimpan.`;
    if (errors.length > 0) resultMsg += `\n⚠️ Gagal: baris ${errors.join(', ')}`;
    await ctx.editMessageText(resultMsg, { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^bulk_cancel_(.+)$/, async (ctx) => {
    pendingBulk.delete(ctx.match![1]);
    await ctx.answerCallbackQuery('Dibatalkan').catch(() => {});
    await ctx.editMessageText('❌ Bulk input dibatalkan.').catch(() => {});
  });

  // ── Handler: bulk input follow-up message ─
  bot.on('message:text', async (ctx) => {
    if (!waitingForBulk.has(ctx.chat!.id)) return;
    waitingForBulk.delete(ctx.chat!.id);

    const text = ctx.message.text.trim();
    const processingMsg = await ctx.reply('⏳ Memproses dan mengkategorisasi...');

    const lines = text.split('\n').filter((l) => l.trim());
    const [accounts, expenseCats, incomeCats] = await Promise.all([
      db.getAccounts(),
      db.getCategories('expense'),
      db.getCategories('income'),
    ]);

    const parsed = lines.map((line) => parseBulkLine(line, accounts));
    const valid = parsed.filter(Boolean) as Omit<BulkEntry, 'category_id' | 'category_name' | 'category_icon'>[];
    const invalidCount = lines.length - valid.length;

    if (valid.length === 0) {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Tidak ada baris yang valid.\n\nFormat: <code>DD/MM nominal deskripsi</code>', { parse_mode: 'HTML' });
    }

    const categoryIds = await batchCategorizeTransactions(
      valid.map((e) => ({ description: e.description, type: e.type })),
      { expense: expenseCats, income: incomeCats }
    );

    const allCats = [...expenseCats, ...incomeCats];
    const entries: BulkEntry[] = valid.map((entry, i) => {
      const cat = allCats.find((c) => c.id === categoryIds[i]);
      return {
        ...entry,
        category_id: cat?.id,
        category_name: cat?.name || 'Lainnya',
        category_icon: cat?.icon || '📦',
      };
    });

    const sessionId = Date.now().toString();
    pendingBulk.set(sessionId, entries);
    setTimeout(() => pendingBulk.delete(sessionId), 10 * 60 * 1000);

    const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);

    let preview = `📋 <b>Preview Bulk Input (${entries.length} transaksi)</b>`;
    if (invalidCount > 0) preview += `\n⚠️ ${invalidCount} baris dilewati (format tidak valid)`;
    preview += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    entries.forEach((e, i) => {
      const sign = e.type === 'income' ? '+' : '-';
      preview += `${i + 1}. <b>${sign}${formatRupiah(e.amount)}</b> ${e.description}\n`;
      preview += `   📅 ${dayjs(e.date).format('DD/MM')} | ${e.category_icon} ${e.category_name} | ${e.account_name}\n`;
    });
    preview += '━━━━━━━━━━━━━━━━━━━━━\n';
    if (totalExpense > 0) preview += `💸 Total Expense: -${formatRupiah(totalExpense)}\n`;
    if (totalIncome > 0) preview += `💰 Total Income: +${formatRupiah(totalIncome)}\n`;

    const keyboard = new InlineKeyboard()
      .text(`✅ Simpan ${entries.length} Transaksi`, `bulk_confirm_${sessionId}`)
      .text('❌ Batal', `bulk_cancel_${sessionId}`);

    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(preview, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // ── Callback: email transaction confirm ───
  bot.callbackQuery(/^confirm_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    const { error } = await db.confirmTransaction(txnId);
    await ctx.answerCallbackQuery('✅ Transaksi dikonfirmasi!').catch(() => {});
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n✅ Verified', {
      parse_mode: 'HTML',
    }).catch(() => {});
  });

  bot.callbackQuery(/^delete_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await db.softDeleteTransaction(txnId);
    await ctx.answerCallbackQuery('❌ Transaksi dihapus!').catch(() => {});
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n❌ Deleted', {
      parse_mode: 'HTML',
    }).catch(() => {});
  });

  // ── Global error handler ─────────────────
  bot.catch((err) => {
    console.error('Bot error:', err.message);
  });

  return bot;
}
