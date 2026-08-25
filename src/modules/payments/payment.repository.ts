import { prisma } from "../../core/db/prisma";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export class PaymentRepository {
  async create(data: {
    serviceRequestId: string;
    organizationId?: string | null;
    guestSessionId?: string | null;
    amount: number;
    currency?: string;
    method?: PaymentMethod;
    gatewayOrderId?: string | null;
  }) {
    return await prisma.payment.create({
      data: {
        serviceRequestId: data.serviceRequestId,
        organizationId: data.organizationId || null,
        guestSessionId: data.guestSessionId || null,
        amount: data.amount,
        currency: data.currency || "INR",
        method: data.method || "RAZORPAY",
        status: "PENDING",
        gatewayOrderId: data.gatewayOrderId || null,
      },
    });
  }

  async findById(id: string) {
    return await prisma.payment.findUnique({
      where: { id },
      include: {
        serviceRequest: true,
      },
    });
  }

  async findByServiceRequestId(serviceRequestId: string) {
    return await prisma.payment.findFirst({
      where: { serviceRequestId },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    gatewayPaymentId?: string,
    gatewaySignature?: string,
  ) {
    return await prisma.payment.update({
      where: { id },
      data: {
        status,
        gatewayPaymentId: gatewayPaymentId || undefined,
        gatewaySignature: gatewaySignature || undefined,
      },
    });
  }
}

export const paymentRepository = new PaymentRepository();
