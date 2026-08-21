import type { Prisma } from "@prisma/client";

export interface ServiceResult {
  success: boolean;
  referenceNumber?: string;
  resultData?: Prisma.InputJsonValue;
  error?: string;
}

export type ServiceInput = Record<string, unknown>;

export interface ServiceIntegration {
  serviceCode: string;
  validateInput(inputData: ServiceInput): void | Promise<void>;
  execute(inputData: ServiceInput): Promise<ServiceResult>;
}
