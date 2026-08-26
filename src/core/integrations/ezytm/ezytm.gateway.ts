import { ProxyAgent, fetch as undiciFetch } from "undici";
import { getEnvVar } from "../../config/env-helper";
import { AppError } from "../../errors/AppError";
import { logger } from "../../logger/logger";

export class EzytmGateway {
  private baseUrl: string;
  private tokenId: string;
  private apiUserId: string;
  private apiPassword: string;
  private apiMode: string;
  private proxyUrl?: string;

  constructor() {
    this.baseUrl = (getEnvVar("EZYTM_BASE_URL") || "https://planapi.in")
      .replace(/\/+$/, "");
    this.tokenId =
      (getEnvVar("EZYTM_TOKEN_ID") || getEnvVar("PLANAPI_TOKEN_ID") || "")
        .replace(/["']/g, "").trim();
    this.apiUserId =
      (getEnvVar("EZYTM_API_USER_ID") || getEnvVar("PLANAPI_API_USER_ID") || "")
        .replace(/["']/g, "").trim();
    this.apiPassword =
      (getEnvVar("EZYTM_API_PASSWORD") || getEnvVar("PLANAPI_API_PASSWORD") ||
        "").replace(/["']/g, "").trim();
    this.apiMode = (getEnvVar("EZYTM_API_MODE") || "1").replace(/["']/g, "")
      .trim();
    const rawProxy = getEnvVar("EZYTM_PROXY_URL") || getEnvVar("FIXIE_URL") ||
      getEnvVar("QUOTAGUARDSTATIC_URL") || getEnvVar("HTTPS_PROXY") || getEnvVar("HTTP_PROXY");
    this.proxyUrl = rawProxy ? rawProxy.replace(/["']/g, "").trim() : undefined;
  }

  public getProxyUrl(): string | undefined {
    const rawProxy =
      getEnvVar("EZYTM_PROXY_URL") ||
      getEnvVar("WEBSHARE_URL") ||
      getEnvVar("WEBSHARE_PROXY_URL") ||
      getEnvVar("PROXY_URL") ||
      getEnvVar("STATIC_PROXY_URL") ||
      getEnvVar("FIXIE_URL") ||
      getEnvVar("QUOTAGUARDSTATIC_URL") ||
      getEnvVar("HTTPS_PROXY") ||
      getEnvVar("HTTP_PROXY");

    return rawProxy ? rawProxy.replace(/["']/g, "").trim() : undefined;
  }

  public isConfigured(): boolean {
    const token = this.tokenId.toLowerCase();
    const user = this.apiUserId.toLowerCase();
    const pass = this.apiPassword.toLowerCase();

    if (!token || !user || !pass) return false;

    const dummyMarkers = [
      "your-token",
      "your-api",
      "xxxx",
      "abcd",
      "placeholder",
      "test",
    ];

    for (const marker of dummyMarkers) {
      if (
        token.includes(marker) || user.includes(marker) || pass.includes(marker)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Generic form POST dispatcher with standard EzyTM/PlanAPI headers & form encoding.
   * Throws typed AppError on failure. No dummy fallback on live failure.
   */
  public async postForm<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const isTestEnv = typeof process !== "undefined"
      ? process.env.NODE_ENV === "test" || process.env.DENO_TESTING === "1"
      : typeof (globalThis as any).Deno !== "undefined"
      ? (globalThis as any).Deno.env.get("NODE_ENV") === "test" ||
        (globalThis as any).Deno.env.get("DENO_TESTING") === "1"
      : false;

    if (!this.isConfigured()) {
      if (isTestEnv) {
        logger.warn(`[EzyTM Gateway] Test simulation active for ${endpoint}`);
        if (endpoint.includes("AadharToPanFind")) {
          return {
            Errorcode: 100,
            Status: "Success",
            Data: {
              PanNumber: "ABCDE1234F",
              AadharNumber: `XXXXXXXX${params.Aadhaarid?.slice(-4) || "1234"}`,
            },
          } as T;
        }
        if (endpoint.includes("PanDetails")) {
          return {
            Errorcode: 100,
            status: "Success",
            msg: "done",
            data: {
              pan_number: params.Panid || "ABCDE1234F",
              full_name: "abc xyz",
              masked_aadhaar: "XXXXXXXX1234",
              dob: "2001-11-23",
              gender: "M",
              aadhaar_linked: true,
              category: "person",
            },
          } as T;
        }
      }

      logger.error(
        "[EzyTM Gateway] API credentials not configured in environment variables.",
      );
      throw AppError.badGateway(
        "EzyTM vendor credentials (EZYTM_TOKEN_ID, EZYTM_API_USER_ID, EZYTM_API_PASSWORD) are not configured.",
        "GATEWAY_NOT_CONFIGURED",
      );
    }

    const url = `${this.baseUrl}${
      endpoint.startsWith("/") ? endpoint : `/${endpoint}`
    }`;
    const headers: Record<string, string> = {
      "TokenID": this.tokenId,
      "ApiUserID": this.apiUserId,
      "ApiPassword": this.apiPassword,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams({ ...params, ApiMode: this.apiMode });
    logger.info(`[EzyTM Gateway] Dispatching POST to ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const activeProxyUrl = this.getProxyUrl() || this.proxyUrl;
    let dispatcher: ProxyAgent | undefined = undefined;

    if (activeProxyUrl) {
      try {
        dispatcher = new ProxyAgent(activeProxyUrl);
        const maskedProxy = activeProxyUrl.replace(/:[^:@]+@/, ":****@");
        logger.info(`[EzyTM Gateway] Routing request through Static IP Proxy: ${maskedProxy}`);
      } catch (err) {
        logger.error(`[EzyTM Gateway] Failed to create ProxyAgent with URL "${activeProxyUrl}":`, err);
      }
    } else {
      logger.warn("[EzyTM Gateway] ⚠️ NO PROXY URL found in environment (checked EZYTM_PROXY_URL, WEBSHARE_URL, PROXY_URL, HTTPS_PROXY). Using direct connection.");
    }

    try {
      const fetchFunction = dispatcher ? undiciFetch : fetch;

      const response = await fetchFunction(url, {
        method: "POST",
        headers,
        body: body.toString(),
        signal: controller.signal,
        // @ts-ignore
        dispatcher,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      try {
        const json = JSON.parse(text) as T;
        return json;
      } catch {
        logger.error(`[EzyTM Gateway] Non-JSON response from ${url}:`, text);
        throw AppError.badGateway(
          `Invalid JSON response from gateway (HTTP ${response.status})`,
          "GATEWAY_INVALID_RESPONSE",
        );
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        logger.error(
          `[EzyTM Gateway] Timeout after 15s communicating with ${url}`,
        );
        throw AppError.badGateway(
          "EzyTM gateway connection timed out",
          "GATEWAY_TIMEOUT",
        );
      }
      logger.error(`[EzyTM Gateway] Connection error to ${url}:`, err);
      throw AppError.badGateway(
        err.message || "Failed to communicate with EzyTM gateway",
        "GATEWAY_COMMUNICATION_ERROR",
      );
    }
  }
}

export const ezytmGateway = new EzytmGateway();
