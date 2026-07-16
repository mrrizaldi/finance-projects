import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import accountsRoutes from './routes/accounts.js';
import accountsIdRoutes from './routes/accounts-id.js';
import accountsIdAdjustRoutes from './routes/accounts-id-adjust.js';
import adminRoutes from './routes/admin.js';
import budgetSuggestRoutes from './routes/budget-suggest.js';
import categoriesRoutes from './routes/categories.js';
import categoriesIdRoutes from './routes/categories-id.js';
import categorizeRoutes from './routes/categorize.js';
import chatRoutes from './routes/chat.js';
import installmentsRoutes from './routes/installments.js';
import installmentsIdRoutes from './routes/installments-id.js';
import installmentsIdAppendRoutes from './routes/installments-id-append.js';
import installmentsIdPayRoutes from './routes/installments-id-pay.js';
import investmentsRoutes from './routes/investments.js';
import investmentsCorporateActionsRoutes from './routes/investments-corporate-actions.js';
import investmentsCouponRatesRoutes from './routes/investments-coupon-rates.js';
import investmentsDistributionsRoutes from './routes/investments-distributions.js';
import investmentsFetchBondPricesRoutes from './routes/investments-fetch-bond-prices.js';
import investmentsFetchNavRoutes from './routes/investments-fetch-nav.js';
import investmentsFetchStockPricesRoutes from './routes/investments-fetch-stock-prices.js';
import investmentsInstrumentsRoutes from './routes/investments-instruments.js';
import investmentsInstrumentsPurchaseRoutes from './routes/investments-instruments-purchase.js';
import investmentsPurchaseRoutes from './routes/investments-purchase.js';
import investmentsRevalueRoutes from './routes/investments-revalue.js';
import profileRoutes from './routes/profile.js';
import pushVapidKeyRoutes from './routes/push-vapid-key.js';
import pushSubscribeRoutes from './routes/push-subscribe.js';
import pushNotifyRoutes from './routes/push-notify.js';
import telegramRoutes from './routes/telegram.js';
import transactionsRoutes from './routes/transactions.js';
import transactionsIdRoutes from './routes/transactions-id.js';
import transactionsRecalculateRoutes from './routes/transactions-recalculate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(accountsRoutes);
  await app.register(accountsIdRoutes);
  await app.register(accountsIdAdjustRoutes);
  await app.register(adminRoutes);
  await app.register(budgetSuggestRoutes);
  await app.register(categoriesRoutes);
  await app.register(categoriesIdRoutes);
  await app.register(categorizeRoutes);
  await app.register(chatRoutes);
  await app.register(installmentsRoutes);
  await app.register(installmentsIdRoutes);
  await app.register(installmentsIdAppendRoutes);
  await app.register(installmentsIdPayRoutes);
  await app.register(investmentsRoutes);
  await app.register(investmentsCorporateActionsRoutes);
  await app.register(investmentsCouponRatesRoutes);
  await app.register(investmentsDistributionsRoutes);
  await app.register(investmentsFetchBondPricesRoutes);
  await app.register(investmentsFetchNavRoutes);
  await app.register(investmentsFetchStockPricesRoutes);
  await app.register(investmentsInstrumentsRoutes);
  await app.register(investmentsInstrumentsPurchaseRoutes);
  await app.register(investmentsPurchaseRoutes);
  await app.register(investmentsRevalueRoutes);
  await app.register(profileRoutes);
  await app.register(pushVapidKeyRoutes);
  await app.register(pushSubscribeRoutes);
  await app.register(pushNotifyRoutes);
  await app.register(telegramRoutes);
  await app.register(transactionsRoutes);
  await app.register(transactionsIdRoutes);
  await app.register(transactionsRecalculateRoutes);

  // Production: serve static SPA build + fallback index.html
  const clientDir = path.resolve(__dirname, '../../dashboard/build/client');
  if (fs.existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
