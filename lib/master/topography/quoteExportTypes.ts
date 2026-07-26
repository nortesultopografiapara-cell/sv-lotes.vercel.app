import type { QuoteFinancialSummary } from './quoteFinancials';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from './quoteTypes';

export type QuoteExportPayload = {
  quote: MasterTopographyQuote;
  stages: MasterTopographyQuoteStageWithItems[];
  financials: QuoteFinancialSummary;
};
