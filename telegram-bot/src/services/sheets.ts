import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { config } from '../config';
import { Transaction, Category, Account } from '../types';

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
      const sheet = document.sheetsByTitle['Transactions'];
      if (!sheet) return;

      await sheet.addRow({
        id: txn.id || '',
        type: txn.type,
        amount: txn.amount,
        description: txn.description || '',
        merchant: txn.merchant || '',
        category: txn.category_name || '',
        account: txn.account_name || '',
        source: txn.source,
        verified: txn.verified ? 'TRUE' : 'FALSE',
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
      const sheet = document.sheetsByTitle['Transactions'];
      if (!sheet) return;

      await sheet.clearRows();
      const rows = transactions.map((txn) => ({
        id: txn.id || '',
        type: txn.type,
        amount: txn.amount,
        description: txn.description || '',
        merchant: txn.merchant || '',
        category: txn.category_name || '',
        account: txn.account_name || '',
        source: txn.source,
        verified: txn.verified ? 'TRUE' : 'FALSE',
        transaction_date: txn.transaction_date,
        created_at: new Date().toISOString(),
      }));
      if (rows.length > 0) await sheet.addRows(rows);
    } catch (err) {
      console.error('Sheets full sync error:', err);
    }
  },

  async syncAccounts(accounts: Account[]): Promise<void> {
    try {
      const document = await getDoc();
      const sheet = document.sheetsByTitle['Accounts'];
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
