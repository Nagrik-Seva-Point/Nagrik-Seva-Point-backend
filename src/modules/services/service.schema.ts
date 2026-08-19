import { z } from "zod";

export const queryServiceSchema = z.object({
  category: z.string().optional(),
});

export type QueryServiceInput = z.infer<typeof queryServiceSchema>;
