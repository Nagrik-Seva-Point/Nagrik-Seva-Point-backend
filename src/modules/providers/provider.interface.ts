export interface ProviderResult {
  success: boolean;
  providerId: string;
  referenceNumber?: string;
  resultData?: Record<string, unknown>;
  error?: string;
  isRetryable?: boolean;
}

export interface ProviderAdapter {
  name: string;
  execute(
    serviceCode: string,
    inputData: Record<string, unknown>,
  ): Promise<ProviderResult>;
}
