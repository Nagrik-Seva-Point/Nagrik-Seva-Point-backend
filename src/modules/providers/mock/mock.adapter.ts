import type {
  ProviderAdapter,
  ProviderResult,
} from "../provider.interface.ts";

export class MockProviderAdapter implements ProviderAdapter {
  name = "MOCK_PROVIDER";

  async execute(
    serviceCode: string,
    inputData: Record<string, unknown>,
  ): Promise<ProviderResult> {
    const referenceNumber = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (serviceCode === "PAN_FIND") {
      const aadhaar = String(inputData.aadhaar || "").trim();
      const last4 = aadhaar.slice(-4) || "8899";
      const randomChar = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const panNumber = `ABC${randomChar}P${last4}${randomChar}`;

      return {
        success: true,
        providerId: this.name,
        referenceNumber,
        resultData: {
          panNumber,
          fullName: "VIKASH KUMAR",
          maskedAadhaar: `XXXXXXXX${last4}`,
          status: "ACTIVE",
          category: "INDIVIDUAL",
          issuedAt: "2019-04-12",
        },
      };
    }

    if (serviceCode === "VOTER_VERIFY") {
      const epicNumber = String(inputData.epicNumber || "ABC1234567");
      return {
        success: true,
        providerId: this.name,
        referenceNumber,
        resultData: {
          epicNumber,
          fullName: "VIKASH KUMAR",
          fatherName: "RAM KUMAR",
          gender: "MALE",
          assemblyConstituency: "PATNA SAHIB",
          state: "BIHAR",
          status: "ACTIVE",
        },
      };
    }

    return {
      success: true,
      providerId: this.name,
      referenceNumber,
      resultData: {
        message: `Service ${serviceCode} verified successfully via Mock Provider`,
        status: "COMPLETED",
      },
    };
  }
}

export const mockProviderAdapter = new MockProviderAdapter();
