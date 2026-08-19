export const CONSTANTS = {
  API_PREFIX: "/api/v1",
  SENSITIVE_FIELDS: ["aadhaar", "voterId", "pan", "dob", "password"],
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 10,
} as const;
