"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCustomerPaymentSource } from "@/db/queries/customer-payments";
import { PaymentCreationService } from "@/modules/payments/application/create-payment";
import { PaymentInterventionService } from "@/modules/payments/application/resolve-payment-intervention";
import { DrizzlePaymentRepository } from "@/modules/payments/infrastructure/drizzle-payment-repository";
import {
  mapInterventionSubmissionError,
  mapPaymentSubmissionError,
  parseInterventionFormData,
  parsePaymentFormData,
  selectPaymentCreationDestination,
  type InterventionFormState,
  type PaymentFormState,
} from "@/modules/payments/web/payment-form";

export async function createPaymentAction(
  _previousState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = parsePaymentFormData(formData);

  if (!parsed.success) {
    return parsed.state;
  }

  let destination: string;

  try {
    const service = new PaymentCreationService({
      repository: new DrizzlePaymentRepository(),
    });
    const workflow = await service.create({
      idempotencyKey: parsed.data.idempotencyKey,
      beneficiaryId: parsed.data.beneficiaryId,
      amount: parsed.data.amount,
      reference: parsed.data.reference,
    });
    destination = selectPaymentCreationDestination(workflow);
  } catch (error) {
    return mapPaymentSubmissionError(error, parsed.data);
  }

  revalidatePath("/customer");
  redirect(destination);
}

export async function resolvePaymentInterventionAction(
  _previousState: InterventionFormState,
  formData: FormData,
): Promise<InterventionFormState> {
  const parsed = parseInterventionFormData(formData);

  if (!parsed.success) {
    return parsed.state;
  }

  let destination: string;

  try {
    const source = await getCustomerPaymentSource(parsed.data.paymentId);

    if (!source) {
      return {
        acknowledgementError: null,
        formError: "The simulated payment is unavailable.",
      };
    }

    const service = new PaymentInterventionService({
      repository: new DrizzlePaymentRepository(),
    });
    await service.resolve(parsed.data);
    destination = `/customer/payments/${parsed.data.paymentId}`;
  } catch (error) {
    return mapInterventionSubmissionError(error);
  }

  revalidatePath("/customer");
  revalidatePath(`/customer/payments/${parsed.data.paymentId}`);
  redirect(destination);
}
