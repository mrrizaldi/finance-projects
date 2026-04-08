import { createBot } from './bot';

const bot = createBot();

bot.api.setMyCommands([
  { command: 'start', description: 'Mulai bot & tampilkan menu' },
  { command: 'expense', description: 'Catat pengeluaran' },
  { command: 'income', description: 'Catat pemasukan' },
  { command: 'transfer', description: 'Transfer antar akun' },
  { command: 'balance', description: 'Lihat saldo semua akun' },
  { command: 'report', description: 'Laporan keuangan (today/week/month/year)' },
  { command: 'category', description: 'Lihat daftar kategori' },
  { command: 'ask', description: 'Tanya AI tentang keuangan' },
  { command: 'sync', description: 'Sinkronisasi data ke Google Sheets' },
  { command: 'bulk', description: 'Input banyak transaksi sekaligus' },
  { command: 'installment', description: 'Kelola cicilan (add/pay/detail)' },
  { command: 'undo', description: 'Batalkan transaksi terakhir' },
  { command: 'reset', description: 'Hapus semua data (testing)' },
]);

bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Bot @${botInfo.username} is running!`);
  },
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
