import { z } from "zod";

import {
  PaymentApplicationError,
  type PaymentApplicationErrorCode,
} from "../application/payment-application-errors";
import type { PaymentWorkflow } from "../application/payment-types";
import { PaymentDomainError } from "../domain/payment-errors";

export const MAX_PAYMENT_REFERENCE_LENGTH = 140;

export type PaymentFormValues = {
  idempotencyKey: string;
  beneficiaryId: string;
  amount: string;
  reference: string;
};

export type PaymentFormFieldErrors = Partial<
  Record<keyof PaymentFormValues, string>
>;

export type PaymentFormState = {
  values: PaymentFormValues;
  fieldErrors: PaymentFormFieldErrors;
  formError: string | null;
};

export type InterventionFormState = {
  acknowledgementError: string | null;
  formError: string | null;
};

export type InterventionSubmission = {
  paymentId: string;
  decision: "CANCEL" | "CONTINUE";
  acknowledgementConfirmed: boolean;
};

const paymentFormSchema = z.object({
  idempotencyKey: z.string().uuid("Refresh the form and try again."),
  beneficiaryId: z.string().uuid("Choose a beneficiary."),
  amount: z.string().trim().min(1, "Enter an amount in pounds."),
  reference: z
    .string()
    .trim()
    .min(1, "Enter a payment reference.")
    .max(
      MAX_PAYMENT_REFERENCE_LENGTH,
      `Use ${MAX_PAYMENT_REFERENCE_LENGTH} characters or fewer.`,
    ),
});

const interventionSchema = z.object({
  paymentId: z.string().uuid(),
  decision: z.enum(["CANCEL", "CONTINUE"]),
  acknowledgementConfirmed: z.boolean(),
});

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssueMessage(
  issues: Record<string, string[] | undefined>,
  field: keyof PaymentFormValues,
): string | undefined {
  return issues[field]?.[0];
}

export function createInitialPaymentFormState(
  idempotencyKey: string,
): PaymentFormState {
  return {
    values: {
      idempotencyKey,
      beneficiaryId: "",
      amount: "",
      reference: "",
    },
    fieldErrors: {},
    formError: null,
  };
}

export function parsePaymentFormData(
  formData: FormData,
):
  | { success: true; data: PaymentFormValues }
  | { success: false; state: PaymentFormState } {
  const values: PaymentFormValues = {
    idempotencyKey: getString(formData, "idempotencyKey"),
    beneficiaryId: getString(formData, "beneficiaryId"),
    amount: getString(formData, "amount"),
    reference: getString(formData, "reference"),
  };
  const parsed = paymentFormSchema.safeParse(values);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  const issues = z.flattenError(parsed.error).fieldErrors;
  return {
    success: false,
    state: {
      values,
      fieldErrors: {
        idempotencyKey: firstIssueMessage(issues, "idempotencyKey"),
        beneficiaryId: firstIssueMessage(issues, "beneficiaryId"),
        amount: firstIssueMessage(issues, "amount"),
        reference: firstIssueMessage(issues, "reference"),
      },
      formError: null,
    },
  };
}

const formLevelApplicationErrors: Partial<
  Record<PaymentApplicationErrorCode, string>
> = {
  PAYMENT_CONTEXT_NOT_FOUND:
    "The synthetic customer account is unavailable. Please try again later.",
  BENEFICIARY_NOT_OWNED:
    "The selected beneficiary is not available for this synthetic customer.",
  PAYMENT_IDEMPOTENCY_CONFLICT:
    "This form was already used for different payment details. Open a fresh payment form.",
  PAYMENT_PERSISTENCE_CONFLICT:
    "The simulated payment could not be recorded safely. Please try again.",
  UNSUPPORTED_PAYMENT_CURRENCY:
    "This demonstration currently supports GBP accounts only.",
};

export function mapPaymentSubmissionError(
  error: unknown,
  values: PaymentFormValues,
): PaymentFormState {
  const state: PaymentFormState = {
    values,
    fieldErrors: {},
    formError: null,
  };

  if (error instanceof PaymentDomainError && error.code === "INVALID_MONEY_AMOUNT") {
    state.fieldErrors.amount = "Enter a valid positive amount with no more than two decimal places.";
    return state;
  }

  if (error instanceof PaymentApplicationError) {
    if (error.code === "BENEFICIARY_NOT_FOUND") {
      state.fieldErrors.beneficiaryId = "Choose an available beneficiary.";
      return state;
    }

    if (error.code === "INVALID_PAYMENT_REFERENCE") {
      state.fieldErrors.reference = "Enter a valid payment reference.";
      return state;
    }

    if (error.code === "INVALID_IDEMPOTENCY_KEY") {
      state.formError = "This form has expired. Refresh the page and try again.";
      return state;
    }

    state.formError =
      formLevelApplicationErrors[error.code] ??
      "The simulated payment could not be completed safely.";
    return state;
  }

  state.formError = "Something went wrong while recording the simulated payment.";
  return state;
}

export function selectPaymentCreationDestination(
  workflow: Pick<PaymentWorkflow, "payment" | "intervention">,
): string {
  return workflow.payment.status === "CUSTOMER_INTERVENTION" &&
    workflow.intervention?.status === "PENDING"
    ? `/customer/payments/${workflow.payment.id}/intervention`
    : `/customer/payments/${workflow.payment.id}`;
}

export function parseInterventionFormData(
  formData: FormData,
):
  | { success: true; data: InterventionSubmission }
  | { success: false; state: InterventionFormState } {
  const raw = {
    paymentId: getString(formData, "paymentId"),
    decision: getString(formData, "decision"),
    acknowledgementConfirmed:
      getString(formData, "acknowledgementConfirmed") === "true",
  };
  const parsed = interventionSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      state: {
        acknowledgementError: null,
        formError: "The intervention request is invalid. Refresh the page and try again.",
      },
    };
  }

  if (
    parsed.data.decision === "CONTINUE" &&
    !parsed.data.acknowledgementConfirmed
  ) {
    return {
      success: false,
      state: {
        acknowledgementError:
          "Confirm that you have paused and checked the payment before continuing.",
        formError: null,
      },
    };
  }

  return { success: true, data: parsed.data };
}

export function mapInterventionSubmissionError(
  error: unknown,
): InterventionFormState {
  if (error instanceof PaymentApplicationError) {
    if (error.code === "INTERVENTION_ACKNOWLEDGEMENT_REQUIRED") {
      return {
        acknowledgementError:
          "Confirm that you have paused and checked the payment before continuing.",
        formError: null,
      };
    }

    if (error.code === "INTERVENTION_ALREADY_RESOLVED") {
      return {
        acknowledgementError: null,
        formError: "This intervention has already been resolved and was not changed.",
      };
    }
  }

  return {
    acknowledgementError: null,
    formError: "The intervention could not be resolved safely. Please refresh and try again.",
  };
}
