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
import { Account, Category, Transaction } from './types';

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

// Conservative: exact match or account name contains the token (no reverse partial)
function matchAccountStrict(token: string, accounts: Account[]): Account | null {
  const lower = token.toLowerCase();
  return (
    accounts.find((a) => a.name.toLowerCase() === lower) ||
    accounts.find((a) => a.name.toLowerCase().includes(lower)) ||
    null
  );
}

// Parse optional date prefix "DD/MM" or "DD/MM/YYYY", returns ISO string or null
function parseDatePrefix(token: string): string | null {
  const m = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3]) : dayjs().year();
  const now = dayjs();
  const d = dayjs(`${year}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[1])).padStart(2, '0')}`)
    .hour(now.hour())
    .minute(now.minute())
    .second(now.second())
    .millisecond(0);
  return d.isValid() ? d.toISOString() : null;
}

function splitInstallmentAmounts(total: number, tenor: number): number[] {
  const base = Math.floor(total / tenor);
  const rem = total - base * tenor;
  const months = Array(tenor).fill(base);
  if (rem > 0) months[0] += rem;
  return months;
}

function parseExpenseInstallmentToken(token: string): { name: string; tenor: number; startMonth?: number } | null {
  const m = token.match(/^cicilan:(.+)\/(\d+)(?:\/(\d+))?$/i);
  if (!m) return null;

  const name = m[1].trim();
  const tenor = parseInt(m[2]);
  const startMonth = m[3] ? parseInt(m[3]) : undefined;

  if (!name || !tenor || tenor < 1) return null;
  if (startMonth !== undefined && startMonth < 1) return null;

  return { name, tenor, startMonth };
}

function parseBulkLine(
  line: string,
  accounts: Account[]
): Omit<BulkEntry, 'category_id' | 'category_name'> | null {
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
    return ctx.reply('Bot ini hanya untuk pemiliknya.');
  }
  return next();
}

// ── Main Menu Keyboard ──────────────────────
const mainMenu = new Keyboard()
  .text('Catat Income')
  .text('Catat Expense')
  .row()
  .text('Transfer')
  .text('Tarik ATM')
  .row()
  .text('Laporan Hari Ini')
  .text('Dashboard')
  .row()
  .text('Tanya AI')
  .text('Pengaturan')
  .resized()
  .persistent();

// Chat IDs yang sedang menunggu input edit
const waitingForEdit = new Map<number, { txnId: string; field: 'description' | 'amount' }>();
// Chat IDs yang sedang menunggu pilihan kategori untuk transaksi tertentu
const waitingForEditCategory = new Map<number, string>();

function buildBalanceSnapshots(args: {
  type: Transaction['type'];
  fromMutation?: { before: number; after: number } | null;
  toMutation?: { before: number; after: number } | null;
}) {
  const { type, fromMutation, toMutation } = args;
  const snapshots: Partial<Transaction> = {};

  if (type === 'income' || type === 'expense') {
    if (fromMutation) {
      snapshots.balance_before = fromMutation.before;
      snapshots.balance_after = fromMutation.after;
    }
    return snapshots;
  }

  if (type === 'transfer') {
    if (fromMutation) {
      snapshots.balance_before = fromMutation.before;
      snapshots.balance_after = fromMutation.after;
    }
    if (toMutation) {
      snapshots.to_balance_before = toMutation.before;
      snapshots.to_balance_after = toMutation.after;
    }
    return snapshots;
  }

  return snapshots;
}

async function insertTransactionWithBalanceSnapshots(
  input: Omit<Transaction, 'id'>
): Promise<Transaction> {
  if (input.type === 'transfer') {
    if (!input.account_id || !input.to_account_id) {
      return db.insertTransaction(input);
    }

    const fromMutation = await db.updateAccountBalance(input.account_id, -input.amount);
    try {
      const toMutation = await db.updateAccountBalance(input.to_account_id, input.amount);
      try {
        return await db.insertTransaction({
          ...input,
          ...buildBalanceSnapshots({
            type: input.type,
            fromMutation,
            toMutation,
          }),
        });
      } catch (insertError) {
        await db.updateAccountBalance(input.account_id, input.amount);
        await db.updateAccountBalance(input.to_account_id, -input.amount);
        throw insertError;
      }
    } catch (toError) {
      await db.updateAccountBalance(input.account_id, input.amount);
      throw toError;
    }
  }

  if (!input.account_id) {
    return db.insertTransaction(input);
  }

  const delta = input.type === 'income' ? input.amount : -input.amount;
  const mutation = await db.updateAccountBalance(input.account_id, delta);

  try {
    return await db.insertTransaction({
      ...input,
      ...buildBalanceSnapshots({
        type: input.type,
        fromMutation: mutation,
      }),
    });
  } catch (insertError) {
    await db.updateAccountBalance(input.account_id, -delta);
    throw insertError;
  }
}


function isHelpRequest(raw: unknown): boolean {
  const s = (raw || '').toString().trim().toLowerCase();
  return s === 'help' || s === 'bantuan' || s === '-h' || s === '--help' || s === '?';
}

const HELP_MESSAGES = {
  main:
    `<b>Bantuan Command</b>\n\n` +
    `<b>Umum</b>\n` +
    `• <code>/start help</code>\n` +
    `• <code>/help [topik]</code>\n\n` +
    `<b>Transaksi</b>\n` +
    `• <code>/expense help</code> — catat pengeluaran (normal + cicilan)\n` +
    `• <code>/income help</code> — catat pemasukan\n` +
    `• <code>/transfer help</code> — transfer antar akun\n` +
    `• <code>/withdraw help</code> — tarik ATM (bank → cash)\n` +
    `• <code>/bulk help</code> — input banyak transaksi\n\n` +
    `<b>Monitoring</b>\n` +
    `• <code>/balance help</code>\n` +
    `• <code>/report help</code>\n` +
    `• <code>/category help</code>\n` +
    `• <code>/ask help</code>\n\n` +
    `<b>Cicilan & maintenance</b>\n` +
    `• <code>/installment help</code>\n` +
    `• <code>/edit help</code>\n` +
    `• <code>/undo help</code>\n` +
    `• <code>/sync help</code>\n` +
    `• <code>/reset help</code>\n\n` +
    `<i>Tip: pakai pola <code>/nama_command help</code> kapanpun kamu lupa format.</i>`,

  expense:
    `<b>Bantuan /expense</b>\n\n` +
    `<b>1) Mode interaktif</b>\n` +
    `<code>/expense</code>\n` +
    `Bot akan tanya tanggal, nominal, deskripsi, kategori, lalu metode bayar (akun / cicilan).\n\n` +
    `<b>2) Quick command normal (tanpa metode bayar)</b>\n` +
    `<code>/expense [DD/MM] [nominal] [deskripsi]</code>\n` +
    `Contoh:\n` +
    `<code>/expense 10/04 75rb makan siang</code>\n` +
    `<code>/expense 150rb bensin pertamax</code>\n` +
    `<i>Jika tanpa <code>akun:</code>, default pakai akun <code>Cash</code> (kalau ada). Jika tidak ada, pakai akun aktif pertama.</i>\n\n` +
    `<b>3) Quick command bayar dari akun</b>\n` +
    `<code>/expense [DD/MM] [nominal] [deskripsi] akun:NamaAkun</code>\n` +
    `Contoh:\n` +
    `<code>/expense 10/04 75rb makan siang akun:GoPay</code>\n` +
    `<code>/expense 200rb bensin akun:BCA</code>\n` +
    `<i>Jika pakai <code>akun:</code>, saldo akun akan berkurang.</i>\n\n` +
    `<b>4) Quick command cicilan</b>\n` +
    `<code>/expense [DD/MM] [nominal] [deskripsi] cicilan:Nama/tenor[/startBulan]</code>\n` +
    `Contoh:\n` +
    `<code>/expense 10/04 1500000 beli kursi cicilan:SPayLater/6</code>\n` +
    `<code>/expense 1500000 beli monitor cicilan:SPayLater/6/5</code>\n\n` +
    `<i>startBulan opsional. Kalau kosong, default bulan sekarang.</i>`,

  income:
    `<b>Bantuan /income</b>\n\n` +
    `<b>1) Mode interaktif</b>\n` +
    `<code>/income</code>\n\n` +
    `<b>2) Quick command</b>\n` +
    `<code>/income [DD/MM] [nominal] [deskripsi]</code>\n` +
    `Contoh:\n` +
    `<code>/income 10/04 5jt gaji</code>\n` +
    `<code>/income 250rb cashback tokopedia</code>\n\n` +
    `<i>Quick command otomatis masuk ke akun default (Cash jika ada).</i>`,

  transfer:
    `<b>Bantuan /transfer</b>\n\n` +
    `<code>/transfer</code>\n\n` +
    `Flow interaktif: nominal → akun sumber → akun tujuan.\n` +
    `Contoh penggunaan: pindah saldo BCA ke GoPay.`,

  withdraw:
    `<b>Bantuan /withdraw</b>\n\n` +
    `<code>/withdraw &lt;nominal&gt; [bank]</code>\n\n` +
    `Contoh:\n` +
    `<code>/withdraw 50rb BCA</code>\n` +
    `<code>/withdraw 200000 BSI</code>\n\n` +
    `<i>Jika bank tidak diisi, bot pakai akun bank pertama yang ditemukan.</i>`,

  balance:
    `<b>Bantuan /balance</b>\n\n` +
    `<code>/balance</code>\n` +
    `Menampilkan saldo semua akun + total.\n\n` +
    `<code>/balance adjust &lt;akun&gt; &lt;nominal_baru&gt; [catatan]</code>\n` +
    `Contoh:\n` +
    `<code>/balance adjust BCA 5500000 koreksi mutasi april</code>`,

  report:
    `<b>Bantuan /report</b>\n\n` +
    `<code>/report [today|week|month|year]</code>\n\n` +
    `Contoh:\n` +
    `<code>/report</code> (default: today)\n` +
    `<code>/report week</code>\n` +
    `<code>/report month</code>\n` +
    `<code>/report year</code>`,

  edit:
    `<b>Bantuan /edit</b>\n\n` +
    `<code>/edit</code> → edit transaksi terakhir\n` +
    `<code>/edit &lt;id_pendek&gt;</code> → edit transaksi tertentu\n\n` +
    `Contoh:\n` +
    `<code>/edit</code>\n` +
    `<code>/edit a1b2c3d4</code>\n\n` +
    `<i>ID pendek adalah 8 karakter pertama UUID transaksi.</i>`,

  undo:
    `<b>Bantuan /undo</b>\n\n` +
    `<code>/undo</code>\n\n` +
    `Membatalkan (soft delete) transaksi terakhir dan menyesuaikan saldo akun terkait.`,

  installment:
    `<b>Bantuan /installment</b>\n\n` +
    `<code>/installment</code> — list cicilan aktif\n\n` +
    `<b>Tambah cicilan</b>\n` +
    `<code>/installment add Nama|monthly|total_months|akun|[due_day]|[kategori]</code>\n` +
    `<code>/installment add Nama|amt1,amt2,amt3|akun|[due_day]|[kategori]</code>\n\n` +
    `<b>Bayar cicilan</b>\n` +
    `<code>/installment pay &lt;nama&gt; [x2] [amount]</code>\n\n` +
    `<b>Append cicilan baru ke existing</b>\n` +
    `<code>/installment append &lt;nama&gt; amt1,amt2,...[|N]</code>\n\n` +
    `<b>Detail</b>\n` +
    `<code>/installment detail &lt;nama&gt;</code>`,

  category:
    `<b>Bantuan /category</b>\n\n` +
    `<code>/category</code>\n\n` +
    `Menampilkan daftar kategori expense & income yang aktif.`,

  sync:
    `<b>Bantuan /sync</b>\n\n` +
    `<code>/sync</code>\n\n` +
    `Sinkronisasi transaksi, akun, dan cicilan ke Google Sheets.`,

  reset:
    `<b>Bantuan /reset</b>\n\n` +
    `<code>/reset</code>\n\n` +
    `Menghapus semua transaksi dan reset semua saldo ke 0 (ada konfirmasi).`,

  ask:
    `<b>Bantuan /ask</b>\n\n` +
    `<code>/ask &lt;pertanyaan&gt;</code>\n\n` +
    `Contoh:\n` +
    `<code>/ask Berapa pengeluaran terbesar bulan ini?</code>\n` +
    `<code>/ask Cashflow minggu ini gimana?</code>`,

  bulk:
    `<b>Bantuan /bulk</b>\n\n` +
    `<b>Mode 1</b>: ketik <code>/bulk</code>, lalu kirim baris transaksi\n` +
    `<b>Mode 2</b>: langsung kirim setelah command /bulk dalam 1 pesan multi-baris\n\n` +
    `Format per baris:\n` +
    `<code>DD/MM nominal deskripsi [akun]</code>\n\n` +
    `Contoh:\n` +
    `<code>01/04 50rb makan siang gopay\n01/04 200rb bensin bca\n+02/04 5jt gaji bsi</code>\n\n` +
    `• Prefix <code>+</code> = income\n` +
    `• Akun opsional (default Cash)`,
} as const;

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
      .text(`Hari ini (${dayjs().format('DD/MM')})`, 'date_today')
      .text(`Kemarin (${dayjs().subtract(1, 'day').format('DD/MM')})`, 'date_yesterday')
      .row()
      .text('Tanggal lain...', 'date_custom');
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
      return ctx.reply('Nominal tidak valid. Coba lagi dengan /expense');
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
      catKeyboard.text(`${suggested.name}`, `cat_${suggested.id}`).row();
    }
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(`${formatRupiah(amount)} — ${description}\n\nPilih kategori:`, {
      reply_markup: catKeyboard,
    });

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.callbackQuery.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    // Pilih akun ATAU via cicilan
    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accKeyboard.text('Via Cicilan', 'acc_CICILAN').row();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Bayar dari mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.callbackQuery.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    // ── Path: Via Cicilan ────────────────────────────────────────────
    if (accountId === 'CICILAN') {
      const installments = await db.getInstallments('active');

      const instKeyboard = new InlineKeyboard();
      installments.forEach((inst, i) => {
        instKeyboard.text(`${inst.name}`, `inst_${inst.id}`);
        if (i % 2 === 1) instKeyboard.row();
      });
      instKeyboard.row().text('Buat Cicilan Baru', 'inst_new');

      await ctx.reply(
        installments.length > 0 ? 'Pilih cicilan:' : 'Belum ada cicilan aktif. Buat cicilan baru:',
        { reply_markup: instKeyboard }
      );

      const instCallback = await conversation.waitForCallbackQuery(/^inst_/);
      await instCallback.answerCallbackQuery();

      let tenor = 0;
      let startMonth = 1;
      let installmentName = '';
      let installmentStartDate = dayjs().startOf('month').toISOString();
      let isNewInstallment = false;
      let targetInstallmentId: string | undefined;

      if (instCallback.callbackQuery.data === 'inst_new') {
        isNewInstallment = true;

        await ctx.reply('Nama cicilan baru? (contoh: SPayLater Gadget)', { reply_markup: { force_reply: true } });
        const nameMsg = await conversation.wait();
        installmentName = (nameMsg.message?.text || '').trim();
        if (!installmentName) return ctx.reply('Nama cicilan tidak boleh kosong.');

        const existing = await db.getInstallmentByName(installmentName);
        if (existing) {
          return ctx.reply(`Cicilan "${installmentName}" sudah ada. Pilih dari daftar cicilan yang ada.`, { reply_markup: mainMenu });
        }
      } else {
        targetInstallmentId = instCallback.callbackQuery.data?.replace('inst_', '');
        const selectedInst = installments.find((i) => i.id === targetInstallmentId);
        if (!selectedInst) return ctx.reply('Cicilan tidak ditemukan.', { reply_markup: mainMenu });

        installmentName = selectedInst.name;
        installmentStartDate = selectedInst.start_date;

        startMonth = Math.max(
          1,
          dayjs().startOf('month').diff(dayjs(selectedInst.start_date).startOf('month'), 'month') + 1
        );

        const startKeyboard = new InlineKeyboard()
          .text(`Bulan ini (ke-${startMonth})`, 'start_current')
          .text('Tentukan sendiri', 'start_custom');

        await ctx.reply('Mulai append dari bulan ke berapa?', { reply_markup: startKeyboard });
        const startCallback = await conversation.waitForCallbackQuery(/^start_/);
        await startCallback.answerCallbackQuery();

        if (startCallback.callbackQuery.data === 'start_custom') {
          await ctx.reply('Mulai bulan ke- (angka):', { reply_markup: { force_reply: true } });
          const startMsg = await conversation.wait();
          const parsed = parseInt(startMsg.message?.text || '0');
          if (parsed >= 1) startMonth = parsed;
        }
      }

      await ctx.reply(
        `<b>${installmentName || 'Cicilan Baru'}</b>\n\nTenor berapa bulan? (ketik angka, misal: <code>6</code>)`,
        { parse_mode: 'HTML', reply_markup: { force_reply: true } }
      );
      const tenorMsg = await conversation.wait();
      tenor = parseInt(tenorMsg.message?.text || '0');
      if (!tenor || tenor < 1) {
        return ctx.reply('Tenor tidak valid. Coba lagi dengan /expense');
      }

      const monthAmounts = splitInstallmentAmounts(amount, tenor);
      const base = Math.floor(amount / tenor);
      const rem = amount - base * tenor;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
      let finalPreview = '';
      monthAmounts.slice(0, 4).forEach((amt, i) => {
        const d = dayjs(installmentStartDate).add(startMonth - 1 + i, 'month');
        finalPreview += `  ${monthNames[d.month()]} ${d.year()}: ${formatRupiah(amt)}\n`;
      });
      if (tenor > 4) finalPreview += `  ... +${tenor - 4} bulan lagi\n`;

      const confirmKeyboard = new InlineKeyboard()
        .text('Konfirmasi', 'confirm_yes')
        .text('Batal', 'confirm_no');

      await ctx.reply(
        `<b>Konfirmasi Cicilan</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `${description}\n` +
          `${installmentName}\n` +
          `Total: ${formatRupiah(amount)}\n` +
          `${tenor} bulan${isNewInstallment ? '' : ` mulai bulan ke-${startMonth}`}\n\n` +
          `Rincian:\n${finalPreview}` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Balance akun <b>tidak</b> langsung berkurang.`,
        { parse_mode: 'HTML', reply_markup: confirmKeyboard }
      );

      const confirmCallback = await conversation.waitForCallbackQuery(/^confirm_/);
      await confirmCallback.answerCallbackQuery();

      if (confirmCallback.callbackQuery.data === 'confirm_no') {
        return ctx.reply('Dibatalkan.', { reply_markup: mainMenu });
      }

      if (isNewInstallment) {
        const createdInst = await db.insertInstallment(
          {
            name: installmentName,
            monthly_amount: base,
            total_months: tenor,
            paid_months: 0,
            start_date: dayjs().startOf('month').toISOString(),
            due_day: undefined,
            account_id: undefined,
            category_id: categoryId,
            status: 'active',
            notes: 'Dibuat otomatis dari /expense cicilan',
          },
          monthAmounts
        );
        targetInstallmentId = createdInst.id;
      } else {
        await db.appendInstallmentMonths(targetInstallmentId!, monthAmounts, startMonth);
      }

      // Simpan transaksi (tanpa account_id → balance tidak berkurang)
      const category = categories.find((c) => c.id === categoryId);
      const txn = await insertTransactionWithBalanceSnapshots({
        type: 'expense',
        amount,
        description,
        category_id: categoryId,
        account_id: undefined,
        installment_id: targetInstallmentId,
        source: 'manual_telegram',
        transaction_date: transactionDate,
      });

      sheets.syncTransaction({ ...txn, category_name: category?.name }).catch(() => {});

      return ctx.reply(
        `<b>Pembelian via cicilan tercatat</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `${description}\n` +
          `${installmentName}\n` +
          `Total: ${formatRupiah(amount)}\n` +
          `${tenor} bulan × ${formatRupiah(base)}${rem > 0 ? ` (bln 1: ${formatRupiah(base + rem)})` : ''}\n\n` +
          `<i>Gunakan /installment pay ${installmentName} saat bayar tiap bulan.</i>`,
        { parse_mode: 'HTML', reply_markup: mainMenu }
      );
    }

    // ── Path: Normal (via akun) ──────────────────────────────────────
    const txn = await insertTransactionWithBalanceSnapshots({
      type: 'expense',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      transaction_date: transactionDate,
    });

    const category = categories.find((c) => c.id === categoryId);
    const account = accounts.find((a) => a.id === accountId);

    sheets.syncTransaction({ ...txn, category_name: category?.name, account_name: account?.name }).catch(() => {});

    await ctx.reply(
      formatTransactionMessage({
        type: 'expense',
        amount,
        description,
        category_name: category?.name,
                account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // ── Conversation: Record Income ───────────
  async function recordIncomeConvo(conversation: MyConversation, ctx: MyContext) {
    // Step 0: Tanggal
    const dateKeyboard = new InlineKeyboard()
      .text(`Hari ini (${dayjs().format('DD/MM')})`, 'date_today')
      .text(`Kemarin (${dayjs().subtract(1, 'day').format('DD/MM')})`, 'date_yesterday')
      .row()
      .text('Tanggal lain...', 'date_custom');
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
      return ctx.reply('Nominal tidak valid. Coba lagi.');
    }

    await ctx.reply('Deskripsi singkat:', { reply_markup: { force_reply: true } });
    const descMsg = await conversation.wait();
    const description = descMsg.message?.text || '';

    const categories = await db.getCategories('income');
    const suggestedId = await categorizeTransaction(description, undefined, 'income', categories);
    const suggested = categories.find((c) => c.id === suggestedId);

    const catKeyboard = new InlineKeyboard();
    if (suggested) {
      catKeyboard.text(`${suggested.name}`, `cat_${suggested.id}`).row();
    }
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(`${formatRupiah(amount)} — ${description}\n\nPilih kategori:`, {
      reply_markup: catKeyboard,
    });

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.callbackQuery.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Masuk ke akun mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.callbackQuery.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    const txn = await insertTransactionWithBalanceSnapshots({
      type: 'income',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      transaction_date: transactionDate,
    });

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
                account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // ── Conversation: Record Transfer ────────
  async function recordTransferConvo(conversation: MyConversation, ctx: MyContext) {
    await ctx.reply('Masukkan nominal transfer:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) return ctx.reply('Nominal tidak valid. Coba lagi dengan /transfer');

    // Pilih akun sumber
    const accounts = await db.getAccounts();
    const fromKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      fromKeyboard.text(`${a.name}`, `from_${a.id}`);
      if (i % 3 === 2) fromKeyboard.row();
    });

    await ctx.reply(`${formatRupiah(amount)}\n\nDari akun mana?`, { reply_markup: fromKeyboard });
    const fromCallback = await conversation.waitForCallbackQuery(/^from_/);
    const fromAccountId = fromCallback.callbackQuery.data?.replace('from_', '');
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    await fromCallback.answerCallbackQuery();

    // Pilih akun tujuan (exclude akun sumber)
    const toKeyboard = new InlineKeyboard();
    accounts
      .filter((a) => a.id !== fromAccountId)
      .forEach((a, i) => {
        toKeyboard.text(`${a.name}`, `to_${a.id}`);
        if (i % 3 === 2) toKeyboard.row();
      });

    await ctx.reply(`Ke akun mana? (dari ${fromAccount?.name})`, {
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

    const txn = await insertTransactionWithBalanceSnapshots({
      type: 'transfer',
      amount,
      description,
      account_id: fromAccountId,
      to_account_id: toAccountId,
      source: 'manual_telegram',
      transaction_date: new Date().toISOString(),
    });

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
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(
        `<b>Bantuan /start</b>\n\n` +
          `<code>/start</code>\n\n` +
          `Fungsi: menampilkan sapaan awal + keyboard menu utama.`,
        { parse_mode: 'HTML' }
      );
    }

    await ctx.reply(
      '<b>Halo! Aku Finance Tracker Bot kamu.</b>\n\n' +
        'Aku bisa bantu catat semua income & expense kamu, ' +
        'baik manual maupun otomatis dari email.\n\n' +
        'Gunakan menu di bawah atau ketik /help untuk bantuan.',
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  });

  // ── /help ─────────────────────────────────
  bot.command('help', async (ctx) => {
    const raw = (ctx.match || '').toString().trim().toLowerCase();

    if (!raw) return ctx.reply(HELP_MESSAGES.main, { parse_mode: 'HTML' });

    const key = raw as keyof typeof HELP_MESSAGES;
    if (HELP_MESSAGES[key]) return ctx.reply(HELP_MESSAGES[key], { parse_mode: 'HTML' });

    return ctx.reply(
      `Topik bantuan tidak ditemukan: <code>${raw}</code>\n\nGunakan <code>/help</code> untuk lihat daftar topik.`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Menu button handlers ──────────────────
  bot.hears('Catat Expense', (ctx) => ctx.conversation.enter('recordExpenseConvo'));
  bot.hears('Catat Income', (ctx) => ctx.conversation.enter('recordIncomeConvo'));
  bot.hears('Laporan Hari Ini', async (ctx) => {
    const today = dayjs().startOf('day').toISOString();
    const tomorrow = dayjs().endOf('day').toISOString();
    const summary = await db.getSummary(today, tomorrow);
    await ctx.reply(formatSummaryMessage('Hari Ini', summary), { parse_mode: 'HTML' });
  });
  bot.hears('Dashboard', async (ctx) => {
    await ctx.reply(
      'Dashboard web sedang dalam pengembangan.\n\nGunakan /report week untuk laporan mingguan.',
      { parse_mode: 'HTML' }
    );
  });
  bot.hears('Tanya AI', async (ctx) => {
    await ctx.reply(
      'Ketik pertanyaan kamu tentang keuangan. Contoh:\n<i>"Berapa total pengeluaran makan minggu ini?"</i>',
      { parse_mode: 'HTML' }
    );
  });

  // ── /expense (quick command) ──────────────
  bot.command('expense', async (ctx) => {
    const args = (ctx.match || '').toString().trim();
    if (isHelpRequest(args)) {
      return ctx.reply(HELP_MESSAGES.expense, { parse_mode: 'HTML' });
    }
    if (!args) {
      return ctx.conversation.enter('recordExpenseConvo');
    }
    const parts = args.split(' ');
    // Optional DD/MM date prefix
    let dateArg = parseDatePrefix(parts[0]);
    const rest = dateArg ? parts.slice(1) : parts;
    const transactionDate = dateArg || new Date().toISOString();

    const amount = parseAmount(rest[0] || '');
    if (!amount) {
      return ctx.reply(
        'Format:\n' +
          '<code>/expense [DD/MM] [nominal] [deskripsi]</code>\n' +
          '<code>/expense [DD/MM] [nominal] [deskripsi] cicilan:Nama/tenor[/startBulan]</code>',
        { parse_mode: 'HTML' }
      );
    }

    const lastToken = rest[rest.length - 1] || '';
    const installmentToken = lastToken.toLowerCase().startsWith('cicilan:') ? lastToken : null;
    const accountToken = lastToken.toLowerCase().startsWith('akun:') ? lastToken : null;

    const installmentMeta = installmentToken ? parseExpenseInstallmentToken(installmentToken) : null;
    if (installmentToken && !installmentMeta) {
      return ctx.reply(
        'Format cicilan inline salah.\nGunakan: <code>cicilan:Nama/tenor[/startBulan]</code>\nContoh: <code>cicilan:SPayLater/6</code> atau <code>cicilan:SPayLater/6/5</code>',
        { parse_mode: 'HTML' }
      );
    }

    const accountNameInline = accountToken ? accountToken.slice(5).trim() : '';
    if (accountToken && !accountNameInline) {
      return ctx.reply('Format akun inline salah. Gunakan: <code>akun:NamaAkun</code> (contoh: <code>akun:BCA</code>)', { parse_mode: 'HTML' });
    }

    if (installmentToken && accountToken) {
      return ctx.reply('Pilih salah satu metode bayar: <code>akun:...</code> atau <code>cicilan:...</code>, jangan dua-duanya.', { parse_mode: 'HTML' });
    }

    // Fuzzy last-token account detection (no prefix required)
    const accountsEarly = !installmentMeta && !accountToken ? await db.getAccounts() : null;
    const fuzzyAccountMatch = accountsEarly && rest.length > 2
      ? matchAccountStrict(lastToken, accountsEarly)
      : null;

    const hasMethodToken = !!installmentMeta || !!accountToken || !!fuzzyAccountMatch;
    const descParts = hasMethodToken ? rest.slice(1, -1) : rest.slice(1);
    const description = descParts.join(' ') || 'Pengeluaran';

    const categories = await db.getCategories('expense');
    const categoryId = await categorizeTransaction(description, undefined, 'expense', categories);

    // Quick command via cicilan: cicilan:Nama/tenor[/startBulan]
    if (installmentMeta) {
      const monthAmounts = splitInstallmentAmounts(amount, installmentMeta.tenor);
      const base = Math.floor(amount / installmentMeta.tenor);
      const rem = amount - base * installmentMeta.tenor;

      let installmentId: string;
      const existingInst = await db.getInstallmentByName(installmentMeta.name);

      if (existingInst) {
        const startMonth = installmentMeta.startMonth ?? Math.max(
          1,
          dayjs().startOf('month').diff(dayjs(existingInst.start_date).startOf('month'), 'month') + 1
        );
        await db.appendInstallmentMonths(existingInst.id, monthAmounts, startMonth);
        installmentId = existingInst.id;
      } else {
        const createdInst = await db.insertInstallment(
          {
            name: installmentMeta.name,
            monthly_amount: base,
            total_months: installmentMeta.tenor,
            paid_months: 0,
            start_date: dayjs().startOf('month').toISOString(),
            due_day: undefined,
            account_id: undefined,
            category_id: categoryId || undefined,
            status: 'active',
            notes: 'Dibuat otomatis dari /expense inline cicilan',
          },
          monthAmounts
        );
        installmentId = createdInst.id;
      }

      const txn = await insertTransactionWithBalanceSnapshots({
        type: 'expense',
        amount,
        description,
        category_id: categoryId || undefined,
        account_id: undefined,
        installment_id: installmentId,
        source: 'manual_telegram',
        transaction_date: transactionDate,
      });

      const category = categories.find((c) => c.id === categoryId);
      sheets.syncTransaction({ ...txn, category_name: category?.name }).catch(() => {});

      const dateLabel = dateArg ? ` | ${dayjs(transactionDate).format('DD/MM')}` : '';
      return ctx.reply(
        `Tercatat cicilan: -${formatRupiah(amount)} | ${description} | ${installmentMeta.name} | ${installmentMeta.tenor} bln${rem > 0 ? ` (bln1 ${formatRupiah(base + rem)})` : ''}${dateLabel}`,
        { reply_markup: mainMenu }
      );
    }

    let accountId: string | undefined;
    let accountName: string | undefined;
    const accounts = accountsEarly ?? await db.getAccounts();

    if (accountToken) {
      const matched = matchAccount(accountNameInline, accounts);
      if (!matched) {
        return ctx.reply(`Akun inline tidak ditemukan: <code>${accountNameInline}</code>`, { parse_mode: 'HTML' });
      }
      accountId = matched.id;
      accountName = matched.name;
    } else if (fuzzyAccountMatch) {
      accountId = fuzzyAccountMatch.id;
      accountName = fuzzyAccountMatch.name;
    } else {
      const defaultAccount = accounts.find((a) => a.name.toLowerCase() === 'cash') || accounts[0];
      if (!defaultAccount) {
        return ctx.reply('Tidak ada akun aktif. Tambahkan akun dulu di dashboard.');
      }
      accountId = defaultAccount.id;
      accountName = defaultAccount.name;
    }

    const txn = await insertTransactionWithBalanceSnapshots({
      type: 'expense',
      amount,
      description,
      category_id: categoryId || undefined,
      account_id: accountId,
      source: 'manual_telegram',
      transaction_date: transactionDate,
    });

    const category = categories.find((c) => c.id === categoryId);
    const dateLabel = dateArg ? ` | ${dayjs(transactionDate).format('DD/MM')}` : '';
    const accountLabel = accountName ? ` | ${accountName}` : '';
    await ctx.reply(
      `Tercatat: -${formatRupiah(amount)} | ${description} | ${category?.name || 'Uncategorized'}${accountLabel}${dateLabel}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /income (quick command) ───────────────
  bot.command('income', async (ctx) => {
    const args = (ctx.match || '').toString().trim();
    if (isHelpRequest(args)) {
      return ctx.reply(HELP_MESSAGES.income, { parse_mode: 'HTML' });
    }
    if (!args) {
      return ctx.conversation.enter('recordIncomeConvo');
    }
    const parts = args.split(' ');
    // Optional DD/MM date prefix
    let dateArg = parseDatePrefix(parts[0]);
    const rest = dateArg ? parts.slice(1) : parts;
    const transactionDate = dateArg || new Date().toISOString();

    const amount = parseAmount(rest[0] || '');
    if (!amount) return ctx.reply('Format: /income [DD/MM] [nominal] [deskripsi]');

    const accounts = await db.getAccounts();
    const lastToken = rest[rest.length - 1] || '';
    const fuzzyAccountMatch = rest.length > 2 ? matchAccountStrict(lastToken, accounts) : null;
    const descParts = fuzzyAccountMatch ? rest.slice(1, -1) : rest.slice(1);
    const description = descParts.join(' ') || 'Pemasukan';

    const categories = await db.getCategories('income');
    const categoryId = await categorizeTransaction(description, undefined, 'income', categories);

    const resolvedAccount = fuzzyAccountMatch
      || accounts.find((a) => a.name.toLowerCase() === 'cash')
      || accounts[0];

    if (!resolvedAccount) {
      return ctx.reply('Tidak ada akun aktif. Tambahkan akun dulu di dashboard.');
    }

    const txn = await insertTransactionWithBalanceSnapshots({
      type: 'income',
      amount,
      description,
      category_id: categoryId || undefined,
      account_id: resolvedAccount.id,
      source: 'manual_telegram',
      transaction_date: transactionDate,
    });

    const category = categories.find((c) => c.id === categoryId);
    await ctx.reply(
      `Tercatat: +${formatRupiah(amount)} | ${description} | ${category?.name || 'Uncategorized'} | ${resolvedAccount.name}`,
      { reply_markup: mainMenu }
    );

    sheets.syncTransaction({ ...txn, category_name: category?.name, account_name: resolvedAccount.name }).catch(() => {});
  });

  // ── /balance ──────────────────────────────
  bot.command('balance', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.balance, { parse_mode: 'HTML' });
    }

    if (arg.toLowerCase().startsWith('adjust ')) {
      const adjustRaw = arg.slice(7).trim();
      const parts = adjustRaw.split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply('Format: <code>/balance adjust <akun> <nominal_baru> [catatan]</code>', { parse_mode: 'HTML' });
      }

      const amountTokenIndex = parts.findIndex((p) => parseAmount(p) !== null);
      if (amountTokenIndex <= 0) {
        return ctx.reply('Format nominal tidak valid. Contoh: <code>/balance adjust BCA 5500000 koreksi</code>', { parse_mode: 'HTML' });
      }

      const accountToken = parts.slice(0, amountTokenIndex).join(' ');
      const targetBalance = parseAmount(parts[amountTokenIndex]);
      const note = parts.slice(amountTokenIndex + 1).join(' ').trim();

      if (!targetBalance) {
        return ctx.reply('Nominal target saldo tidak valid.');
      }

      const accounts = await db.getAccounts();
      const account = matchAccount(accountToken, accounts);
      if (!account) {
        return ctx.reply(`Akun "${accountToken}" tidak ditemukan.`);
      }

      const mutation = await db.setAccountBalance(account.id, targetBalance);
      const delta = mutation.delta;

      if (Math.abs(delta) < 0.000001) {
        return ctx.reply(`Saldo ${account.name} sudah ${formatRupiah(mutation.after)}. Tidak ada perubahan.`);
      }

      const adjustmentType: Transaction['type'] = delta > 0 ? 'income' : 'expense';
      const adjustmentTx = await db.insertTransaction({
        type: adjustmentType,
        amount: Math.abs(delta),
        description: `Balance adjustment ${account.name}`,
        account_id: account.id,
        source: 'manual_telegram',
        transaction_date: new Date().toISOString(),
        is_adjustment: true,
        adjustment_note: note || undefined,
        balance_before: mutation.before,
        balance_after: mutation.after,
      });

      sheets.syncTransaction({ ...adjustmentTx, account_name: account.name }).catch(() => {});

      const deltaLabel = `${delta > 0 ? '+' : '-'}${formatRupiah(Math.abs(delta))}`;
      return ctx.reply(
        `<b>Balance adjustment berhasil</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `${account.name}\n` +
          `Sebelum: ${formatRupiah(mutation.before)}\n` +
          `Sesudah: ${formatRupiah(mutation.after)}\n` +
          `Δ ${deltaLabel}` +
          `${note ? `\nCatatan: ${note}` : ''}\n` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    const accounts = await db.getAccounts();
    const lines = accounts.map((a) => `<b>${a.name}</b>: ${formatRupiah(a.balance)}`);
    const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    await ctx.reply(
      `<b>Saldo Akun</b>\n━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━\n<b>Total: ${formatRupiah(total)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /report ───────────────────────────────
  bot.command('report', async (ctx) => {
    const raw = (ctx.match || '').toString().trim();
    if (isHelpRequest(raw)) {
      return ctx.reply(HELP_MESSAGES.report, { parse_mode: 'HTML' });
    }

    const period = (raw || 'today').toLowerCase();
    let startDate: string, endDate: string, label: string;

    switch (period) {
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
      msg += '\n\n<b>Breakdown Kategori:</b>\n';
      breakdown.slice(0, 8).forEach((b) => {
        msg += `${b.category_name}: ${formatRupiah(b.total_amount)} (${b.percentage}%)\n`;
      });
    }

    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // ── /edit ─────────────────────────────────
  // /edit → edit transaksi terakhir
  // /edit <id_pendek> → edit transaksi spesifik (8 char pertama UUID)
  bot.command('edit', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.edit, { parse_mode: 'HTML' });
    }

    let txn: Transaction | null = null;
    if (arg) {
      // Cari berdasarkan partial UUID (8 char pertama)
      const recent = await db.getRecentTransactions(50);
      txn = recent.find((t) => t.id?.startsWith(arg)) || null;
      if (!txn) return ctx.reply(`Transaksi dengan ID "${arg}" tidak ditemukan.`);
    } else {
      txn = await db.getLastTransaction();
      if (!txn) return ctx.reply('Tidak ada transaksi untuk diedit.');
    }

    const sign = txn.type === 'income' ? '+' : '-';
    const shortId = txn.id!.slice(0, 8);
    const msg =
      `<b>Edit Transaksi</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `ID: <code>${shortId}</code>\n` +
      `${sign}${formatRupiah(txn.amount)} | ${txn.description || '-'}\n` +
      `Kategori: ${(txn as any).category_name || 'Tanpa Kategori'}\n` +
      `${dayjs(txn.transaction_date).format('DD/MM/YYYY HH:mm')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\nPilih field yang ingin diedit:`;

    const kb = new InlineKeyboard()
      .text('Ganti Kategori', `edit_cat_${txn.id}`)
      .row()
      .text('Ganti Deskripsi', `edit_desc_${txn.id}`)
      .text('Ganti Nominal', `edit_amt_${txn.id}`)
      .row()
      .text('Batal', 'edit_cancel');

    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ── Callback: edit → ganti kategori ───────
  bot.callbackQuery(/^edit_cat_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    const txn = await db.getTransactionById(txnId);
    if (!txn) {
      await ctx.answerCallbackQuery('Transaksi tidak ditemukan').catch(() => {});
      return;
    }

    const cats = await db.getCategories(txn.type === 'income' ? 'income' : 'expense');
    waitingForEditCategory.set(ctx.chat!.id, txnId);
    setTimeout(() => waitingForEditCategory.delete(ctx.chat!.id), 5 * 60 * 1000);

    let kb = new InlineKeyboard();
    cats.slice(0, 20).forEach((cat, i) => {
      kb = kb.text(`${cat.name}`, `set_cat_${cat.id}`);
      if (i % 2 === 1) kb = kb.row();
    });
    kb = kb.row().text('Batal', 'edit_cancel');

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText('<b>Pilih kategori baru:</b>', { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/^set_cat_(.+)$/, async (ctx) => {
    const catId = ctx.match![1];
    const txnId = waitingForEditCategory.get(ctx.chat!.id);
    if (!txnId) {
      await ctx.answerCallbackQuery('Sesi edit kadaluarsa. Ulangi /edit').catch(() => {});
      return;
    }

    const cats = await db.getCategories();
    const cat = cats.find((c) => c.id === catId);
    if (!cat) {
      await ctx.answerCallbackQuery('Kategori tidak ditemukan').catch(() => {});
      return;
    }

    await db.updateTransaction(txnId, { category_id: catId });
    waitingForEditCategory.delete(ctx.chat!.id);
    await ctx.answerCallbackQuery(`Kategori diubah ke ${cat.name}`).catch(() => {});
    await ctx.editMessageText(
      `<b>Kategori diperbarui</b>\n${cat.name}`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  });

  // ── Callback: edit → ganti deskripsi ──────
  bot.callbackQuery(/^edit_desc_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText(
      `Ketik deskripsi baru untuk transaksi ini:`,
      { reply_markup: new InlineKeyboard().text('Batal', 'edit_cancel') }
    ).catch(() => {});
    waitingForEdit.set(ctx.chat!.id, { txnId, field: 'description' });
    setTimeout(() => waitingForEdit.delete(ctx.chat!.id), 5 * 60 * 1000);
  });

  // ── Callback: edit → ganti nominal ────────
  bot.callbackQuery(/^edit_amt_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText(
      `Ketik nominal baru (contoh: <code>75000</code> atau <code>75rb</code>):`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('Batal', 'edit_cancel') }
    ).catch(() => {});
    waitingForEdit.set(ctx.chat!.id, { txnId, field: 'amount' });
    setTimeout(() => waitingForEdit.delete(ctx.chat!.id), 5 * 60 * 1000);
  });

  bot.callbackQuery('edit_cancel', async (ctx) => {
    waitingForEdit.delete(ctx.chat!.id);
    waitingForEditCategory.delete(ctx.chat!.id);
    await ctx.answerCallbackQuery('Dibatalkan').catch(() => {});
    await ctx.editMessageText('Edit dibatalkan.').catch(() => {});
  });

  // ── /undo ─────────────────────────────────
  bot.command('undo', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.undo, { parse_mode: 'HTML' });
    }

    const lastTxn = await db.getLastTransaction();
    if (!lastTxn) {
      return ctx.reply('Tidak ada transaksi untuk di-undo.');
    }
    await db.softDeleteTransaction(lastTxn.id!);

    if (lastTxn.type === 'transfer') {
      if (lastTxn.account_id) await db.updateAccountBalance(lastTxn.account_id, lastTxn.amount);
      if (lastTxn.to_account_id) await db.updateAccountBalance(lastTxn.to_account_id, -lastTxn.amount);
    } else if (lastTxn.account_id) {
      const delta = lastTxn.type === 'income' ? -lastTxn.amount : lastTxn.amount;
      await db.updateAccountBalance(lastTxn.account_id, delta);
    }

    await ctx.reply(
      `Transaksi terakhir dibatalkan:\n${lastTxn.type === 'income' ? '+' : '-'}${formatRupiah(lastTxn.amount)} | ${lastTxn.description || '-'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /installment ──────────────────────────
  bot.command('installment', async (ctx) => {
    const raw = (ctx.match || '').toString().trim();
    if (isHelpRequest(raw)) {
      return ctx.reply(HELP_MESSAGES.installment, { parse_mode: 'HTML' });
    }

    // No args → list active installments
    if (!raw) {
      const list = await db.getInstallments('active');
      if (list.length === 0) {
        return ctx.reply(
          `<b>Belum ada cicilan aktif</b>\n\n` +
            `Gunakan:\n` +
            `<code>/installment add Nama|monthly|total_months|akun|[due_day]|[kategori]</code>\n\n` +
            `Contoh:\n` +
            `<code>/installment add Laptop|500000|12|BCA|15|Elektronik</code>`,
          { parse_mode: 'HTML' }
        );
      }
      let msg = `<b>Cicilan Aktif (${list.length})</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;
      list.forEach((inst, i) => {
        const progress = Math.round((inst.paid_months / inst.total_months) * 100);
        const remainingTotal = (inst.months || [])
          .filter((m) => !m.is_paid)
          .reduce((s, m) => s + Number(m.amount), 0);
        msg += `\n${i + 1}. <b>${inst.name}</b>\n`;
        msg += `   ${formatRupiah(inst.monthly_amount)}/bln × ${inst.total_months}\n`;
        msg += `   ${inst.paid_months}/${inst.total_months} (${progress}%) — sisa ${formatRupiah(remainingTotal)}\n`;
        if (inst.due_day) msg += `   Jatuh tempo tiap tgl ${inst.due_day}\n`;
        if (inst.account_name) msg += `   ${inst.account_name}\n`;
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
          `Format salah.\n\n` +
          `<b>Fixed:</b> <code>/installment add Nama|monthly|total_months|akun|[due_day]|[kategori]</code>\n` +
          `<b>Variable:</b> <code>/installment add Nama|1520000,1304533,1237800,...|akun|[due_day]|[kategori]</code>`,
          { parse_mode: 'HTML' }
        );
      }

      const [name, amountField, ...restParts] = parts;

      // Detect variable (comma-separated amounts in field 2)
      const isVariable = amountField.includes(',');
      let monthly: number;
      let totalMonths: number;
      let monthAmounts: number[];
      let accountToken: string;
      let dueDayStr: string | undefined;
      let categoryToken: string | undefined;

      if (isVariable) {
        monthAmounts = amountField.split(',').map((s) => parseAmount(s.trim())).filter(Boolean) as number[];
        if (monthAmounts.length < 1) return ctx.reply('Nominal tidak valid.');
        totalMonths = monthAmounts.length;
        monthly = Math.round(monthAmounts.reduce((a, b) => a + b, 0) / monthAmounts.length);
        [accountToken, dueDayStr, categoryToken] = restParts;
      } else {
        const [monthsStr, ...rest2] = restParts;
        monthly = parseAmount(amountField) || 0;
        totalMonths = parseInt(monthsStr || '');
        [accountToken, dueDayStr, categoryToken] = rest2;
        if (!monthly || !totalMonths || totalMonths < 1) {
          return ctx.reply('Nominal / total_months tidak valid.');
        }
        monthAmounts = Array(totalMonths).fill(monthly);
      }

      if (!name || !accountToken) return ctx.reply('Nama atau akun tidak boleh kosong.');
      const accounts = await db.getAccounts();
      const account = matchAccount(accountToken, accounts);
      if (!account) return ctx.reply(`Akun "${accountToken}" tidak ditemukan.`);

      let categoryId: string | undefined;
      let categoryLabel = '';
      if (categoryToken) {
        const cats = await db.getCategories('expense');
        const cat = cats.find((c) => c.name.toLowerCase().includes(categoryToken.toLowerCase()));
        if (cat) {
          categoryId = cat.id;
          categoryLabel = ` ${cat.name}`;
        }
      }

      const dueDay = dueDayStr ? parseInt(dueDayStr) : undefined;
      const existing = await db.getInstallmentByName(name);
      if (existing) return ctx.reply(`Cicilan "${name}" sudah ada.`);

      const inst = await db.insertInstallment({
        name,
        monthly_amount: monthly,
        total_months: totalMonths,
        paid_months: 0,
        start_date: dayjs().format('YYYY-MM-DD'),
        due_day: dueDay,
        account_id: account.id,
        category_id: categoryId,
        status: 'active',
      }, monthAmounts);

      const total = monthAmounts.reduce((s, v) => s + v, 0);
      return ctx.reply(
        `<b>Cicilan ditambahkan</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `<b>${inst.name}</b>\n` +
          (isVariable
            ? `Variable ${totalMonths} bln = ${formatRupiah(total)}\n`
            : `${formatRupiah(monthly)}/bln × ${totalMonths} = ${formatRupiah(total)}\n`) +
          `${account.name}${categoryLabel}\n` +
          (dueDay ? `Jatuh tempo tiap tgl ${dueDay}\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Gunakan <code>/installment pay ${inst.name}</code> saat bayar.`,
        { parse_mode: 'HTML' }
      );
    }

    // ── pay ──
    if (cmd === 'pay') {
      if (!argStr) return ctx.reply('Format: <code>/installment pay &lt;nama&gt; [x2] [amount]</code>', { parse_mode: 'HTML' });

      // Parse last token: "x2" → multi-month, number → amount override, else → 1 month
      const payTokens = argStr.trim().split(/\s+/);
      const lastToken = payTokens[payTokens.length - 1];
      const multiMatch = lastToken.match(/^x(\d+)$/i);
      const overrideAmount = !multiMatch ? parseAmount(lastToken) : null;
      const hasModifier = multiMatch || (overrideAmount && payTokens.length > 1);
      const instName = hasModifier ? payTokens.slice(0, -1).join(' ') : argStr;
      const monthCount = multiMatch ? parseInt(multiMatch[1]) : 1;

      const inst = await db.getInstallmentByName(instName);
      if (!inst) return ctx.reply(`Cicilan "${instName}" tidak ditemukan.`);
      if (inst.status !== 'active') return ctx.reply(`Cicilan "${inst.name}" sudah ${inst.status}.`);
      if (inst.paid_months >= inst.total_months) return ctx.reply(`Cicilan "${inst.name}" sudah lunas.`);

      const maxPayable = inst.total_months - inst.paid_months;
      const actualCount = Math.min(monthCount, maxPayable);
      const sortedMonths = (inst.months || []).sort((a, b) => a.month_number - b.month_number);

      // Determine per-month amounts
      const payAmounts: number[] = [];
      for (let i = 0; i < actualCount; i++) {
        if (overrideAmount && actualCount === 1) {
          payAmounts.push(overrideAmount);
        } else {
          const m = sortedMonths[inst.paid_months + i];
          payAmounts.push(m ? Number(m.amount) : Number(inst.monthly_amount));
        }
      }

      const totalPayAmount = payAmounts.reduce((s, v) => s + v, 0);
      const fromMonth = inst.paid_months + 1;
      const toMonth = inst.paid_months + actualCount;
      const descLabel = actualCount > 1
        ? `Cicilan ${inst.name} (${fromMonth}-${toMonth}/${inst.total_months})`
        : `Cicilan ${inst.name} (${fromMonth}/${inst.total_months})`;

      const txn = await insertTransactionWithBalanceSnapshots({
        type: 'expense',
        amount: totalPayAmount,
        description: descLabel,
        category_id: inst.category_id,
        account_id: inst.account_id,
        installment_id: inst.id,
        source: 'manual_telegram',
        transaction_date: new Date().toISOString(),
      });

      const paidMonthNumbers = Array.from({ length: actualCount }, (_, i) => inst.paid_months + 1 + i);
      const newPaid = inst.paid_months + actualCount;
      await db.setInstallmentMonthsPaid(inst.id, paidMonthNumbers, txn.id!);
      await db.setInstallmentPaid(inst.id, newPaid);

      sheets.syncTransaction({
        ...txn,
        category_name: inst.category_name,
        account_name: inst.account_name,
      }).catch(() => {});

      const remaining = inst.total_months - newPaid;
      const done = newPaid >= inst.total_months;

      const breakdown = actualCount > 1
        ? '\n' + payAmounts.map((a, i) => `  Bulan ${fromMonth + i}: ${formatRupiah(a)}`).join('\n')
        : '';

      let nextInfo = '';
      if (!done) {
        const nextMonth = sortedMonths[newPaid];
        if (nextMonth) nextInfo = `\nTagihan bulan depan: ${formatRupiah(nextMonth.amount)}`;
      }

      return ctx.reply(
        `<b>Pembayaran cicilan tercatat</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `${inst.name}\n` +
          `-${formatRupiah(totalPayAmount)}` + breakdown + '\n' +
          `${newPaid}/${inst.total_months}` +
          (done ? ' — <b>LUNAS!</b> ' : ` (sisa ${remaining} bln)`) +
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
          `Format: <code>/installment append &lt;nama&gt; amt1,amt2,...[|N]</code>\n\n` +
          `Contoh (mulai bulan ini):\n<code>/installment append SPayLater 500000,500000,500000</code>\n` +
          `Contoh (mulai bulan ke-5):\n<code>/installment append SPayLater 500000,500000,500000|5</code>`,
          { parse_mode: 'HTML' }
        );
      }

      const inst = await db.getInstallmentByName(instName);
      if (!inst) return ctx.reply(`Cicilan "${instName}" tidak ditemukan.`);
      if (inst.status === 'completed' || inst.status === 'cancelled') {
        return ctx.reply(`Cicilan "${inst.name}" sudah ${inst.status}, tidak bisa ditambah.`);
      }

      // Parse amounts and optional |N offset
      const [amountsStr, offsetStr] = rawField.split('|');
      const newAmounts = amountsStr.split(',').map((s) => parseAmount(s.trim()) ?? 0).filter(Boolean);
      if (newAmounts.length === 0) return ctx.reply('Nominal tidak valid.');

      // Determine start month number (1-based): default = current calendar month relative to start_date
      let startMonthNumber: number;
      if (offsetStr) {
        startMonthNumber = Math.max(1, parseInt(offsetStr));
      } else {
        startMonthNumber = Math.max(1, dayjs().startOf('month').diff(dayjs(inst.start_date).startOf('month'), 'month') + 1);
      }

      await db.appendInstallmentMonths(inst.id, newAmounts, startMonthNumber);

      // Reload to show updated state
      const updated = await db.getInstallmentByName(instName);
      const sortedMonths = (updated?.months || []).sort((a, b) => a.month_number - b.month_number);
      const unpaid = sortedMonths.filter((m) => !m.is_paid);
      const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
      let upcoming = '';
      unpaid.slice(0, 6).forEach((m) => {
        const d = dayjs(inst.start_date).add(m.month_number - 1, 'month');
        const isNew = m.month_number >= startMonthNumber && m.month_number < startMonthNumber + newAmounts.length;
        upcoming += `  ${monthNames[d.month()]} ${d.year()}: ${formatRupiah(m.amount)}${isNew ? ' ' : ''}\n`;
      });
      if (unpaid.length > 6) upcoming += `  ... +${unpaid.length - 6} bulan lagi\n`;
      const totalRemaining = unpaid.reduce((s, m) => s + Number(m.amount), 0);
      const startMonthName = monthNames[dayjs(inst.start_date).add(startMonthNumber - 1, 'month').month()];

      return ctx.reply(
        `<b>Cicilan diperbarui</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `${inst.name}\n` +
          `Tambahan mulai bulan ke-${startMonthNumber} (${startMonthName})\n` +
          `${updated?.paid_months ?? inst.paid_months}/${updated?.total_months ?? inst.total_months} (${unpaid.length} bln sisa)\n` +
          `Total sisa: ${formatRupiah(totalRemaining)}\n\n` +
          `<b>Tagihan ke depan</b> ( = baru ditambah):\n${upcoming}` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    // ── detail ──
    if (cmd === 'detail') {
      if (!argStr) return ctx.reply('Format: <code>/installment detail &lt;nama&gt;</code>', { parse_mode: 'HTML' });
      const inst = await db.getInstallmentByName(argStr);
      if (!inst) return ctx.reply(`Cicilan "${argStr}" tidak ditemukan.`);

      const sortedMonths = (inst.months || []).sort((a, b) => a.month_number - b.month_number);
      const remaining = inst.total_months - inst.paid_months;
      const progress = Math.round((inst.paid_months / inst.total_months) * 100);
      const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

      const totalAmt = sortedMonths.reduce((s, m) => s + Number(m.amount), 0) || Number(inst.monthly_amount) * inst.total_months;
      const paidTotal = sortedMonths.filter((m) => m.is_paid).reduce((s, m) => s + Number(m.amount), 0);
      const unpaidMonths = sortedMonths.filter((m) => !m.is_paid);
      const remainingTotal = unpaidMonths.reduce((s, m) => s + Number(m.amount), 0);

      let scheduleInfo = '';
      const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
      if (unpaidMonths.length > 0) {
        scheduleInfo = `\n<b>Sisa tagihan:</b>\n`;
        unpaidMonths.slice(0, 6).forEach((m) => {
          const d = dayjs(inst.start_date).add(m.month_number - 1, 'month');
          scheduleInfo += `  ${monthNames[d.month()]} ${d.year()}: ${formatRupiah(m.amount)}\n`;
        });
        if (unpaidMonths.length > 6) scheduleInfo += `  ... +${unpaidMonths.length - 6} bulan lagi\n`;
        scheduleInfo += `  Total sisa: <b>${formatRupiah(remainingTotal)}</b>`;
      } else {
        scheduleInfo = `⏳ Sisa: ${remaining} bln (${formatRupiah(remainingTotal)})\n`;
      }

      return ctx.reply(
        `<b>${inst.name}</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `<code>${bar}</code> ${progress}%\n` +
          `Total: ${formatRupiah(totalAmt)}\n` +
          `Dibayar: ${inst.paid_months} bln (${formatRupiah(paidTotal)})\n` +
          scheduleInfo + '\n' +
          (inst.due_day ? `Jatuh tempo tiap tgl ${inst.due_day}\n` : '') +
          (inst.account_name ? `${inst.account_name}\n` : '') +
          (inst.category_name ? `Kategori: ${inst.category_name}\n` : '') +
          `Status: ${inst.status}\n` +
          `Mulai: ${dayjs(inst.start_date).format('DD MMM YYYY')}\n` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

    return ctx.reply(
      `Subcommand tidak dikenal.\n\n` +
        `<code>/installment</code> — list aktif\n` +
        `<code>/installment add ...</code> — tambah\n` +
        `<code>/installment pay &lt;nama&gt; [x2]</code> — bayar 1 atau lebih bulan\n` +
        `<code>/installment append &lt;nama&gt; amt,amt,...</code> — tambah cicilan baru ke yang ada\n` +
        `<code>/installment detail &lt;nama&gt;</code> — lihat detail`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /transfer ─────────────────────────────
  bot.command('transfer', (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.transfer, { parse_mode: 'HTML' });
    }
    return ctx.conversation.enter('recordTransferConvo');
  });
  bot.hears('Transfer', (ctx) => ctx.conversation.enter('recordTransferConvo'));

  // ── /withdraw (tarik ATM: bank → cash) ────
  bot.command('withdraw', async (ctx) => {
    const raw = (ctx.match || '').toString().trim();
    if (isHelpRequest(raw)) {
      return ctx.reply(HELP_MESSAGES.withdraw, { parse_mode: 'HTML' });
    }

    const args = raw ? raw.split(/\s+/) : [];
    const amountStr = args[0];
    const bankToken = args.slice(1).join(' ');
    const amount = amountStr ? parseAmount(amountStr) : null;

    if (!amount) {
      return ctx.reply(HELP_MESSAGES.withdraw, { parse_mode: 'HTML' });
    }

    const accounts = await db.getAccounts();
    const cashAccount = accounts.find((a) => a.type === 'cash' || a.name.toLowerCase() === 'cash');
    if (!cashAccount) return ctx.reply('Akun Cash tidak ditemukan.');

    let bankAccount = bankToken ? matchAccount(bankToken, accounts.filter((a) => a.type === 'bank')) : null;
    if (!bankAccount) {
      // Fallback: pick first bank account
      bankAccount = accounts.find((a) => a.type === 'bank') || null;
    }
    if (!bankAccount) return ctx.reply('Akun bank tidak ditemukan.');

    const now = new Date().toISOString();
    const desc = `Tarik ATM ${bankAccount.name}`;

    // Insert expense di bank
    await insertTransactionWithBalanceSnapshots({
      type: 'expense',
      amount,
      description: desc,
      account_id: bankAccount.id,
      source: 'manual_telegram',
      transaction_date: now,
    });

    // Insert income di cash
    await insertTransactionWithBalanceSnapshots({
      type: 'income',
      amount,
      description: desc,
      account_id: cashAccount.id,
      source: 'manual_telegram',
      transaction_date: now,
    });

    return ctx.reply(
      `<b>Tarik ATM tercatat</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `${bankAccount.name}: -${formatRupiah(amount)}\n` +
        `${cashAccount.name}: +${formatRupiah(amount)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  });
  bot.hears('Tarik ATM', async (ctx) => {
    await ctx.reply(
      `<b>Tarik ATM</b>\n\nKetik nominal + bank:\n<code>/withdraw 50rb BCA</code>\n<code>/withdraw 200000 BSI</code>`,
      { parse_mode: 'HTML' }
    );
  });


  bot.command('category', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.category, { parse_mode: 'HTML' });
    }

    const categories = await db.getCategories();
    const expenseList = categories
      .filter((c) => c.type === 'expense')
      .map((c) => `${c.name}`)
      .join('\n');
    const incomeList = categories
      .filter((c) => c.type === 'income')
      .map((c) => `${c.name}`)
      .join('\n');

    await ctx.reply(
      `<b>Kategori Aktif</b>\n\n` +
        `<b>Pengeluaran:</b>\n${expenseList}\n\n` +
        `<b>Pemasukan:</b>\n${incomeList}`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /sync ─────────────────────────────────
  bot.command('sync', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.sync, { parse_mode: 'HTML' });
    }

    await ctx.reply('Menyinkronkan data ke Google Sheets...');
    try {
      const transactions = await db.getRecentTransactions(1000);
      await sheets.syncAllTransactions(transactions);
      const accounts = await db.getAccounts();
      await sheets.syncAccounts(accounts);
      const installments = await db.getInstallments();
      await sheets.syncInstallments(installments);
      await ctx.reply('Sinkronisasi ke Google Sheets selesai!', { reply_markup: mainMenu });
    } catch (err) {
      await ctx.reply(`Gagal sync: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });

  // ── /reset ─────────────────────────────────
  bot.command('reset', async (ctx) => {
    const arg = (ctx.match || '').toString().trim();
    if (isHelpRequest(arg)) {
      return ctx.reply(HELP_MESSAGES.reset, { parse_mode: 'HTML' });
    }

    const confirmKeyboard = new InlineKeyboard()
      .text('Ya, hapus semua', 'reset_confirm')
      .text('Batal', 'reset_cancel');

    await ctx.reply(
      '<b>RESET DATA</b>\n\nSemua transaksi akan dihapus permanen dan saldo akun di-reset ke 0.\n\nYakin?',
      { parse_mode: 'HTML', reply_markup: confirmKeyboard }
    );
  });

  bot.callbackQuery('reset_confirm', async (ctx) => {
    const count = await db.resetAllTransactions();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Reset selesai! ${count} transaksi dihapus, semua saldo di-reset ke Rp 0.`,
    );
  });

  bot.callbackQuery('reset_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Reset dibatalkan.');
  });

  // ── /ask (AI Query) ───────────────────────
  bot.command('ask', async (ctx) => {
    const question = (ctx.match || '').toString().trim();
    if (isHelpRequest(question)) {
      return ctx.reply(HELP_MESSAGES.ask, { parse_mode: 'HTML' });
    }
    if (!question) {
      return ctx.reply(HELP_MESSAGES.ask, { parse_mode: 'HTML' });
    }

    await ctx.reply('Sedang menganalisis...');

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

    await ctx.reply(`<b>AI Analysis</b>\n\n${insight}`, { parse_mode: 'HTML' });
  });

  // ── /bulk ─────────────────────────────────
  bot.command('bulk', async (ctx) => {
    const text = (ctx.match || '').toString().trim();
    if (isHelpRequest(text)) {
      return ctx.reply(HELP_MESSAGES.bulk, { parse_mode: 'HTML' });
    }
    if (!text) {
      waitingForBulk.add(ctx.chat!.id);
      setTimeout(() => waitingForBulk.delete(ctx.chat!.id), 10 * 60 * 1000);
      return ctx.reply(
        HELP_MESSAGES.bulk + '\n\n<b>Kirim baris transaksi sekarang:</b>',
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
    const valid = parsed.filter(Boolean) as Omit<BulkEntry, 'category_id' | 'category_name'>[];
    const invalidCount = lines.length - valid.length;

    if (valid.length === 0) {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
      return ctx.reply('Tidak ada baris yang valid.\n\nFormat: <code>DD/MM nominal deskripsi</code>', { parse_mode: 'HTML' });
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
      };
    });

    // Simpan ke pending sessions (expire 10 menit)
    const sessionId = Date.now().toString();
    pendingBulk.set(sessionId, entries);
    setTimeout(() => pendingBulk.delete(sessionId), 10 * 60 * 1000);

    // Build preview
    const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);

    let preview = `<b>Preview Bulk Input (${entries.length} transaksi)</b>`;
    if (invalidCount > 0) preview += `\n${invalidCount} baris dilewati (format tidak valid)`;
    preview += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    entries.forEach((e, i) => {
      const sign = e.type === 'income' ? '+' : '-';
      preview += `${i + 1}. <b>${sign}${formatRupiah(e.amount)}</b> ${e.description}\n`;
      preview += `   ${dayjs(e.date).format('DD/MM')} | ${e.category_name} | ${e.account_name}\n`;
    });
    preview += '━━━━━━━━━━━━━━━━━━━━━\n';
    if (totalExpense > 0) preview += `Total Expense: -${formatRupiah(totalExpense)}\n`;
    if (totalIncome > 0) preview += `Total Income: +${formatRupiah(totalIncome)}\n`;

    const keyboard = new InlineKeyboard()
      .text(`Simpan ${entries.length} Transaksi`, `bulk_confirm_${sessionId}`)
      .text('Batal', `bulk_cancel_${sessionId}`);

    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(preview, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^bulk_confirm_(.+)$/, async (ctx) => {
    const sessionId = ctx.match![1];
    const entries = pendingBulk.get(sessionId);
    if (!entries) {
      await ctx.answerCallbackQuery('Session expired, coba lagi.').catch(() => {});
      return ctx.editMessageText('Session expired. Kirim ulang /bulk.');
    }

    await ctx.answerCallbackQuery('Menyimpan...').catch(() => {});
    await ctx.editMessageText(`Menyimpan ${entries.length} transaksi...`);

    let saved = 0;
    const errors: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const txn = await insertTransactionWithBalanceSnapshots({
          type: e.type,
          amount: e.amount,
          description: e.description,
          category_id: e.category_id,
          account_id: e.account_id,
          source: 'manual_telegram',
          transaction_date: e.date,
        });
        sheets.syncTransaction({ ...txn, category_name: e.category_name, account_name: e.account_name }).catch(() => {});
        saved++;
      } catch {
        errors.push(i + 1);
      }
    }

    pendingBulk.delete(sessionId);

    let resultMsg = `<b>Bulk input selesai!</b>\n\n${saved}/${entries.length} transaksi berhasil disimpan.`;
    if (errors.length > 0) resultMsg += `\nGagal: baris ${errors.join(', ')}`;
    await ctx.editMessageText(resultMsg, { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^bulk_cancel_(.+)$/, async (ctx) => {
    pendingBulk.delete(ctx.match![1]);
    await ctx.answerCallbackQuery('Dibatalkan').catch(() => {});
    await ctx.editMessageText('Bulk input dibatalkan.').catch(() => {});
  });

  // ── Handler: bulk input follow-up message ─
  bot.on('message:text', async (ctx) => {
    // ── Edit field handler ─────────────────
    if (waitingForEdit.has(ctx.chat!.id)) {
      const { txnId, field } = waitingForEdit.get(ctx.chat!.id)!;
      waitingForEdit.delete(ctx.chat!.id);
      const text = ctx.message.text.trim();

      if (field === 'description') {
        await db.updateTransaction(txnId, { description: text });
        return ctx.reply(`Deskripsi diperbarui: <i>${text}</i>`, { parse_mode: 'HTML' });
      }
      if (field === 'amount') {
        const amount = parseAmount(text);
        if (!amount) return ctx.reply('Nominal tidak valid.');

        const txn = await db.getTransactionById(txnId);
        if (!txn) return ctx.reply('Transaksi tidak ditemukan.');

        const oldAmount = Number(txn.amount);
        const deltaAmount = amount - oldAmount;

        if (Math.abs(deltaAmount) > 0.000001 && txn.account_id) {
          const balanceDelta = txn.type === 'income' ? deltaAmount : -deltaAmount;
          const mutation = await db.updateAccountBalance(txn.account_id, balanceDelta);
          await db.updateTransaction(txnId, {
            amount,
            balance_before: mutation.before - balanceDelta,
            balance_after: mutation.after,
          } as any);
        } else {
          await db.updateTransaction(txnId, { amount });
        }

        return ctx.reply(`Nominal diperbarui: <b>${formatRupiah(amount)}</b>`, { parse_mode: 'HTML' });
      }
      return;
    }

    // ── Bulk input handler ─────────────────
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
    const valid = parsed.filter(Boolean) as Omit<BulkEntry, 'category_id' | 'category_name'>[];
    const invalidCount = lines.length - valid.length;

    if (valid.length === 0) {
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
      return ctx.reply('Tidak ada baris yang valid.\n\nFormat: <code>DD/MM nominal deskripsi</code>', { parse_mode: 'HTML' });
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
      };
    });

    const sessionId = Date.now().toString();
    pendingBulk.set(sessionId, entries);
    setTimeout(() => pendingBulk.delete(sessionId), 10 * 60 * 1000);

    const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);

    let preview = `<b>Preview Bulk Input (${entries.length} transaksi)</b>`;
    if (invalidCount > 0) preview += `\n${invalidCount} baris dilewati (format tidak valid)`;
    preview += '\n━━━━━━━━━━━━━━━━━━━━━\n';
    entries.forEach((e, i) => {
      const sign = e.type === 'income' ? '+' : '-';
      preview += `${i + 1}. <b>${sign}${formatRupiah(e.amount)}</b> ${e.description}\n`;
      preview += `   ${dayjs(e.date).format('DD/MM')} | ${e.category_name} | ${e.account_name}\n`;
    });
    preview += '━━━━━━━━━━━━━━━━━━━━━\n';
    if (totalExpense > 0) preview += `Total Expense: -${formatRupiah(totalExpense)}\n`;
    if (totalIncome > 0) preview += `Total Income: +${formatRupiah(totalIncome)}\n`;

    const keyboard = new InlineKeyboard()
      .text(`Simpan ${entries.length} Transaksi`, `bulk_confirm_${sessionId}`)
      .text('Batal', `bulk_cancel_${sessionId}`);

    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id).catch(() => {});
    await ctx.reply(preview, { parse_mode: 'HTML', reply_markup: keyboard });
  });


  bot.callbackQuery(/^delete_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    const txn = await db.getTransactionById(txnId);
    if (!txn) {
      await ctx.answerCallbackQuery('Transaksi tidak ditemukan').catch(() => {});
      return;
    }

    await db.softDeleteTransaction(txnId);

    if (txn.type === 'transfer') {
      if (txn.account_id) await db.updateAccountBalance(txn.account_id, txn.amount);
      if (txn.to_account_id) await db.updateAccountBalance(txn.to_account_id, -txn.amount);
    } else if (txn.account_id) {
      const delta = txn.type === 'income' ? -txn.amount : txn.amount;
      await db.updateAccountBalance(txn.account_id, delta);
    }

    await ctx.answerCallbackQuery('Transaksi dihapus!').catch(() => {});
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\nDeleted', {
      parse_mode: 'HTML',
    }).catch(() => {});
  });

  // ── Global error handler ─────────────────
  bot.catch((err) => {
    console.error('Bot error:', err.message);
  });

  return bot;
}
