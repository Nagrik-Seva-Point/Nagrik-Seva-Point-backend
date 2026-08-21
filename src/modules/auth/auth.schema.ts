import { z } from "zod";

export const checkAvailabilitySchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Mobile number must be a valid 10-digit Indian phone number")
    .optional(),
});

export const registerRetailerSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters").max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Mobile number must be a valid 10-digit Indian phone number"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  cyberCafeName: z
    .string()
    .min(3, "Cyber Café / Shop name must be at least 3 characters")
    .max(120),
});

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, "Please enter your Email or 10-digit Mobile Number"),
  password: z.string().min(1, "Password is required"),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;
export type RegisterRetailerInput = z.infer<typeof registerRetailerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
