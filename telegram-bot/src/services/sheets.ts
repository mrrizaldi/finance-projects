import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { config } from '../config';
import { Transaction, Category, Account, Installment } from '../types';

let doc: GoogleSpreadsheet | null = null;

async function getDoc(): Promise<GoogleSpreadsheet> {
  if (doc) return doc;

  const auth = new JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  doc = new GoogleSpreadsheet(config.google.sheetsId, auth);
  await doc.loadInfo();
  return doc;
}

export const sheets = {
  async syncTransaction(txn: Transaction & {
    category_name?: string;
    account_name?: string;
  }): Promise<void> {
    try {
      const document = await getDoc();
      const sheet = document.sheetsByTitle['Transaction'];
      if (!sheet) return;

      await sheet.addRow({
        id: txn.id || '',
        type: txn.type,
        amount: txn.amount,
        description: txn.description || '',
        merchant: txn.merchant || '',
        category_name: txn.category_name || '',
        account_name: txn.account_name || '',
        source: txn.source,
        transaction_date: txn.transaction_date,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Sheets sync error:', err);
    }
  },

  async syncAllTransactions(transactions: (Transaction & {
    category_name?: string;
    account_name?: string;
  })[]): Promise<void> {
    try {
      const document = await getDoc();
      const sheet = document.sheetsByTitle['Transaction'];
      if (!sheet) return;

      await sheet.clearRows();
      const rows = transactions.map((txn) => ({
        id: txn.id || '',
        type: txn.type,
        amount: txn.amount,
        description: txn.description || '',
        merchant: txn.merchant || '',
        category_name: txn.category_name || '',
        account_name: txn.account_name || '',
        source: txn.source,
        transaction_date: txn.transaction_date,
        created_at: new Date().toISOString(),
      }));
      if (rows.length > 0) await sheet.addRows(rows);
    } catch (err) {
      console.error('Sheets full sync error:', err);
    }
  },

  async syncInstallments(installments: Installment[]): Promise<void> {
    try {
      const document = await getDoc();
      const sheet = document.sheetsByTitle['Installment'];
      if (!sheet) return;

      await sheet.clearRows();
      const rows = installments.map((inst) => {
        const remaining = inst.total_months - inst.paid_months;
        const progress = Math.round((inst.paid_months / inst.total_months) * 100);
        return {
          id: inst.id,
          name: inst.name,
          monthly_amount: Number(inst.monthly_amount),
          total_months: inst.total_months,
          paid_months: inst.paid_months,
          remaining_months: remaining,
          start_date: inst.start_date,
          due_day: inst.due_day || '',
          account_name: inst.account_name || '',
          category_name: inst.category_name || '',
          status: inst.status,
          progress_percent: progress,
          notes: inst.notes || '',
        };
      });
      if (rows.length > 0) await sheet.addRows(rows);
    } catch (err) {
      console.error('Sheets installments sync error:', err);
    }
  },

  async syncAccounts(accounts: Account[]): Promise<void> {
    try {
      const document = await getDoc();
      const sheet = document.sheetsByTitle['Account'];
      if (!sheet) return;

      await sheet.clearRows();
      await sheet.addRows(
        accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          icon: a.icon,
        }))
      );
    } catch (err) {
      console.error('Sheets accounts sync error:', err);
    }
  },
};
