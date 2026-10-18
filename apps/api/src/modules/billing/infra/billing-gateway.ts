import type { PlanId, SubscriptionStatus } from '@mente-ativa/shared';

/** Dados que permitem achar o usuário de um evento do provedor, em ordem de confiança. */
export interface BillingMatch {
  /** Código de rastreio enviado no link do checkout: é o `username`. */
  tracker: string | null;
  contractId: string | null;
  buyerEmail: string | null;
}

export interface BillingInvoice {
  id: string;
  amountCents: number;
  currency: string;
  paidAt: Date | null;
  paymentMethod: string | null;
  installments: number | null;
  productIds: string[];
  match: BillingMatch;
}

export interface BillingContract {
  id: string;
  status: SubscriptionStatus;
  /** Status original do provedor, guardado para diagnóstico. */
  providerStatus: string;
  productIds: string[];
  startedAt: Date | null;
  /** Próxima cobrança: até quando o período atual está pago. */
  nextChargeAt: Date | null;
  match: BillingMatch;
}

/** Evento do provedor já traduzido para o vocabulário da aplicação. */
export type BillingEvent =
  | { id: string; type: 'invoice.paid'; invoice: BillingInvoice }
  | { id: string; type: 'invoice.refunded'; invoice: BillingInvoice }
  | { id: string; type: 'contract.updated'; contract: BillingContract }
  | { id: string; type: 'ignored'; providerType: string };

export interface BillingGateway {
  readonly provider: 'eduzz';
  /** Link do checkout hospedado do plano, já com o rastreio do usuário; `null` se não configurado. */
  checkoutUrl(plan: PlanId, buyer: { username: string; email: string | null }): string | null;
  /** Área do comprador, onde ele troca o meio de pagamento e cancela (RN-PAY-07). */
  customerAreaUrl(): string | null;
  /** Plano correspondente a um produto do provedor. */
  planForProduct(productIds: string[]): PlanId | null;
  /** Valida a assinatura do webhook; lança `InvalidWebhookSignature` se não conferir. */
  parseWebhook(payload: Buffer, signature: string | undefined): BillingEvent;
}

export class InvalidWebhookSignature extends Error {
  constructor() {
    super('Assinatura do webhook inválida.');
    this.name = 'InvalidWebhookSignature';
  }
}
