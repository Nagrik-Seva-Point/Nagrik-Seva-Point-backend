import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "./app/app";

export const config = {
  runtime: "nodejs",
};

async function nodeReqToWebRequest(req: IncomingMessage): Promise<Request> {
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    req.headers.host ||
    "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string) || "https";
  const url = `${proto}://${host}${req.url || "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method || "GET";
  let body: Uint8Array | string | undefined = undefined;

  if (method !== "GET" && method !== "HEAD") {
    const vercelReq = req as IncomingMessage & {
      rawBody?: Buffer;
      body?: any;
    };

    if (vercelReq.rawBody && Buffer.isBuffer(vercelReq.rawBody)) {
      body = new Uint8Array(vercelReq.rawBody);
    } else if (
      vercelReq.body !== undefined &&
      typeof vercelReq.body === "object" &&
      !Buffer.isBuffer(vercelReq.body)
    ) {
      body = JSON.stringify(vercelReq.body);
    } else if (typeof vercelReq.body === "string") {
      body = vercelReq.body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length > 0) {
        body = new Uint8Array(Buffer.concat(chunks));
      }
    }
  }

  return new Request(url, {
    method,
    headers,
    body,
    // @ts-ignore
    duplex: "half",
  });
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const webRequest = await nodeReqToWebRequest(req);
    const webResponse = await app.fetch(webRequest);

    res.statusCode = webResponse.status;
    res.statusMessage = webResponse.statusText;

    const setCookies: string[] = [];
    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        setCookies.push(value);
      } else {
        res.setHeader(key, value);
      }
    });

    if ((webResponse.headers as any).getSetCookie) {
      const allCookies = (webResponse.headers as any).getSetCookie();
      if (Array.isArray(allCookies) && allCookies.length > 0) {
        res.setHeader("set-cookie", allCookies);
      }
    } else if (setCookies.length > 0) {
      res.setHeader("set-cookie", setCookies);
    }

    if (webResponse.body) {
      const arrayBuffer = await webResponse.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error("Vercel Serverless Handler Error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: err?.message,
        }),
      );
    }
  }
}
