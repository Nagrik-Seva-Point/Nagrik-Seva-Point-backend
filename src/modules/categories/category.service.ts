import { categoryRepository } from "./category.repository.ts";
import { AppError } from "../../core/errors/AppError.ts";
import { logger } from "../../core/logger/logger.ts";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.schema.ts";

export class CategoryService {
  async getCategories(isActive = true) {
    const categories = await categoryRepository.findMany(isActive);
    return categories.map((cat) => ({
      id: cat.id,
      code: cat.code,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
      serviceCount: cat._count.services,
    }));
  }

  async getAllAdminCategories() {
    const categories = await categoryRepository.findMany();
    return categories.map((cat) => ({
      id: cat.id,
      code: cat.code,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
      serviceCount: cat._count.services,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));
  }

  async getCategoryById(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw AppError.notFound(`Category with ID ${id} not found`);
    }
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      icon: category.icon,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      serviceCount: category._count.services,
    };
  }

  async createCategory(input: CreateCategoryInput) {
    const normalizedCode = input.code.toUpperCase().trim();
    const existing = await categoryRepository.findByCode(normalizedCode);
    if (existing) {
      throw AppError.badRequest(
        `Category with code "${normalizedCode}" already exists.`,
        "CATEGORY_EXISTS",
      );
    }

    const created = await categoryRepository.create(input);
    logger.info(`Admin created new category: ${created.code} (${created.name})`);
    return await this.getCategoryById(created.id);
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    const existing = await categoryRepository.findById(id);
    if (!existing) {
      throw AppError.notFound(`Category with ID ${id} not found`);
    }

    const updated = await categoryRepository.update(id, input);
    logger.info(`Admin updated category: ${updated.code}`);
    return await this.getCategoryById(updated.id);
  }

  async deleteCategory(id: string) {
    const existing = await categoryRepository.findById(id);
    if (!existing) {
      throw AppError.notFound(`Category with ID ${id} not found`);
    }

    await categoryRepository.delete(id);
    logger.info(`Admin deleted category: ${existing.code} (${existing.name})`);
    return {
      success: true,
      message: `Category "${existing.name}" (${existing.code}) deleted successfully.`,
    };
  }
}

export const categoryService = new CategoryService();
