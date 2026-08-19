export interface HonoVariables {
  requestId: string;
  user?: any;
  session?: any;
  organizationId?: string;
  organization?: any;
  validData?: any;
}

export type ContextVariables = {
  Variables: HonoVariables;
};
