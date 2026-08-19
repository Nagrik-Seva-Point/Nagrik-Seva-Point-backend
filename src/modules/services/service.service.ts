import { serviceRepository } from "./service.repository.ts";
import { AppError } from "../../core/errors/AppError.ts";
import type { QueryServiceInput } from "./service.schema.ts";

export class ServiceService {
  async getActiveServices(query: QueryServiceInput) {
    return await serviceRepository.findMany(query);
  }

  async getServiceByCode(code: string) {
    const service = await serviceRepository.findByCode(code);
    if (!service) {
      throw AppError.notFound(`Service with code ${code} not found`);
    }
    return service;
  }

  async seedInitialServices() {
    console.log("Seeding initial services catalogue...");

    // Seed PAN_FIND
    await serviceRepository.upsert("PAN_FIND", {
      name: "PAN Find (Aadhaar/DOB search)",
      description:
        "Find client PAN number using Aadhaar and Date of Birth verification",
      category: "PAN",
      isActive: true,
    });

    // Seed VOTER_SERVICE (for Phase 2 prep)
    await serviceRepository.upsert("VOTER_SERVICE", {
      name: "Voter ID Service",
      description: "Verify Voter ID card status and retrieve details",
      category: "VOTER",
      isActive: true,
    });

    console.log("Seeding completed successfully.");
  }
}

export const serviceService = new ServiceService();
