import { Bot, Context, session, InlineKeyboard, Keyboard } from 'grammy';
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from '@grammyjs/conversations';
import { config } from './config';
import { db } from './services/supabase';
import { sheets } from './services/sheets';
import { categorizeTransaction, generateInsight } from './services/openai';
import {
  formatRupiah,
  formatTransactionMessage,
  formatSummaryMessage,
  parseAmount,
} from './services/formatter';
import dayjs from 'dayjs';

// ── Types ───────────────────────────────────
type MyContext = Context & ConversationFlavor;
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

  // Middleware
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(ownerOnly);

  // ── Conversation: Record Expense ──────────
  async function recordExpenseConvo(conversation: MyConversation, ctx: MyContext) {
    await ctx.reply('Masukkan nominal pengeluaran:', {
      reply_markup: { force_reply: true },
    });
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
      transaction_date: new Date().toISOString(),
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
    await ctx.reply('Masukkan nominal pemasukan:', {
      reply_markup: { force_reply: true },
    });
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
      transaction_date: new Date().toISOString(),
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
    const amount = parseAmount(parts[0]);
    if (!amount) return ctx.reply('❌ Format: /expense [nominal] [deskripsi]');
    const description = parts.slice(1).join(' ') || 'Pengeluaran';

    const categories = await db.getCategories('expense');
    const categoryId = await categorizeTransaction(description, undefined, 'expense', categories);

    const txn = await db.insertTransaction({
      type: 'expense',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    const category = categories.find((c) => c.id === categoryId);
    await ctx.reply(
      `✅ Tercatat: -${formatRupiah(amount)} | ${description} | ${category?.icon || '📦'} ${category?.name || 'Uncategorized'}`,
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
    const amount = parseAmount(parts[0]);
    if (!amount) return ctx.reply('❌ Format: /income [nominal] [deskripsi]');
    const description = parts.slice(1).join(' ') || 'Pemasukan';

    const categories = await db.getCategories('income');
    const categoryId = await categorizeTransaction(description, undefined, 'income', categories);

    await db.insertTransaction({
      type: 'income',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
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

  // ── Callback: email transaction confirm ───
  bot.callbackQuery(/^confirm_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    const { error } = await db.confirmTransaction(txnId);
    await ctx.answerCallbackQuery('✅ Transaksi dikonfirmasi!');
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n✅ Verified', {
      parse_mode: 'HTML',
    });
  });

  bot.callbackQuery(/^delete_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await db.softDeleteTransaction(txnId);
    await ctx.answerCallbackQuery('❌ Transaksi dihapus!');
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n❌ Deleted', {
      parse_mode: 'HTML',
    });
  });

  return bot;
}
