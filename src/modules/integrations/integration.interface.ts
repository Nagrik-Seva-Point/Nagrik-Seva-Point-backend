export interface ServiceResult {
  success: boolean;
  referenceNumber?: string;
  resultData?: any;
  error?: string;
}

export interface ServiceIntegration {
  serviceCode: string;
  validateInput(inputData: Record<string, any>): Promise<void>;
  execute(inputData: Record<string, any>): Promise<ServiceResult>;
}
