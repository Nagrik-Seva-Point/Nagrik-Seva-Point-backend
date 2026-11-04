import { z } from "zod";

export const checkAvailabilitySchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  phone: z
    .string()
    .regex(
      /^[6-9]\d{9}$/,
      "Mobile number must be a valid 10-digit Indian phone number",
    )
    .optional(),
});

export const registerRetailerSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters").max(100),
  phone: z
    .string()
    .regex(
      /^[6-9]\d{9}$/,
      "Mobile number must be a valid 10-digit Indian phone number",
    ),
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
    .min(3, "Please enter your Email or 10-digit Mobile Number")
    .refine((val) => {
      const clean = val.trim();
      if (clean.includes("@")) {
        return z.string().email().safeParse(clean).success;
      }
      const digits = clean.replace(/\D/g, "");
      return digits.length === 10;
    }, "Please enter a valid email address or 10-digit mobile number"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters").max(100).optional(),
  phone: z
    .string()
    .regex(
      /^[6-9]\d{9}$/,
      "Mobile number must be a valid 10-digit Indian phone number",
    )
    .optional(),
  cyberCafeName: z
    .string()
    .min(3, "Cyber Café / Shop name must be at least 3 characters")
    .max(120)
    .optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(3, "Please enter your registered Email or 10-digit Mobile Number")
    .max(120)
    .refine((val) => {
      const clean = val.trim();
      if (clean.includes("@")) {
        return z.string().email().safeParse(clean).success;
      }
      const digits = clean.replace(/\D/g, "");
      return digits.length === 10;
    }, "Please enter a valid email address or 10-digit mobile number"),
  redirectTo: z.string().optional(),
});

export const verifyResetOtpSchema = z.object({
  identifier: z
    .string()
    .min(3, "Please enter your registered Email or 10-digit Mobile Number")
    .max(120)
    .refine((val) => {
      const clean = val.trim();
      if (clean.includes("@")) {
        return z.string().email().safeParse(clean).success;
      }
      const digits = clean.replace(/\D/g, "");
      return digits.length === 10;
    }, "Please enter a valid email address or 10-digit mobile number"),
  otp: z
    .string()
    .length(6, "OTP must be a 6-digit numeric code")
    .regex(/^\d{6}$/, "OTP must contain digits only"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;
export type RegisterRetailerInput = z.infer<typeof registerRetailerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyResetOtpInput = z.infer<typeof verifyResetOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
