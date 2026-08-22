import { Hono } from "hono";
import { categoryService } from "./category.service.ts";
import {
  type CreateCategoryInput,
  createCategorySchema,
  type UpdateCategoryInput,
  updateCategorySchema,
} from "./category.schema.ts";
import { validationMiddleware } from "../../middleware/validation.middleware.ts";
import { requireAdmin } from "../../middleware/admin.middleware.ts";
import type { ContextVariables } from "../../app/context.ts";

export const categoryRouter = new Hono<ContextVariables>();
export const adminCategoryRouter = new Hono<ContextVariables>();

// Public / Retailer Category Listing
categoryRouter.get("/", async (c) => {
  const categories = await categoryService.getCategories(true);
  return c.json({
    success: true,
    data: categories,
  });
});

// Admin Category Routes (Protected with requireAdmin)
adminCategoryRouter.use("*", requireAdmin());

adminCategoryRouter.get("/", async (c) => {
  const categories = await categoryService.getAllAdminCategories();
  return c.json({
    success: true,
    data: categories,
  });
});

adminCategoryRouter.post(
  "/",
  validationMiddleware(createCategorySchema),
  async (c) => {
    const body = c.get("validData") as CreateCategoryInput;
    const category = await categoryService.createCategory(body);
    return c.json(
      {
        success: true,
        data: category,
      },
      201,
    );
  },
);

adminCategoryRouter.put(
  "/:id",
  validationMiddleware(updateCategorySchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.get("validData") as UpdateCategoryInput;
    const category = await categoryService.updateCategory(id, body);
    return c.json({
      success: true,
      data: category,
    });
  },
);

adminCategoryRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await categoryService.deleteCategory(id);
  return c.json(result);
});
