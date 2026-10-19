import { getEffects, type TransactionType } from './balance-math.js';
import { roundCents, type StatementDirection } from './statement-parser.js';

export interface MatchLine {
  id: string;
  date: string;
  time: string | null;
  amount: number;
  direction: StatementDirection;
  description: string;
}

export interface MatchTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  toAmount: number | null;
  accountId: string | null;
  toAccountId: string | null;
  date: string;
  time: string | null;
  description: string;
  isAdjustment: boolean;
}

export type LineDecision = 'match' | 'probable' | 'new' | 'transfer_pair' | 'other_account';

export interface LineResult {
  lineId: string;
  decision: LineDecision;
  selected: boolean;
  matchedTransactionId: string | null;
  score: number;
}

export interface AppFinding {
  transactionId: string;
  kind: 'app_dup' | 'app_only';
  relatedLineId: string | null;
  selected: boolean;
  signedAmount: number;
}

export interface MatchResult {
  lines: LineResult[];
  appFindings: AppFinding[];
}

export interface MatchInput {
  accountId: string;
  periodStart: string;
  periodEnd: string;
  lines: MatchLine[];
  transactions: MatchTransaction[];
}

export const MAX_DAY_GAP = 3;
export const FEE_TOLERANCE_RUPIAH = 6500;
export const MATCH_SCORE = 0.6;

const AMOUNT_TOLERANCE_RUPIAH = 1;
const EXACT_AMOUNT_WEIGHT = 0.5;
const FEE_AMOUNT_WEIGHT = 0.25;
const DATE_WEIGHT = 0.25;
const TIME_WEIGHT = 0.1;
const TEXT_WEIGHT = 0.15;
const TIME_WINDOW_MINUTES = 30;
const MINUTES_PER_HOUR = 60;
const MS_PER_DAY = 86_400_000;
const MIN_TOKEN_LENGTH = 3;
const SCORE_PRECISION = 1000;
const ISO_DATE_LENGTH = 'yyyy-mm-dd'.length;

const NOISE_TOKENS = new Set([
  'trsf', 'trf', 'transfer', 'banking', 'payment', 'qris', 'via', 'debit', 'kredit',
  'otomatis', 'switching', 'internet', 'transaction', 'journal', 'dari', 'untuk', 'the',
]);

const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY;
const dayGap = (a: string, b: string) => Math.abs(dayNumber(a) - dayNumber(b));
const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
};
const roundScore = (score: number) => Math.round(score * SCORE_PRECISION) / SCORE_PRECISION;
const shiftDate = (isoDate: string, days: number) =>
  new Date((dayNumber(isoDate) + days) * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(t) && !NOISE_TOKENS.has(t)),
  );
}

function textSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((t) => right.has(t)).length;
  return shared / (left.size + right.size - shared);
}

export function signedEffectOn(accountId: string, tx: MatchTransaction): number {
  return getEffects({
    type: tx.type,
    amount: tx.amount,
    to_amount: tx.toAmount,
    account_id: tx.accountId,
    to_account_id: tx.toAccountId,
  })[accountId] ?? 0;
}

const signedLineAmount = (line: MatchLine) => (line.direction === 'credit' ? line.amount : -line.amount);

export function scorePair(line: MatchLine, effect: number, tx: MatchTransaction): number {
  if (effect === 0 || Math.sign(effect) !== Math.sign(signedLineAmount(line))) return 0;
  const gap = dayGap(line.date, tx.date);
  if (gap > MAX_DAY_GAP) return 0;
  const amountDiff = Math.abs(Math.abs(effect) - line.amount);
  let score: number;
  if (amountDiff < AMOUNT_TOLERANCE_RUPIAH) score = EXACT_AMOUNT_WEIGHT;
  else if (amountDiff <= FEE_TOLERANCE_RUPIAH) score = FEE_AMOUNT_WEIGHT;
  else return 0;
  score += DATE_WEIGHT * ((MAX_DAY_GAP + 1 - gap) / (MAX_DAY_GAP + 1));
  if (line.time && tx.time && Math.abs(minutesOf(line.time) - minutesOf(tx.time)) <= TIME_WINDOW_MINUTES) {
    score += TIME_WEIGHT;
  }
  score += TEXT_WEIGHT * textSimilarity(line.description, tx.description);
  return roundScore(score);
}

const isExactAmount = (line: MatchLine, effect: number) => Math.abs(Math.abs(effect) - line.amount) < AMOUNT_TOLERANCE_RUPIAH;

export function matchStatement(input: MatchInput): MatchResult {
  const { accountId, lines } = input;
  const windowStart = shiftDate(input.periodStart, -MAX_DAY_GAP);
  const windowEnd = shiftDate(input.periodEnd, MAX_DAY_GAP);
  const usable = input.transactions.filter((tx) => !tx.isAdjustment && tx.date >= windowStart && tx.date <= windowEnd);
  const onAccount = usable.filter((tx) => signedEffectOn(accountId, tx) !== 0);
  const elsewhere = usable.filter(
    (tx) => tx.accountId !== null && tx.type !== 'transfer' && signedEffectOn(accountId, tx) === 0,
  );

  const pairs = lines.flatMap((line) =>
    onAccount.map((tx) => ({ line, tx, effect: signedEffectOn(accountId, tx), score: scorePair(line, signedEffectOn(accountId, tx), tx) })),
  ).filter((p) => p.score > 0);
  pairs.sort((a, b) => b.score - a.score || dayGap(a.line.date, a.tx.date) - dayGap(b.line.date, b.tx.date));

  const lineToPair = new Map<string, (typeof pairs)[number]>();
  const usedTx = new Set<string>();
  for (const pair of pairs) {
    if (lineToPair.has(pair.line.id) || usedTx.has(pair.tx.id)) continue;
    lineToPair.set(pair.line.id, pair);
    usedTx.add(pair.tx.id);
  }

  const usedElsewhere = new Set<string>();
  const results: LineResult[] = lines.map((line) => {
    const pair = lineToPair.get(line.id);
    if (pair) {
      const decision: LineDecision =
        pair.score < MATCH_SCORE ? 'probable' : pair.tx.type === 'transfer' ? 'transfer_pair' : 'match';
      return { lineId: line.id, decision, selected: false, matchedTransactionId: pair.tx.id, score: pair.score };
    }

    const foreign = elsewhere
      .filter((tx) => !usedElsewhere.has(tx.id))
      .map((tx) => {
        const effect = tx.type === 'income' ? tx.amount : -tx.amount;
        return { tx, effect, score: scorePair(line, effect, tx) };
      })
      .filter((c) => c.score >= MATCH_SCORE && isExactAmount(line, c.effect))
      .sort((a, b) => b.score - a.score)[0];
    if (foreign) {
      usedElsewhere.add(foreign.tx.id);
      return { lineId: line.id, decision: 'other_account', selected: true, matchedTransactionId: foreign.tx.id, score: foreign.score };
    }

    return { lineId: line.id, decision: 'new', selected: true, matchedTransactionId: null, score: 0 };
  });

  const appFindings: AppFinding[] = [];
  for (const tx of onAccount) {
    if (usedTx.has(tx.id)) continue;
    const effect = signedEffectOn(accountId, tx);
    const rivalOf = pairs
      .filter((p) => p.tx.id === tx.id && lineToPair.get(p.line.id)?.tx.id !== tx.id && lineToPair.has(p.line.id))
      .sort((a, b) => b.score - a.score)[0];
    if (rivalOf) {
      appFindings.push({
        transactionId: tx.id,
        kind: 'app_dup',
        relatedLineId: rivalOf.line.id,
        selected: isExactAmount(rivalOf.line, effect),
        signedAmount: effect,
      });
    } else if (tx.date >= input.periodStart && tx.date <= input.periodEnd) {
      appFindings.push({ transactionId: tx.id, kind: 'app_only', relatedLineId: null, selected: false, signedAmount: effect });
    }
  }

  return { lines: results, appFindings };
}

export interface BalanceAudit {
  statementClosing: number;
  appClosing: number;
  explained: number;
  unexplained: number;
}

export function auditBalance(params: {
  statementClosing: number;
  appClosing: number;
  lines: MatchLine[];
  result: MatchResult;
}): BalanceAudit {
  const lineById = new Map(params.lines.map((l) => [l.id, l]));
  const fromNew = params.result.lines
    .filter((r) => r.decision === 'new' || r.decision === 'other_account')
    .reduce((sum, r) => sum + signedLineAmount(lineById.get(r.lineId)!), 0);
  const fromApp = params.result.appFindings.reduce((sum, f) => sum + f.signedAmount, 0);
  const explained = roundCents(fromNew - fromApp);
  const gap = params.statementClosing - params.appClosing;
  return {
    statementClosing: params.statementClosing,
    appClosing: params.appClosing,
    explained,
    unexplained: roundCents(gap - explained),
  };
}
