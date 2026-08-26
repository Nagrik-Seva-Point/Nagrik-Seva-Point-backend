var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler2 = i === middleware.length && next || void 0;
      }
      if (handler2) {
        try {
          res = await handler2(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/body.js
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = tryDecodeURIComponent(value);
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    for (const anyCachedKey in bodyCache) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    ;
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) {
        if (key === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) {
          if (++count > 1 || typeof headers[k] !== "string") {
            responseHeaders = new Headers();
            break;
          }
        }
      }
      if (responseHeaders) {
        for (const k in headers) {
          const v = headers[k];
          if (typeof v === "string") {
            responseHeaders.set(k, v);
          } else {
            responseHeaders.delete(k);
            for (const v2 of v) {
              responseHeaders.append(k, v2);
            }
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler2) => {
          this.#addRoute(method, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler2) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler2);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler2;
      if (app2.errorHandler === errorHandler) {
        handler2 = r.handler;
      } else {
        handler2 = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler2);
    return this;
  }
  #addRoute(method, path, handler2, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler: handler2
    };
    this.router.add(method, path, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env2, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env2, "GET")))();
    }
    const path = this.getPath(request, { env: env2 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env2,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  // handler index of a dynamic path, or -1 for a static path terminal
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
        if (name && pattern[2]) {
          if (regexpStr === ".*") {
            throw PATH_ERROR;
          }
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) {
            throw PATH_ERROR;
          }
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
            throw PATH_ERROR;
          }
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
            for (const k in node.#children) {
              if (
                // a single-char pattern coexists with single-char literals as a literal does
                (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
              ) {
                throw PATH_ERROR;
              }
            }
          }
          nextNode = node.#children[regexpStr] = new _Node();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) {
            if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
              throw PATH_ERROR;
            }
          }
          nextNode = node.#children[token] = new _Node();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) {
      throw PATH_ERROR;
    }
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  // dynamic path -> [handler index, param assoc]; static paths are not registered
  paths = /* @__PURE__ */ Object.create(null);
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#tries = { [METHOD_NAME_ALL]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
          this.#insertPath(method, p);
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      Object.keys(middleware).forEach((m) => {
        if ((method === METHOD_NAME_ALL || method === m) && !middleware[m][path]) {
          this.#insertPath(m, path);
          middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        }
      });
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler2, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler2, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          if (!routes[m][path2]) {
            this.#insertPath(m, path2);
            routes[m][path2] = [
              ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
            ];
          }
          routes[m][path2].push([handler2, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = this.#tries = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = /* @__PURE__ */ Object.create(null);
    const handlerData = [];
    [middleware, routes].forEach((r) => {
      for (const path in r) {
        const handlers = r[path];
        const pathData = trie.paths[path];
        if (!pathData) {
          staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
          continue;
        }
        const paramAssoc = pathData[1];
        handlerData[pathData[0]] = handlers.map(([h, paramCount]) => {
          const paramIndexMap = /* @__PURE__ */ Object.create(null);
          paramCount -= 1;
          for (; paramCount >= 0; paramCount--) {
            const [key, value] = paramAssoc[paramCount];
            paramIndexMap[key] = value;
          }
          return [h, paramIndexMap];
        });
      }
    });
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (let i = 0, len = handlerData.length; i < len; i++) {
      for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
        const map = handlerData[i][j]?.[1];
        if (!map) {
          continue;
        }
        const keys = Object.keys(map);
        for (let k = 0, len3 = keys.length; k < len3; k++) {
          map[keys[k]] = paramReplacementMap[map[keys[k]]];
        }
      }
    }
    const handlerMap = [];
    for (const i in indexReplacementMap) {
      handlerMap[i] = handlerData[indexReplacementMap[i]];
    }
    return [regexp, handlerMap, staticMap];
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler2) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler2]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler2, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler2) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler: handler2, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler2) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler: handler2,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler2) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler2);
      }
      return;
    }
    this.#node.insert(method, path, handler2);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "QUERY"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    } else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else {
      return () => "";
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (exposeHeadersStr) {
      set("Access-Control-Expose-Headers", exposeHeadersStr);
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) {
        set("Access-Control-Allow-Methods", allowMethods);
      }
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
        }
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/utils/color.js
function getColorEnabled() {
  const { process: process2, Deno: Deno2 } = globalThis;
  const isNoColor = typeof Deno2?.noColor === "boolean" ? Deno2.noColor : process2 !== void 0 ? (
    // eslint-disable-next-line no-unsafe-optional-chaining
    "NO_COLOR" in process2?.env
  ) : false;
  return !isNoColor;
}
async function getColorEnabledAsync() {
  const { navigator } = globalThis;
  const cfWorkers = "cloudflare:workers";
  const isNoColor = navigator !== void 0 && navigator.userAgent === "Cloudflare-Workers" ? await (async () => {
    try {
      return "NO_COLOR" in ((await import(cfWorkers)).env ?? {});
    } catch {
      return false;
    }
  })() : !getColorEnabled();
  return !isNoColor;
}

// node_modules/.deno/hono@4.13.2/node_modules/hono/dist/middleware/logger/index.js
var humanize = (times) => {
  const [delimiter, separator] = [",", "."];
  const orderTimes = times.map((v) => v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + delimiter));
  return orderTimes.join(separator);
};
var time = (start) => {
  const delta = Date.now() - start;
  return humanize([delta < 1e3 ? delta + "ms" : Math.round(delta / 1e3) + "s"]);
};
var colorStatus = async (status) => {
  const colorEnabled = await getColorEnabledAsync();
  if (colorEnabled) {
    switch (status / 100 | 0) {
      case 5:
        return `\x1B[31m${status}\x1B[0m`;
      case 4:
        return `\x1B[33m${status}\x1B[0m`;
      case 3:
        return `\x1B[36m${status}\x1B[0m`;
      case 2:
        return `\x1B[32m${status}\x1B[0m`;
    }
  }
  return `${status}`;
};
async function log(fn, prefix, method, path, status = 0, elapsed) {
  const out = prefix === "<--" ? `${prefix} ${method} ${path}` : `${prefix} ${method} ${path} ${await colorStatus(status)} ${elapsed}`;
  fn(out);
}
var logger = (fn = console.log) => {
  return async function logger22(c, next) {
    const { method, url } = c.req;
    const path = url.slice(url.indexOf("/", 8));
    await log(fn, "<--", method, path);
    const start = Date.now();
    await next();
    await log(fn, "-->", method, path, c.res.status, time(start));
  };
};

// src/core/config/constants.ts
var CONSTANTS = {
  API_PREFIX: "/api/v1"
};

// src/core/errors/AppError.ts
var AppError = class _AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_SERVER_ERROR", details) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = "AppError";
  }
  message;
  statusCode;
  code;
  details;
  static badRequest(message, code = "BAD_REQUEST", details) {
    return new _AppError(message, 400, code, details);
  }
  static unauthorized(message, code = "UNAUTHORIZED") {
    return new _AppError(message, 401, code);
  }
  static forbidden(message, code = "FORBIDDEN") {
    return new _AppError(message, 403, code);
  }
  static notFound(message, code = "NOT_FOUND") {
    return new _AppError(message, 404, code);
  }
  static conflict(message, code = "CONFLICT") {
    return new _AppError(message, 409, code);
  }
  static internal(message, code = "INTERNAL_SERVER_ERROR") {
    return new _AppError(message, 500, code);
  }
  static badGateway(message, code = "BAD_GATEWAY", details) {
    return new _AppError(message, 502, code, details);
  }
};

// src/core/logger/logger.ts
var Logger = class {
  format(level, message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  }
  info(message, ...args) {
    console.info(this.format("info", message), ...args);
  }
  warn(message, ...args) {
    console.warn(this.format("warn", message), ...args);
  }
  error(message, ...args) {
    console.error(this.format("error", message), ...args);
  }
  debug(message, ...args) {
    console.debug(this.format("debug", message), ...args);
  }
};
var logger2 = new Logger();

// src/core/errors/error-handler.ts
var errorHandler2 = (err, c) => {
  const requestId = c.get("requestId") || "unknown";
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId
        }
      },
      err.statusCode
    );
  }
  logger2.error(`[Unhandled Error] RequestID: ${requestId} - Error:`, err);
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again.",
        requestId
      }
    },
    500
  );
};

// src/middleware/request-id.middleware.ts
var requestIdMiddleware = () => {
  return async (c, next) => {
    const id = crypto.randomUUID();
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await next();
  };
};

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/.deno/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/core/config/env-helper.ts
import "dotenv/config";
var getEnvVar = (key) => {
  if (typeof process !== "undefined" && process.env && process.env[key] !== void 0) {
    return process.env[key];
  }
  const runtime = globalThis;
  if (runtime.Deno?.env) {
    return runtime.Deno.env.get(key);
  }
  return void 0;
};

// src/core/config/env.ts
var envSchema = external_exports.object({
  DATABASE_URL: external_exports.string().url(),
  BETTER_AUTH_SECRET: external_exports.string().min(1),
  BETTER_AUTH_URL: external_exports.string().url(),
  CORS_ORIGIN: external_exports.string().min(1).transform((value, ctx) => {
    const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean).map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `Invalid CORS origin: ${origin}`
        });
        return external_exports.NEVER;
      }
    });
    return [...new Set(origins)];
  }),
  PORT: external_exports.string().default("8000").transform((v) => parseInt(v, 10)),
  GOOGLE_CLIENT_ID: external_exports.string().optional(),
  GOOGLE_CLIENT_SECRET: external_exports.string().optional()
});
var getEnv = () => {
  const result = envSchema.safeParse({
    DATABASE_URL: getEnvVar("DATABASE_URL"),
    BETTER_AUTH_SECRET: getEnvVar("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: getEnvVar("BETTER_AUTH_URL"),
    CORS_ORIGIN: getEnvVar("CORS_ORIGIN"),
    PORT: getEnvVar("PORT") || "8000",
    GOOGLE_CLIENT_ID: getEnvVar("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: getEnvVar("GOOGLE_CLIENT_SECRET")
  });
  if (!result.success) {
    console.error("\u274C Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables configuration");
  }
  return result.data;
};
var env = getEnv();

// src/core/config/cors.ts
var CORS_ALLOW_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD"
];
var CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "User-Agent",
  "X-Requested-With",
  "X-Organization-Id",
  "x-guest-session-id",
  "Accept",
  "Origin",
  "Cookie",
  "Set-Cookie"
];
var getAllowedCorsOrigin = (origin) => {
  if (!origin) {
    return void 0;
  }
  const cleanOrigin = origin.trim().toLowerCase();
  return env.CORS_ORIGIN.some((o) => o.toLowerCase() === cleanOrigin) ? origin : void 0;
};

// src/core/auth/better-auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";

// src/core/db/prisma.ts
import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
var { PrismaClient } = pkg;
var databaseUrl = getEnvVar("DATABASE_URL");
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
var globalCtx = globalThis;
if (!globalCtx.__prismaPool) {
  globalCtx.__prismaPool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 1e4
  });
}
var pool = globalCtx.__prismaPool;
if (!globalCtx.__prismaClient) {
  const adapter = new PrismaPg(pool);
  globalCtx.__prismaClient = new PrismaClient({ adapter });
}
var prisma = globalCtx.__prismaClient;

// src/core/auth/better-auth.ts
import { bearer, organization } from "better-auth/plugins";
var getCookieDomain = () => {
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return void 0;
    }
    const parts = url.hostname.split(".");
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join(".")}`;
    }
    return void 0;
  } catch {
    return void 0;
  }
};
var cookieDomain = getCookieDomain();
var auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  trustedOrigins: env.CORS_ORIGIN,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false
  },
  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
        input: true
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false
        // Prevents regular users from setting role during signup
      }
    }
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"]
    }
  },
  socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      disableSignUp: true
      // Only allow registered users to log in with Google
    }
  } : void 0,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const body = ctx.body;
        if (body && typeof body.phone === "string" && body.phone.trim()) {
          const cleanPhone = body.phone.trim();
          const existing = await prisma.user.findFirst({
            where: { phone: cleanPhone }
          });
          if (existing) {
            throw new APIError("BAD_REQUEST", {
              message: `An account with mobile number ${cleanPhone} already exists. Please sign in instead.`
            });
          }
          body.phone = cleanPhone;
        }
      }
    })
  },
  advanced: {
    trustHost: true,
    crossSubDomainCookies: cookieDomain ? {
      enabled: true,
      domain: cookieDomain
    } : void 0,
    defaultCookieAttributes: {
      domain: cookieDomain,
      sameSite: cookieDomain ? "lax" : "none",
      secure: true,
      httpOnly: true,
      path: "/"
    }
  },
  plugins: [
    organization(),
    // Better Auth multi-tenant organization support
    bearer()
    // Enables Authorization: Bearer <token>
  ]
});

// src/middleware/validation.middleware.ts
var validationMiddleware = (schema, target = "json") => {
  return async (c, next) => {
    let data;
    try {
      if (target === "json") {
        data = await c.req.json();
      } else {
        data = c.req.query();
      }
    } catch {
      throw AppError.badRequest("Invalid request format");
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      throw AppError.badRequest(
        "Validation failed",
        "VALIDATION_FAILED",
        result.error.format()
      );
    }
    c.set("validData", result.data);
    await next();
  };
};

// src/modules/auth/auth.service.ts
var AuthService = class {
  /**
   * Checks if an email or phone is already registered before moving to next step.
   */
  async checkAvailability(data) {
    if (data.email) {
      const cleanEmail = data.email.toLowerCase().trim();
      const existingEmail = await prisma.user.findFirst({
        where: { email: cleanEmail }
      });
      if (existingEmail) {
        return {
          available: false,
          field: "email",
          message: "An account with this email address already exists. Please sign in instead."
        };
      }
    }
    if (data.phone) {
      const cleanPhone = data.phone.trim();
      const existingPhone = await prisma.user.findFirst({
        where: { phone: cleanPhone }
      });
      if (existingPhone) {
        return {
          available: false,
          field: "phone",
          message: "An account with this mobile number already exists. Please sign in instead."
        };
      }
    }
    return {
      available: true,
      message: "Credentials available"
    };
  }
  /**
   * Registers a new Cyber Café partner, atomically creates their Organization,
   * assigns the owner membership, provisions a wallet, and returns active session.
   */
  async registerRetailer(data, headers) {
    const cleanEmail = data.email.toLowerCase().trim();
    const cleanPhone = data.phone.trim();
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { phone: cleanPhone }]
      }
    });
    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        throw AppError.badRequest(
          "An account with this email address already exists. Please sign in instead.",
          "EMAIL_EXISTS"
        );
      }
      if (existingUser.phone === cleanPhone) {
        throw AppError.badRequest(
          "An account with this mobile number already exists. Please sign in instead.",
          "PHONE_EXISTS"
        );
      }
    }
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: data.name.trim(),
        email: cleanEmail,
        password: data.password,
        phone: cleanPhone
      },
      headers
    });
    if (!signUpResult || !signUpResult.user) {
      throw AppError.internal(
        "Failed to initialize user authentication credentials"
      );
    }
    const userId = signUpResult.user.id;
    const slugBase = data.cyberCafeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const randomSuffix = Math.floor(1e3 + Math.random() * 9e3);
    const slug = `${slugBase || "cyber-point"}-${randomSuffix}`;
    const organization2 = await prisma.organization.create({
      data: {
        name: data.cyberCafeName.trim(),
        slug,
        members: {
          create: {
            userId,
            role: "owner"
          }
        },
        wallet: {
          create: {
            balance: 0,
            currency: "INR"
          }
        }
      },
      include: {
        wallet: true
      }
    });
    if (signUpResult.token) {
      await prisma.session.updateMany({
        where: { token: signUpResult.token },
        data: { activeOrganizationId: organization2.id }
      });
    }
    logger2.info(
      `Retailer successfully registered: ${userId} with Cyber Caf\xE9: ${organization2.id} (${organization2.name})`
    );
    return {
      user: {
        id: signUpResult.user.id,
        name: signUpResult.user.name,
        email: signUpResult.user.email,
        phone: cleanPhone
      },
      organization: {
        id: organization2.id,
        name: organization2.name,
        slug: organization2.slug,
        role: "owner",
        walletBalance: 0
      },
      token: signUpResult.token
    };
  }
  /**
   * Smart login supporting both Email + Password and Phone (10 Digits) + Password.
   */
  async login(data, headers) {
    const rawIdentifier = data.identifier.trim();
    let targetEmail = rawIdentifier.toLowerCase();
    if (!rawIdentifier.includes("@")) {
      const user = await prisma.user.findUnique({
        where: { phone: rawIdentifier }
      });
      if (!user) {
        throw AppError.unauthorized(
          "Invalid mobile number or password",
          "AUTH_FAILED"
        );
      }
      targetEmail = user.email;
    }
    try {
      const signInResult = await auth.api.signInEmail({
        body: {
          email: targetEmail,
          password: data.password
        },
        headers
      });
      if (!signInResult || !signInResult.user) {
        throw AppError.unauthorized("Invalid credentials", "AUTH_FAILED");
      }
      const userId = signInResult.user.id;
      const membership = await prisma.member.findFirst({
        where: { userId },
        include: {
          organization: {
            include: {
              wallet: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      });
      if (membership && signInResult.token) {
        await prisma.session.updateMany({
          where: { token: signInResult.token },
          data: { activeOrganizationId: membership.organizationId }
        });
      }
      logger2.info(`User ${userId} logged in successfully.`);
      return {
        user: {
          id: signInResult.user.id,
          name: signInResult.user.name,
          email: signInResult.user.email
        },
        organization: membership ? {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          role: membership.role,
          walletBalance: membership.organization.wallet ? Number(membership.organization.wallet.balance) : 0
        } : null,
        token: signInResult.token
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger2.error("Login verification error:", error);
      throw AppError.unauthorized(
        "Invalid email, mobile number or password",
        "AUTH_FAILED"
      );
    }
  }
};
var authService = new AuthService();

// src/modules/auth/auth.schema.ts
var checkAvailabilitySchema = external_exports.object({
  email: external_exports.string().email("Invalid email format").optional(),
  phone: external_exports.string().regex(
    /^[6-9]\d{9}$/,
    "Mobile number must be a valid 10-digit Indian phone number"
  ).optional()
});
var registerRetailerSchema = external_exports.object({
  name: external_exports.string().min(2, "Full name must be at least 2 characters").max(100),
  phone: external_exports.string().regex(
    /^[6-9]\d{9}$/,
    "Mobile number must be a valid 10-digit Indian phone number"
  ),
  email: external_exports.string().email("Invalid email format"),
  password: external_exports.string().min(8, "Password must be at least 8 characters"),
  cyberCafeName: external_exports.string().min(3, "Cyber Caf\xE9 / Shop name must be at least 3 characters").max(120)
});
var loginSchema = external_exports.object({
  identifier: external_exports.string().min(3, "Please enter your Email or 10-digit Mobile Number"),
  password: external_exports.string().min(1, "Password is required")
});

// src/modules/auth/auth.routes.ts
var authRoutes = new Hono2();
authRoutes.post(
  "/check-availability",
  validationMiddleware(checkAvailabilitySchema),
  async (c) => {
    const data = c.get("validData");
    const result = await authService.checkAvailability(data);
    return c.json({ success: true, ...result });
  }
);
authRoutes.post(
  "/register",
  validationMiddleware(registerRetailerSchema),
  async (c) => {
    const data = c.get("validData");
    const result = await authService.registerRetailer(data, c.req.raw.headers);
    return c.json({ success: true, data: result }, 201);
  }
);
authRoutes.post(
  "/login",
  validationMiddleware(loginSchema),
  async (c) => {
    const data = c.get("validData");
    const result = await authService.login(data, c.req.raw.headers);
    return c.json({ success: true, data: result });
  }
);
authRoutes.get("/me", async (c) => {
  const context = c.get("requestContext");
  const user = c.get("user");
  const organization2 = c.get("organization");
  return c.json({
    success: true,
    data: {
      accessMode: context.accessMode,
      pricingTier: context.pricingTier,
      user: user || null,
      organization: organization2 || null
    }
  });
});

// src/middleware/auth.middleware.ts
var authMiddleware = () => {
  return async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers
    });
    if (!session) {
      throw AppError.unauthorized("Authentication required");
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
};

// src/middleware/organization.middleware.ts
var organizationMiddleware = () => {
  return async (c, next) => {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) {
      throw AppError.unauthorized("Authentication required");
    }
    let organizationId = session.activeOrganizationId ?? null;
    if (!organizationId) {
      organizationId = c.req.header("X-Organization-Id") || null;
    }
    if (!organizationId) {
      throw AppError.badRequest(
        "Organization context required",
        "ORGANIZATION_REQUIRED"
      );
    }
    const membership = await prisma.member.findFirst({
      where: {
        organizationId,
        userId: user.id
      },
      include: {
        organization: true
      }
    });
    if (!membership) {
      throw AppError.forbidden(
        "Access denied: You are not a member of this organization"
      );
    }
    c.set("organizationId", organizationId);
    c.set("organization", membership.organization);
    await next();
  };
};

// src/modules/customers/customer.repository.ts
var CustomerRepository = class {
  async create(organizationId, data) {
    return await prisma.customer.create({
      data: {
        organizationId,
        name: data.name,
        phone: data.phone
      }
    });
  }
  async update(id, organizationId, data) {
    return await prisma.customer.update({
      where: {
        id,
        organizationId
        // Tenant Isolation
      },
      data: {
        name: data.name ?? void 0,
        phone: data.phone
      }
    });
  }
  async findById(id, organizationId) {
    return await prisma.customer.findFirst({
      where: {
        id,
        organizationId
        // Tenant Isolation
      }
    });
  }
  async findMany(organizationId, query) {
    const { search, page, limit } = query;
    const skip = (page - 1) * limit;
    const where = {
      organizationId
    };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } }
      ];
    }
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" }
      }),
      prisma.customer.count({ where })
    ]);
    return { items, total, page, limit };
  }
  async delete(id, organizationId) {
    return await prisma.customer.delete({
      where: {
        id,
        organizationId
        // Tenant Isolation
      }
    });
  }
};
var customerRepository = new CustomerRepository();

// src/modules/customers/customer.service.ts
var CustomerService = class {
  async createCustomer(organizationId, data) {
    return await customerRepository.create(organizationId, data);
  }
  async updateCustomer(id, organizationId, data) {
    await this.getCustomerById(id, organizationId);
    return await customerRepository.update(id, organizationId, data);
  }
  async getCustomerById(id, organizationId) {
    const customer = await customerRepository.findById(id, organizationId);
    if (!customer) {
      throw AppError.notFound(`Customer with ID ${id} not found`);
    }
    return customer;
  }
  async queryCustomers(organizationId, query) {
    return await customerRepository.findMany(organizationId, query);
  }
  async deleteCustomer(id, organizationId) {
    await this.getCustomerById(id, organizationId);
    return await customerRepository.delete(id, organizationId);
  }
};
var customerService = new CustomerService();

// src/modules/customers/customer.schema.ts
var createCustomerSchema = external_exports.object({
  name: external_exports.string().min(1, "Name is required").max(100),
  phone: external_exports.string().optional().nullable()
});
var updateCustomerSchema = external_exports.object({
  name: external_exports.string().min(1).max(100).optional(),
  phone: external_exports.string().optional().nullable()
});
var queryCustomerSchema = external_exports.object({
  search: external_exports.string().optional(),
  page: external_exports.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: external_exports.string().optional().transform((val) => val ? parseInt(val, 10) : 10)
});

// src/modules/customers/customer.routes.ts
var customerRoutes = new Hono2();
customerRoutes.use("*", authMiddleware());
customerRoutes.use("*", organizationMiddleware());
customerRoutes.post(
  "/",
  validationMiddleware(createCustomerSchema),
  async (c) => {
    const organizationId = c.get("organizationId");
    const data = c.get("validData");
    const customer = await customerService.createCustomer(organizationId, data);
    return c.json({ success: true, data: customer }, 201);
  }
);
customerRoutes.get(
  "/",
  validationMiddleware(queryCustomerSchema, "query"),
  async (c) => {
    const organizationId = c.get("organizationId");
    const query = c.get("validData");
    const result = await customerService.queryCustomers(organizationId, query);
    return c.json({ success: true, ...result });
  }
);
customerRoutes.get("/:id", async (c) => {
  const organizationId = c.get("organizationId");
  const id = c.req.param("id");
  const customer = await customerService.getCustomerById(id, organizationId);
  return c.json({ success: true, data: customer });
});
customerRoutes.patch(
  "/:id",
  validationMiddleware(updateCustomerSchema),
  async (c) => {
    const organizationId = c.get("organizationId");
    const id = c.req.param("id");
    const data = c.get("validData");
    const customer = await customerService.updateCustomer(
      id,
      organizationId,
      data
    );
    return c.json({ success: true, data: customer });
  }
);
customerRoutes.delete("/:id", async (c) => {
  const organizationId = c.get("organizationId");
  const id = c.req.param("id");
  await customerService.deleteCustomer(id, organizationId);
  return c.json({ success: true, message: "Customer deleted successfully" });
});

// src/modules/services/service.repository.ts
var ServiceRepository = class {
  async findMany(query, isGuest = false) {
    const { categoryId, categoryCode } = query;
    const where = {};
    if (categoryId) {
      where.categoryId = categoryId;
    } else if (categoryCode) {
      where.category = { code: categoryCode.toUpperCase() };
    }
    if (isGuest) {
      where.isPublicAllowed = true;
    } else {
      where.isRetailerAllowed = true;
    }
    return await prisma.service.findMany({
      where,
      include: {
        prices: true,
        category: true
      },
      orderBy: { name: "asc" }
    });
  }
  async findByCode(code) {
    return await prisma.service.findUnique({
      where: { code },
      include: {
        prices: true,
        category: true
      }
    });
  }
  async upsert(code, data) {
    return await prisma.service.upsert({
      where: { code },
      update: {
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        isRetailerAllowed: data.isRetailerAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false
      },
      create: {
        code,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        isRetailerAllowed: data.isRetailerAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false
      },
      include: {
        prices: true,
        category: true
      }
    });
  }
};
var serviceRepository = new ServiceRepository();

// src/modules/services/service.service.ts
var ServiceService = class {
  /**
   * Helper to resolve category ID from input (supports UUID or code string)
   */
  async resolveCategoryId(categoryIdOrCode) {
    if (!categoryIdOrCode) {
      const defaultCat2 = await prisma.serviceCategory.findFirst({
        where: { code: "IDENTITY_TAX" }
      });
      return defaultCat2?.id || null;
    }
    const byId = await prisma.serviceCategory.findUnique({
      where: { id: categoryIdOrCode }
    });
    if (byId) return byId.id;
    const byCode = await prisma.serviceCategory.findUnique({
      where: { code: categoryIdOrCode.toUpperCase() }
    });
    if (byCode) return byCode.id;
    const defaultCat = await prisma.serviceCategory.findFirst({
      where: { code: "IDENTITY_TAX" }
    });
    return defaultCat?.id || null;
  }
  /**
   * Public & Retailer contextual catalog listing
   */
  async getServices(context, query) {
    const isGuest = context.accessMode === "GUEST";
    const services = await serviceRepository.findMany(query, isGuest);
    return services.map((service) => {
      const publicPriceRecord = service.prices.find(
        (p) => p.pricingTier === "PUBLIC"
      );
      const partnerPriceRecord = service.prices.find(
        (p) => p.pricingTier === "PARTNER"
      );
      const goldPriceRecord = service.prices.find(
        (p) => p.pricingTier === "PARTNER_GOLD"
      );
      const enterprisePriceRecord = service.prices.find(
        (p) => p.pricingTier === "ENTERPRISE"
      );
      const publicPrice = publicPriceRecord ? Number(publicPriceRecord.amount) : 40;
      const partnerPrice = partnerPriceRecord ? Number(partnerPriceRecord.amount) : 25;
      const matchedPrice = service.prices.find(
        (p) => p.pricingTier === context.pricingTier
      ) || (context.accessMode === "GUEST" ? publicPriceRecord : partnerPriceRecord) || partnerPriceRecord || publicPriceRecord;
      const defaultAmount = context.accessMode === "GUEST" ? publicPrice : partnerPrice;
      return {
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        categoryId: service.categoryId,
        category: service.category ? {
          id: service.category.id,
          code: service.category.code,
          name: service.category.name
        } : null,
        isActive: service.isActive,
        isPublicAllowed: service.isPublicAllowed,
        isRetailerAllowed: service.isRetailerAllowed,
        requiresCustomer: service.requiresCustomer,
        requiresUpload: service.requiresUpload,
        producesDocument: service.producesDocument,
        publicPrice,
        partnerPrice,
        customerPrice: publicPrice,
        retailerPrice: partnerPrice,
        // Partner cost for retailer
        prices: {
          public: publicPrice,
          partner: partnerPrice,
          partnerGold: goldPriceRecord ? Number(goldPriceRecord.amount) : null,
          enterprise: enterprisePriceRecord ? Number(enterprisePriceRecord.amount) : null
        },
        pricing: {
          amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
          currency: matchedPrice ? matchedPrice.currency : "INR",
          tier: context.pricingTier
        }
      };
    });
  }
  /**
   * Get single service detail projected with caller's tier price
   */
  async getServiceByCode(code, context) {
    const normalizedCode = code.toUpperCase();
    const service = await serviceRepository.findByCode(normalizedCode);
    if (!service) {
      throw AppError.notFound(`Service with code ${code} not found`);
    }
    if (context && context.accessMode === "GUEST" && !service.isPublicAllowed) {
      throw AppError.forbidden("This service requires retailer authentication");
    }
    if (context && context.accessMode === "RETAILER" && !service.isRetailerAllowed) {
      throw AppError.forbidden(
        "This service is not enabled for retailer workspace"
      );
    }
    const publicPriceRecord = service.prices.find(
      (p) => p.pricingTier === "PUBLIC"
    );
    const partnerPriceRecord = service.prices.find(
      (p) => p.pricingTier === "PARTNER"
    );
    const goldPriceRecord = service.prices.find(
      (p) => p.pricingTier === "PARTNER_GOLD"
    );
    const enterprisePriceRecord = service.prices.find(
      (p) => p.pricingTier === "ENTERPRISE"
    );
    const publicPrice = publicPriceRecord ? Number(publicPriceRecord.amount) : 40;
    const partnerPrice = partnerPriceRecord ? Number(partnerPriceRecord.amount) : 25;
    const tier = context?.pricingTier || "PARTNER";
    const matchedPrice = service.prices.find((p) => p.pricingTier === tier) || (context?.accessMode === "GUEST" ? publicPriceRecord : partnerPriceRecord) || partnerPriceRecord || publicPriceRecord;
    const defaultAmount = context?.accessMode === "GUEST" ? publicPrice : partnerPrice;
    return {
      id: service.id,
      code: service.code,
      name: service.name,
      description: service.description,
      categoryId: service.categoryId,
      category: service.category ? {
        id: service.category.id,
        code: service.category.code,
        name: service.category.name
      } : null,
      isActive: service.isActive,
      isPublicAllowed: service.isPublicAllowed,
      isRetailerAllowed: service.isRetailerAllowed,
      requiresCustomer: service.requiresCustomer,
      requiresUpload: service.requiresUpload,
      producesDocument: service.producesDocument,
      publicPrice,
      partnerPrice,
      customerPrice: publicPrice,
      retailerPrice: partnerPrice,
      // Partner cost for retailer
      prices: {
        public: publicPrice,
        partner: partnerPrice,
        partnerGold: goldPriceRecord ? Number(goldPriceRecord.amount) : null,
        enterprise: enterprisePriceRecord ? Number(enterprisePriceRecord.amount) : null
      },
      pricing: {
        amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
        currency: matchedPrice ? matchedPrice.currency : "INR",
        tier
      }
    };
  }
  // --- MASTER ADMIN METHODS ---
  /**
   * List all services with all tier prices for Master Admin
   */
  async getAllAdminServices() {
    const services = await prisma.service.findMany({
      include: {
        prices: true,
        category: true
      },
      orderBy: { createdAt: "desc" }
    });
    return services.map((s) => {
      const publicP = s.prices.find((p) => p.pricingTier === "PUBLIC");
      const partnerP = s.prices.find((p) => p.pricingTier === "PARTNER");
      const goldP = s.prices.find((p) => p.pricingTier === "PARTNER_GOLD");
      const enterpriseP = s.prices.find((p) => p.pricingTier === "ENTERPRISE");
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        categoryId: s.categoryId,
        category: s.category ? {
          id: s.category.id,
          code: s.category.code,
          name: s.category.name
        } : null,
        isActive: s.isActive,
        isPublicAllowed: s.isPublicAllowed,
        isRetailerAllowed: s.isRetailerAllowed,
        requiresCustomer: s.requiresCustomer,
        requiresUpload: s.requiresUpload,
        producesDocument: s.producesDocument,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        prices: {
          public: publicP ? Number(publicP.amount) : 40,
          partner: partnerP ? Number(partnerP.amount) : 25,
          partnerGold: goldP ? Number(goldP.amount) : null,
          enterprise: enterpriseP ? Number(enterpriseP.amount) : null
        }
      };
    });
  }
  /**
   * Master Admin: Create a new service and seed its multi-tier prices
   */
  async createService(input) {
    const normalizedCode = input.code.toUpperCase().trim();
    const existing = await prisma.service.findUnique({
      where: { code: normalizedCode }
    });
    if (existing) {
      throw AppError.badRequest(
        `Service with code ${normalizedCode} already exists.`,
        "SERVICE_CODE_EXISTS"
      );
    }
    const resolvedCatId = await this.resolveCategoryId(
      input.categoryId || input.category
    );
    const service = await prisma.$transaction(async (tx) => {
      const newService = await tx.service.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          categoryId: resolvedCatId,
          isActive: input.isActive ?? true,
          isPublicAllowed: input.isPublicAllowed ?? true,
          isRetailerAllowed: input.isRetailerAllowed ?? true,
          requiresCustomer: input.requiresCustomer ?? false,
          requiresUpload: input.requiresUpload ?? false,
          producesDocument: input.producesDocument ?? false
        }
      });
      const priceTiers = [
        { pricingTier: "PUBLIC", amount: input.publicPrice ?? 40 },
        { pricingTier: "PARTNER", amount: input.partnerPrice ?? 25 }
      ];
      if (input.partnerGoldPrice !== void 0) {
        priceTiers.push({
          pricingTier: "PARTNER_GOLD",
          amount: input.partnerGoldPrice
        });
      }
      if (input.enterprisePrice !== void 0) {
        priceTiers.push({
          pricingTier: "ENTERPRISE",
          amount: input.enterprisePrice
        });
      }
      for (const p of priceTiers) {
        await tx.servicePrice.create({
          data: {
            serviceId: newService.id,
            pricingTier: p.pricingTier,
            amount: p.amount,
            currency: "INR"
          }
        });
      }
      return newService;
    });
    logger2.info(`Admin created new service: ${service.code} (${service.name})`);
    return await this.getServiceByCode(service.code);
  }
  /**
   * Master Admin: Update service metadata, category, capability flags, and prices
   */
  async updateService(id, input) {
    const existing = await prisma.service.findUnique({
      where: { id },
      include: { prices: true }
    });
    if (!existing) {
      throw AppError.notFound(`Service with ID ${id} not found`);
    }
    let resolvedCatId = void 0;
    if (input.categoryId !== void 0 || input.category !== void 0) {
      resolvedCatId = await this.resolveCategoryId(
        input.categoryId || input.category
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          description: input.description !== void 0 ? input.description?.trim() || null : void 0,
          categoryId: resolvedCatId !== void 0 ? resolvedCatId : void 0,
          isActive: input.isActive,
          isPublicAllowed: input.isPublicAllowed,
          isRetailerAllowed: input.isRetailerAllowed,
          requiresCustomer: input.requiresCustomer,
          requiresUpload: input.requiresUpload,
          producesDocument: input.producesDocument
        }
      });
      if (input.publicPrice !== void 0) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PUBLIC"
            }
          },
          update: { amount: input.publicPrice },
          create: {
            serviceId: id,
            pricingTier: "PUBLIC",
            amount: input.publicPrice,
            currency: "INR"
          }
        });
      }
      if (input.partnerPrice !== void 0) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PARTNER"
            }
          },
          update: { amount: input.partnerPrice },
          create: {
            serviceId: id,
            pricingTier: "PARTNER",
            amount: input.partnerPrice,
            currency: "INR"
          }
        });
      }
      if (input.partnerGoldPrice !== void 0) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PARTNER_GOLD"
            }
          },
          update: { amount: input.partnerGoldPrice },
          create: {
            serviceId: id,
            pricingTier: "PARTNER_GOLD",
            amount: input.partnerGoldPrice,
            currency: "INR"
          }
        });
      }
      if (input.enterprisePrice !== void 0) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "ENTERPRISE"
            }
          },
          update: { amount: input.enterprisePrice },
          create: {
            serviceId: id,
            pricingTier: "ENTERPRISE",
            amount: input.enterprisePrice,
            currency: "INR"
          }
        });
      }
    });
    logger2.info(`Admin updated service: ${existing.code}`);
    return await this.getServiceByCode(existing.code);
  }
  /**
   * Master Admin: Permanent deletion of a service from the database
   */
  async deleteService(id) {
    const existing = await prisma.service.findUnique({
      where: { id }
    });
    if (!existing) {
      throw AppError.notFound(`Service with ID ${id} not found`);
    }
    await prisma.$transaction(async (tx) => {
      const requests = await tx.serviceRequest.findMany({
        where: { serviceId: id },
        select: { id: true }
      });
      const requestIds = requests.map((r) => r.id);
      if (requestIds.length > 0) {
        await tx.serviceRequestEvent.deleteMany({
          where: { serviceRequestId: { in: requestIds } }
        });
        await tx.payment.deleteMany({
          where: { serviceRequestId: { in: requestIds } }
        });
        await tx.serviceRequest.deleteMany({
          where: { serviceId: id }
        });
      }
      await tx.servicePrice.deleteMany({
        where: { serviceId: id }
      });
      await tx.service.delete({
        where: { id }
      });
    });
    logger2.info(
      `Admin permanently deleted service: ${existing.code} (ID: ${id})`
    );
    return {
      success: true,
      message: `Service ${existing.code} has been permanently deleted.`
    };
  }
};
var serviceService = new ServiceService();

// src/modules/pricing/pricing.repository.ts
var PricingRepository = class {
  async findPrice(serviceId, pricingTier) {
    return await prisma.servicePrice.findUnique({
      where: {
        serviceId_pricingTier: {
          serviceId,
          pricingTier
        }
      }
    });
  }
  async findPricesByServiceCode(serviceCode) {
    return await prisma.servicePrice.findMany({
      where: {
        service: {
          code: serviceCode
        }
      },
      include: {
        service: true
      }
    });
  }
  async upsertPrice(serviceId, pricingTier, amount, currency = "INR") {
    return await prisma.servicePrice.upsert({
      where: {
        serviceId_pricingTier: {
          serviceId,
          pricingTier
        }
      },
      create: {
        serviceId,
        pricingTier,
        amount,
        currency
      },
      update: {
        amount,
        currency
      }
    });
  }
};
var pricingRepository = new PricingRepository();

// src/modules/pricing/pricing.service.ts
var PricingService = class {
  /**
   * Calculates the authoritative server-side price snapshot for a given service and tier.
   * Client-supplied prices are strictly ignored.
   */
  async calculatePrice(serviceId, pricingTier) {
    const priceRecord = await pricingRepository.findPrice(
      serviceId,
      pricingTier
    );
    if (!priceRecord) {
      if (pricingTier === "PARTNER_GOLD" || pricingTier === "ENTERPRISE") {
        const partnerFallback = await pricingRepository.findPrice(
          serviceId,
          "PARTNER"
        );
        if (partnerFallback) {
          return {
            amount: Number(partnerFallback.amount),
            currency: partnerFallback.currency,
            pricingTier: "PARTNER"
          };
        }
      }
      const defaultAmount = pricingTier === "PUBLIC" ? 40 : 25;
      return {
        amount: defaultAmount,
        currency: "INR",
        pricingTier
      };
    }
    return {
      amount: Number(priceRecord.amount),
      currency: priceRecord.currency,
      pricingTier: priceRecord.pricingTier
    };
  }
  async getPricingMatrix(serviceCode) {
    const prices = await pricingRepository.findPricesByServiceCode(serviceCode);
    if (!prices || prices.length === 0) {
      throw AppError.notFound(
        `No pricing configured for service code: ${serviceCode}`
      );
    }
    return prices.map((p) => ({
      tier: p.pricingTier,
      amount: Number(p.amount),
      currency: p.currency
    }));
  }
};
var pricingService = new PricingService();

// src/modules/services/service.schema.ts
var queryServiceSchema = external_exports.object({
  categoryId: external_exports.string().optional(),
  categoryCode: external_exports.string().optional()
});
var createServiceSchema = external_exports.object({
  code: external_exports.string().min(2, "Service code must be at least 2 characters").max(50).regex(
    /^[A-Z0-9_]+$/,
    "Service code must be uppercase alphanumeric and underscores only (e.g. PAN_FIND)"
  ),
  name: external_exports.string().min(2, "Service name must be at least 2 characters").max(
    150
  ),
  description: external_exports.string().optional(),
  categoryId: external_exports.string().optional(),
  category: external_exports.string().optional(),
  // Can pass categoryId or categoryCode
  isPublicAllowed: external_exports.boolean().default(true),
  isRetailerAllowed: external_exports.boolean().default(true),
  requiresCustomer: external_exports.boolean().default(false),
  requiresUpload: external_exports.boolean().default(false),
  producesDocument: external_exports.boolean().default(false),
  isActive: external_exports.boolean().default(true),
  publicPrice: external_exports.number().min(0, "Price cannot be negative").default(40),
  partnerPrice: external_exports.number().min(0, "Price cannot be negative").default(25),
  partnerGoldPrice: external_exports.number().min(0).optional(),
  enterprisePrice: external_exports.number().min(0).optional()
});
var updateServiceSchema = external_exports.object({
  name: external_exports.string().min(2).max(150).optional(),
  description: external_exports.string().optional(),
  categoryId: external_exports.string().optional(),
  category: external_exports.string().optional(),
  isPublicAllowed: external_exports.boolean().optional(),
  isRetailerAllowed: external_exports.boolean().optional(),
  requiresCustomer: external_exports.boolean().optional(),
  requiresUpload: external_exports.boolean().optional(),
  producesDocument: external_exports.boolean().optional(),
  isActive: external_exports.boolean().optional(),
  publicPrice: external_exports.number().min(0).optional(),
  partnerPrice: external_exports.number().min(0).optional(),
  partnerGoldPrice: external_exports.number().min(0).optional(),
  enterprisePrice: external_exports.number().min(0).optional()
});

// src/middleware/admin.middleware.ts
var requireAdmin = () => {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw AppError.unauthorized("Authentication required", "AUTH_REQUIRED");
    }
    const role = typeof user.role === "string" ? user.role.toUpperCase() : user.role;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw AppError.forbidden(
        "Access denied: Administrator privileges required",
        "ADMIN_REQUIRED"
      );
    }
    await next();
  };
};

// src/modules/services/service.routes.ts
var serviceRoutes = new Hono2();
serviceRoutes.get(
  "/",
  validationMiddleware(queryServiceSchema, "query"),
  async (c) => {
    const query = c.get("validData");
    const context = c.get("requestContext");
    const services = await serviceService.getServices(context, query);
    return c.json({ success: true, data: services });
  }
);
serviceRoutes.get("/:code", async (c) => {
  const code = c.req.param("code");
  const context = c.get("requestContext");
  const service = await serviceService.getServiceByCode(code, context);
  return c.json({ success: true, data: service });
});
serviceRoutes.get("/:code/pricing", async (c) => {
  const code = c.req.param("code");
  const pricingMatrix = await pricingService.getPricingMatrix(code);
  return c.json({ success: true, data: pricingMatrix });
});
var adminServiceRoutes = new Hono2();
adminServiceRoutes.use("*", requireAdmin());
adminServiceRoutes.get("/", async (c) => {
  const services = await serviceService.getAllAdminServices();
  return c.json({ success: true, data: services });
});
adminServiceRoutes.post(
  "/",
  validationMiddleware(createServiceSchema),
  async (c) => {
    const data = c.get("validData");
    const result = await serviceService.createService(data);
    return c.json({ success: true, data: result }, 201);
  }
);
adminServiceRoutes.put(
  "/:id",
  validationMiddleware(updateServiceSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.get("validData");
    const result = await serviceService.updateService(id, data);
    return c.json({ success: true, data: result });
  }
);
adminServiceRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await serviceService.deleteService(id);
  return c.json(result);
});

// src/modules/categories/category.repository.ts
var CategoryRepository = class {
  async findMany(isActive) {
    const where = {};
    if (isActive !== void 0) {
      where.isActive = isActive;
    }
    return await prisma.serviceCategory.findMany({
      where,
      include: {
        _count: {
          select: { services: true }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });
  }
  async findById(id) {
    return await prisma.serviceCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { services: true }
        }
      }
    });
  }
  async findByCode(code) {
    return await prisma.serviceCategory.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        _count: {
          select: { services: true }
        }
      }
    });
  }
  async create(data) {
    return await prisma.serviceCategory.create({
      data: {
        code: data.code.toUpperCase().trim(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        icon: data.icon?.trim() || null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true
      }
    });
  }
  async update(id, data) {
    return await prisma.serviceCategory.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description !== void 0 ? data.description?.trim() || null : void 0,
        icon: data.icon !== void 0 ? data.icon?.trim() || null : void 0,
        displayOrder: data.displayOrder,
        isActive: data.isActive
      }
    });
  }
  async delete(id) {
    return await prisma.serviceCategory.delete({
      where: { id }
    });
  }
};
var categoryRepository = new CategoryRepository();

// src/modules/categories/category.service.ts
var CategoryService = class {
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
      serviceCount: cat._count.services
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
      updatedAt: cat.updatedAt
    }));
  }
  async getCategoryById(id) {
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
      serviceCount: category._count.services
    };
  }
  async createCategory(input) {
    const normalizedCode = input.code.toUpperCase().trim();
    const existing = await categoryRepository.findByCode(normalizedCode);
    if (existing) {
      throw AppError.badRequest(
        `Category with code "${normalizedCode}" already exists.`,
        "CATEGORY_EXISTS"
      );
    }
    const created = await categoryRepository.create(input);
    logger2.info(
      `Admin created new category: ${created.code} (${created.name})`
    );
    return await this.getCategoryById(created.id);
  }
  async updateCategory(id, input) {
    const existing = await categoryRepository.findById(id);
    if (!existing) {
      throw AppError.notFound(`Category with ID ${id} not found`);
    }
    const updated = await categoryRepository.update(id, input);
    logger2.info(`Admin updated category: ${updated.code}`);
    return await this.getCategoryById(updated.id);
  }
  async deleteCategory(id) {
    const existing = await categoryRepository.findById(id);
    if (!existing) {
      throw AppError.notFound(`Category with ID ${id} not found`);
    }
    await categoryRepository.delete(id);
    logger2.info(`Admin deleted category: ${existing.code} (${existing.name})`);
    return {
      success: true,
      message: `Category "${existing.name}" (${existing.code}) deleted successfully.`
    };
  }
};
var categoryService = new CategoryService();

// src/modules/categories/category.schema.ts
var createCategorySchema = external_exports.object({
  code: external_exports.string().min(2, "Category code must be at least 2 characters").max(50).regex(
    /^[A-Z0-9_]+$/,
    "Category code must be uppercase alphanumeric and underscores only (e.g. AGRICULTURE)"
  ),
  name: external_exports.string().min(2, "Category name must be at least 2 characters").max(
    100
  ),
  description: external_exports.string().optional(),
  icon: external_exports.string().optional(),
  displayOrder: external_exports.number().int().default(0),
  isActive: external_exports.boolean().default(true)
});
var updateCategorySchema = external_exports.object({
  name: external_exports.string().min(2).max(100).optional(),
  description: external_exports.string().optional(),
  icon: external_exports.string().optional(),
  displayOrder: external_exports.number().int().optional(),
  isActive: external_exports.boolean().optional()
});
var queryCategorySchema = external_exports.object({
  isActive: external_exports.string().optional().transform((val) => val === void 0 ? void 0 : val === "true")
});

// src/modules/categories/category.routes.ts
var categoryRouter = new Hono2();
var adminCategoryRouter = new Hono2();
categoryRouter.get("/", async (c) => {
  const categories = await categoryService.getCategories(true);
  return c.json({
    success: true,
    data: categories
  });
});
adminCategoryRouter.use("*", requireAdmin());
adminCategoryRouter.get("/", async (c) => {
  const categories = await categoryService.getAllAdminCategories();
  return c.json({
    success: true,
    data: categories
  });
});
adminCategoryRouter.post(
  "/",
  validationMiddleware(createCategorySchema),
  async (c) => {
    const body = c.get("validData");
    const category = await categoryService.createCategory(body);
    return c.json(
      {
        success: true,
        data: category
      },
      201
    );
  }
);
adminCategoryRouter.put(
  "/:id",
  validationMiddleware(updateCategorySchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.get("validData");
    const category = await categoryService.updateCategory(id, body);
    return c.json({
      success: true,
      data: category
    });
  }
);
adminCategoryRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await categoryService.deleteCategory(id);
  return c.json(result);
});

// src/modules/requests/request.repository.ts
var RequestRepository = class {
  async findById(id) {
    return await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        service: true,
        customer: true,
        user: true,
        organization: true,
        events: {
          orderBy: { createdAt: "asc" }
        },
        payments: {
          orderBy: { createdAt: "desc" }
        }
      }
    });
  }
  async findByIdempotencyKey(key) {
    return await prisma.serviceRequest.findUnique({
      where: { idempotencyKey: key },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true
      }
    });
  }
  async create(data) {
    return await prisma.serviceRequest.create({
      data: {
        referenceNumber: data.referenceNumber,
        serviceId: data.serviceId,
        accessMode: data.context.accessMode,
        pricingTier: data.context.pricingTier,
        userId: data.context.userId || null,
        organizationId: data.context.organizationId || null,
        customerId: data.customerId || null,
        guestSessionId: data.context.guestSessionId || null,
        amount: data.amount,
        currency: data.currency,
        status: "REQUEST_CREATED",
        inputData: data.inputData,
        idempotencyKey: data.idempotencyKey || null,
        events: {
          create: {
            status: "REQUEST_CREATED",
            note: "Service request initiated and price locked"
          }
        }
      },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true
      }
    });
  }
  async updateStatus(id, status, note) {
    const isTerminal = status === "COMPLETED" || status === "PROVIDER_FAILED" || status === "FAILED";
    return await prisma.serviceRequest.update({
      where: { id },
      data: {
        status,
        completedAt: isTerminal ? /* @__PURE__ */ new Date() : void 0,
        events: {
          create: {
            status,
            note: note || void 0
          }
        }
      },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true
      }
    });
  }
  async updateResult(id, resultData, providerId, providerReference) {
    return await prisma.serviceRequest.update({
      where: { id },
      data: {
        resultData,
        providerId: providerId || void 0,
        providerReference: providerReference || void 0
      }
    });
  }
  async findMany(organizationId, query) {
    const { page, limit, status, serviceCode, customerId } = query;
    const skip = (page - 1) * limit;
    const where = {
      organizationId
    };
    if (status) {
      where.status = status;
    }
    if (serviceCode) {
      where.service = { code: serviceCode };
    }
    if (customerId) {
      where.customerId = customerId;
    }
    const [items, total] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          service: true,
          customer: true,
          payments: true
        }
      }),
      prisma.serviceRequest.count({ where })
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
};
var requestRepository = new RequestRepository();

// src/modules/payments/payment.repository.ts
var PaymentRepository = class {
  async create(data) {
    return await prisma.payment.create({
      data: {
        serviceRequestId: data.serviceRequestId,
        organizationId: data.organizationId || null,
        guestSessionId: data.guestSessionId || null,
        amount: data.amount,
        currency: data.currency || "INR",
        method: data.method || "RAZORPAY",
        status: "PENDING",
        gatewayOrderId: data.gatewayOrderId || null
      }
    });
  }
  async findById(id) {
    return await prisma.payment.findUnique({
      where: { id },
      include: {
        serviceRequest: true
      }
    });
  }
  async findByServiceRequestId(serviceRequestId) {
    return await prisma.payment.findFirst({
      where: { serviceRequestId },
      orderBy: { createdAt: "desc" }
    });
  }
  async updateStatus(id, status, gatewayPaymentId, gatewaySignature) {
    return await prisma.payment.update({
      where: { id },
      data: {
        status,
        gatewayPaymentId: gatewayPaymentId || void 0,
        gatewaySignature: gatewaySignature || void 0
      }
    });
  }
};
var paymentRepository = new PaymentRepository();

// src/modules/payments/payment.service.ts
var PaymentService = class {
  /**
   * Initializes a payment order for a ServiceRequest.
   */
  async createPaymentOrder(context, serviceRequestId, amount, currency = "INR") {
    const gatewayOrderId = `order_${crypto.randomUUID().replace(/-/g, "").substring(0, 14)}`;
    const payment = await paymentRepository.create({
      serviceRequestId,
      organizationId: context.organizationId,
      guestSessionId: context.guestSessionId,
      amount,
      currency,
      method: "RAZORPAY",
      gatewayOrderId
    });
    logger2.info(
      `Payment order created: ${payment.id} for request: ${serviceRequestId}`
    );
    return payment;
  }
  /**
   * Verifies and marks payment as CAPTURED.
   */
  async verifyAndCapture(paymentId, gatewayPaymentId, gatewaySignature) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) {
      throw AppError.notFound(`Payment record ${paymentId} not found`);
    }
    if (payment.status === "CAPTURED") {
      return payment;
    }
    const updated = await paymentRepository.updateStatus(
      paymentId,
      "CAPTURED",
      gatewayPaymentId,
      gatewaySignature
    );
    logger2.info(`Payment ${paymentId} verified and CAPTURED successfully.`);
    return updated;
  }
};
var paymentService = new PaymentService();

// src/core/integrations/ezytm/ezytm.gateway.ts
import { ProxyAgent, fetch as undiciFetch } from "undici";
var EzytmGateway = class {
  baseUrl;
  tokenId;
  apiUserId;
  apiPassword;
  apiMode;
  proxyUrl;
  constructor() {
    this.baseUrl = (getEnvVar("EZYTM_BASE_URL") || "https://planapi.in").replace(/\/+$/, "");
    this.tokenId = (getEnvVar("EZYTM_TOKEN_ID") || getEnvVar("PLANAPI_TOKEN_ID") || "").replace(/["']/g, "").trim();
    this.apiUserId = (getEnvVar("EZYTM_API_USER_ID") || getEnvVar("PLANAPI_API_USER_ID") || "").replace(/["']/g, "").trim();
    this.apiPassword = (getEnvVar("EZYTM_API_PASSWORD") || getEnvVar("PLANAPI_API_PASSWORD") || "").replace(/["']/g, "").trim();
    this.apiMode = (getEnvVar("EZYTM_API_MODE") || "1").replace(/["']/g, "").trim();
    const rawProxy = getEnvVar("EZYTM_PROXY_URL") || getEnvVar("FIXIE_URL") || getEnvVar("QUOTAGUARDSTATIC_URL") || getEnvVar("HTTPS_PROXY") || getEnvVar("HTTP_PROXY");
    this.proxyUrl = rawProxy ? rawProxy.replace(/["']/g, "").trim() : void 0;
  }
  getProxyUrl() {
    const rawProxy = getEnvVar("EZYTM_PROXY_URL") || getEnvVar("WEBSHARE_URL") || getEnvVar("WEBSHARE_PROXY_URL") || getEnvVar("PROXY_URL") || getEnvVar("STATIC_PROXY_URL") || getEnvVar("FIXIE_URL") || getEnvVar("QUOTAGUARDSTATIC_URL") || getEnvVar("HTTPS_PROXY") || getEnvVar("HTTP_PROXY");
    return rawProxy ? rawProxy.replace(/["']/g, "").trim() : void 0;
  }
  isConfigured() {
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
      "test"
    ];
    for (const marker of dummyMarkers) {
      if (token.includes(marker) || user.includes(marker) || pass.includes(marker)) {
        return false;
      }
    }
    return true;
  }
  /**
   * Generic form POST dispatcher with standard EzyTM/PlanAPI headers & form encoding.
   * Throws typed AppError on failure. No dummy fallback on live failure.
   */
  async postForm(endpoint, params) {
    const isTestEnv = typeof process !== "undefined" ? process.env.NODE_ENV === "test" || process.env.DENO_TESTING === "1" : typeof Deno !== "undefined" ? Deno.env.get("NODE_ENV") === "test" || Deno.env.get("DENO_TESTING") === "1" : false;
    if (!this.isConfigured()) {
      if (isTestEnv) {
        logger2.warn(`[EzyTM Gateway] Test simulation active for ${endpoint}`);
        if (endpoint.includes("AadharToPanFind")) {
          return {
            Errorcode: 100,
            Status: "Success",
            Data: {
              PanNumber: "ABCDE1234F",
              AadharNumber: `XXXXXXXX${params.Aadhaarid?.slice(-4) || "1234"}`
            }
          };
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
              category: "person"
            }
          };
        }
      }
      logger2.error(
        "[EzyTM Gateway] API credentials not configured in environment variables."
      );
      throw AppError.badGateway(
        "EzyTM vendor credentials (EZYTM_TOKEN_ID, EZYTM_API_USER_ID, EZYTM_API_PASSWORD) are not configured.",
        "GATEWAY_NOT_CONFIGURED"
      );
    }
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = {
      "TokenID": this.tokenId,
      "ApiUserID": this.apiUserId,
      "ApiPassword": this.apiPassword,
      "Content-Type": "application/x-www-form-urlencoded"
    };
    const body = new URLSearchParams({ ...params, ApiMode: this.apiMode });
    logger2.info(`[EzyTM Gateway] Dispatching POST to ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    const activeProxyUrl = this.getProxyUrl() || this.proxyUrl;
    let dispatcher = void 0;
    if (activeProxyUrl) {
      try {
        dispatcher = new ProxyAgent(activeProxyUrl);
        const maskedProxy = activeProxyUrl.replace(/:[^:@]+@/, ":****@");
        logger2.info(`[EzyTM Gateway] Routing request through Static IP Proxy: ${maskedProxy}`);
      } catch (err) {
        logger2.error(`[EzyTM Gateway] Failed to create ProxyAgent with URL "${activeProxyUrl}":`, err);
      }
    } else {
      logger2.warn("[EzyTM Gateway] \u26A0\uFE0F NO PROXY URL found in environment (checked EZYTM_PROXY_URL, WEBSHARE_URL, PROXY_URL, HTTPS_PROXY). Using direct connection.");
    }
    try {
      const fetchFunction = dispatcher ? undiciFetch : fetch;
      const response = await fetchFunction(url, {
        method: "POST",
        headers,
        body: body.toString(),
        signal: controller.signal,
        // @ts-ignore
        dispatcher
      });
      clearTimeout(timeoutId);
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        logger2.error(`[EzyTM Gateway] Non-JSON response from ${url}:`, text);
        throw AppError.badGateway(
          `Invalid JSON response from gateway (HTTP ${response.status})`,
          "GATEWAY_INVALID_RESPONSE"
        );
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof AppError) throw err;
      if (err.name === "AbortError") {
        logger2.error(
          `[EzyTM Gateway] Timeout after 15s communicating with ${url}`
        );
        throw AppError.badGateway(
          "EzyTM gateway connection timed out",
          "GATEWAY_TIMEOUT"
        );
      }
      logger2.error(`[EzyTM Gateway] Connection error to ${url}:`, err);
      throw AppError.badGateway(
        err.message || "Failed to communicate with EzyTM gateway",
        "GATEWAY_COMMUNICATION_ERROR"
      );
    }
  }
};
var ezytmGateway = new EzytmGateway();

// src/core/integrations/ezytm/ezytm-pan.gateway.ts
var EzytmPanGateway = class {
  /**
   * 1. Aadhar to Pan Find API
   * POST /Api/Ekyc/AadharToPanFind
   */
  async findPanByAadhaar(aadhaar) {
    return await ezytmGateway.postForm(
      "/Api/Ekyc/AadharToPanFind",
      { Aadhaarid: aadhaar.trim() }
    );
  }
  /**
   * 2. PAN Card Details API
   * POST /api/Ekyc/PanDetails
   */
  async getPanDetails(pan) {
    return await ezytmGateway.postForm(
      "/api/Ekyc/PanDetails",
      { Panid: pan.trim().toUpperCase() }
    );
  }
};
var ezytmPanGateway = new EzytmPanGateway();

// src/modules/pan/pan.service.ts
var PanService = class {
  /**
   * 1. Find PAN Number by 12-digit Aadhaar
   */
  async findPanByAadhaar(aadhaar) {
    logger2.info(
      `[PanService] Finding PAN for Aadhaar ending in ${aadhaar.slice(-4)}`
    );
    const response = await ezytmPanGateway.findPanByAadhaar(aadhaar);
    logger2.info(`[PanService] Raw response received: ${JSON.stringify(response)}`);
    const panNumber = response.Data?.PanNumber?.trim()?.toUpperCase();
    if (response.Errorcode === 100) {
      if (panNumber) {
        const maskedPan = `XXXXX${panNumber.substring(5, 9)}${panNumber.substring(9)}`;
        logger2.info(`[PanService] Successfully found PAN: ${maskedPan}`);
        return {
          pan: panNumber,
          maskedPan
        };
      }
      if (response.Data?.Message?.toLowerCase() === "linked") {
        const linkedMsg = "PAN is linked with this Aadhaar number, but PAN number were not found. Please try again later.";
        logger2.warn(`[PanService] ${linkedMsg}`);
        throw AppError.badRequest(linkedMsg, "PAN_LINKED_NO_DATA");
      }
      const notFoundMsg = "PAN is linked but data not found. Please try again later.";
      logger2.warn(`[PanService] ${notFoundMsg}`);
      throw AppError.badRequest(notFoundMsg, "PAN_NOT_FOUND");
    }
    if (response.Errorcode === 101) {
      logger2.warn(`[PanService] PAN not found for Aadhaar ending in ${aadhaar.slice(-4)}`);
      throw AppError.badRequest("No PAN found linked with the provided Aadhaar number.", "PAN_NOT_FOUND");
    }
    const fallbackMsg = response.Message && response.Message !== "Data Fetch Successfully" ? response.Message : "Failed to find PAN for this Aadhaar. Please try again later.";
    logger2.warn(`[PanService] Find PAN failed: ${fallbackMsg}`);
    throw AppError.badRequest(fallbackMsg, "PAN_FIND_FAILED");
  }
  /**
   * 2. Fetch Comprehensive PAN Details
   */
  async getPanDetails(pan) {
    const cleanPan = pan.trim().toUpperCase();
    const response = await ezytmPanGateway.getPanDetails(cleanPan);
    if (response.Errorcode === 100 && response.data) {
      const d = response.data;
      return {
        pan: d.pan_number || cleanPan,
        fullName: d.full_name || "N/A",
        maskedAadhaar: d.masked_aadhaar || "N/A",
        dob: d.dob || "N/A",
        gender: d.gender === "M" ? "Male (M)" : d.gender === "F" ? "Female (F)" : d.gender || "N/A",
        aadhaarLinked: Boolean(d.aadhaar_linked),
        category: d.category ? `${d.category.charAt(0).toUpperCase() + d.category.slice(1)}` : "Individual"
      };
    }
    const failureReason = response.msg || "Failed to retrieve PAN details from official registry.";
    logger2.warn(`[PanService] Fetch PAN details failed: ${failureReason}`);
    throw AppError.badRequest(failureReason, "PAN_DETAILS_FAILED");
  }
};
var panService = new PanService();

// src/modules/engine/service-engine.ts
var ServiceEngine = class {
  /**
   * Validates service-specific input payload before dispatching.
   */
  validateServiceInput(serviceCode, inputData) {
    if (serviceCode === "PAN_FIND") {
      const aadhaar = String(inputData.aadhaar || "").trim();
      if (!aadhaar || !/^\d{12}$/.test(aadhaar)) {
        throw AppError.badRequest(
          "Invalid Aadhaar number. Must be exactly 12 digits.",
          "INVALID_INPUT"
        );
      }
    } else if (serviceCode === "VOTER_VERIFY") {
      const epic = String(inputData.epicNumber || "").trim();
      if (!epic || epic.length < 5) {
        throw AppError.badRequest(
          "Invalid EPIC/Voter ID number format.",
          "INVALID_INPUT"
        );
      }
    }
  }
  /**
   * Executes service workflow directly by delegating to domain service handlers.
   */
  async executeService(serviceCode, inputData) {
    this.validateServiceInput(serviceCode, inputData);
    logger2.info(`ServiceEngine executing service: ${serviceCode}`);
    try {
      if (serviceCode === "PAN_FIND") {
        const aadhaar = String(inputData.aadhaar || "").trim();
        const panResult = await panService.findPanByAadhaar(aadhaar);
        return {
          success: true,
          providerId: "EZYTM",
          referenceNumber: `REQ-${Date.now()}`,
          resultData: {
            pan: panResult.pan,
            panNumber: panResult.pan,
            maskedPan: panResult.maskedPan,
            status: "ACTIVE"
          }
        };
      }
      if (serviceCode === "VOTER_VERIFY") {
        const epicNumber = String(inputData.epicNumber || "ABC1234567");
        return {
          success: true,
          providerId: "SYSTEM",
          referenceNumber: `VTR-${Date.now()}`,
          resultData: {
            epicNumber,
            fullName: "VIKASH KUMAR",
            status: "ACTIVE"
          }
        };
      }
      return {
        success: true,
        providerId: "SYSTEM",
        referenceNumber: `REQ-${Date.now()}`,
        resultData: {
          serviceCode,
          status: "SUCCESS"
        }
      };
    } catch (error) {
      logger2.error(`Error executing ${serviceCode}:`, error);
      return {
        success: false,
        error: error.message || "Gateway execution error"
      };
    }
  }
};
var serviceEngine = new ServiceEngine();

// src/modules/requests/request.service.ts
var RequestService = class {
  async getRequestById(context, id) {
    const request = await requestRepository.findById(id);
    if (!request) {
      throw AppError.notFound(`Service request with ID ${id} not found`);
    }
    if (context.accessMode === "RETAILER") {
      if (!context.organizationId || request.organizationId !== context.organizationId) {
        throw AppError.forbidden(
          "You do not have access to this service request"
        );
      }
    } else {
      if (!context.guestSessionId || request.guestSessionId !== context.guestSessionId) {
        throw AppError.forbidden("Unauthorized guest session access");
      }
    }
    return request;
  }
  async queryRequests(context, query) {
    if (context.accessMode !== "RETAILER" || !context.organizationId) {
      throw AppError.forbidden(
        "Request history is only available for authenticated retailers"
      );
    }
    return await requestRepository.findMany(context.organizationId, query);
  }
  /**
   * Initiates a Service Request, locks authoritative price, and generates a payment order.
   */
  async createRequest(context, data) {
    if (data.idempotencyKey) {
      const existing = await requestRepository.findByIdempotencyKey(
        data.idempotencyKey
      );
      if (existing) {
        logger2.info(
          `Idempotent request matched for key: ${data.idempotencyKey}`
        );
        return existing;
      }
    }
    const service = await serviceService.getServiceByCode(
      data.serviceCode,
      context
    );
    if (!service.isActive) {
      throw AppError.badRequest(
        "Requested service is currently disabled",
        "SERVICE_DISABLED"
      );
    }
    if (context.accessMode === "GUEST" && !service.isPublicAllowed) {
      throw AppError.forbidden(
        "This service requires retailer login",
        "AUTH_REQUIRED"
      );
    }
    if (context.accessMode === "RETAILER" && !service.isRetailerAllowed) {
      throw AppError.forbidden(
        "This service is not available for retailer workspace",
        "SERVICE_NOT_ALLOWED"
      );
    }
    if (context.accessMode === "RETAILER" && service.requiresCustomer && !data.customerId) {
      throw AppError.badRequest(
        "A customer profile must be selected for this service",
        "CUSTOMER_REQUIRED"
      );
    }
    let validatedCustomerId = null;
    if (context.accessMode === "RETAILER" && data.customerId && context.organizationId) {
      const customer = await customerService.getCustomerById(
        data.customerId,
        context.organizationId
      );
      validatedCustomerId = customer.id;
    }
    const priceSnapshot = await pricingService.calculatePrice(
      service.id,
      context.pricingTier
    );
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1e3 + Math.random() * 9e3);
    const referenceNumber = `REQ-${dateStr}-${service.code}-${randomSuffix}`;
    const request = await requestRepository.create({
      referenceNumber,
      serviceId: service.id,
      context,
      customerId: validatedCustomerId,
      amount: priceSnapshot.amount,
      currency: priceSnapshot.currency,
      inputData: data.input,
      idempotencyKey: data.idempotencyKey
    });
    const payment = await paymentService.createPaymentOrder(
      context,
      request.id,
      priceSnapshot.amount,
      priceSnapshot.currency
    );
    const lockedRequest = await requestRepository.updateStatus(
      request.id,
      "PAYMENT_PENDING",
      `Price locked at \u20B9${priceSnapshot.amount} (${priceSnapshot.pricingTier}). Awaiting payment confirmation.`
    );
    return {
      ...lockedRequest,
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        gatewayOrderId: payment.gatewayOrderId,
        method: payment.method,
        status: payment.status
      }
    };
  }
  /**
   * Confirms payment capture and executes the service engine workflow.
   */
  async confirmPaymentAndExecute(context, requestId, verification) {
    const request = await this.getRequestById(context, requestId);
    if (request.status === "COMPLETED") {
      logger2.info(`Request ${requestId} already completed.`);
      return request;
    }
    await paymentService.verifyAndCapture(
      verification.paymentId,
      verification.gatewayPaymentId,
      verification.gatewaySignature
    );
    await requestRepository.updateStatus(
      requestId,
      "PAYMENT_CAPTURED",
      "Payment successfully verified and captured."
    );
    await requestRepository.updateStatus(
      requestId,
      "PROCESSING",
      "Dispatching request to service provider gateway."
    );
    try {
      const result = await serviceEngine.executeService(
        request.service.code,
        request.inputData
      );
      if (result.success) {
        await requestRepository.updateResult(
          requestId,
          result.resultData || {},
          result.providerId,
          result.referenceNumber
        );
        const completedRequest = await requestRepository.updateStatus(
          requestId,
          "COMPLETED",
          `Service completed successfully via ${result.providerId}.`
        );
        return completedRequest;
      } else {
        await requestRepository.updateResult(
          requestId,
          { error: result.error },
          result.providerId
        );
        const failedRequest = await requestRepository.updateStatus(
          requestId,
          "PROVIDER_FAILED",
          `Provider execution failed: ${result.error}`
        );
        return failedRequest;
      }
    } catch (error) {
      logger2.error(`Execution error for Request ID ${requestId}:`, error);
      await requestRepository.updateResult(requestId, {
        error: "Internal integration gateway failure or timeout"
      });
      const failedRequest = await requestRepository.updateStatus(
        requestId,
        "PROVIDER_FAILED",
        "Integration gateway timeout. Payment captured; eligible for retry or refund."
      );
      return failedRequest;
    }
  }
};
var requestService = new RequestService();

// src/modules/requests/request.schema.ts
var createRequestSchema = external_exports.object({
  serviceCode: external_exports.string().min(1, "Service code is required"),
  customerId: external_exports.string().uuid("Invalid customer ID").optional().nullable(),
  input: external_exports.record(external_exports.unknown()).refine(
    (val) => Object.keys(val).length > 0,
    "Input parameters are required for service execution"
  ),
  idempotencyKey: external_exports.string().min(6).max(128).optional()
});
var confirmRequestPaymentSchema = external_exports.object({
  paymentId: external_exports.string().uuid("Invalid payment ID"),
  gatewayPaymentId: external_exports.string().min(1, "Gateway payment ID is required"),
  gatewaySignature: external_exports.string().optional()
});
var queryRequestSchema = external_exports.object({
  page: external_exports.coerce.number().min(1).default(1),
  limit: external_exports.coerce.number().min(1).max(100).default(20),
  status: external_exports.enum([
    "REQUEST_CREATED",
    "PRICE_LOCKED",
    "PAYMENT_PENDING",
    "PAYMENT_CAPTURED",
    "PROCESSING",
    "COMPLETED",
    "PROVIDER_FAILED",
    "CANCELLED",
    "REFUND_PENDING",
    "REFUNDED",
    // Compatibility
    "CREATED",
    "SUCCESS",
    "FAILED"
  ]).optional(),
  serviceCode: external_exports.string().optional(),
  customerId: external_exports.string().uuid().optional()
});

// src/modules/requests/request.routes.ts
var requestRoutes = new Hono2();
requestRoutes.post(
  "/",
  validationMiddleware(createRequestSchema),
  async (c) => {
    const context = c.get("requestContext");
    const data = c.get("validData");
    const result = await requestService.createRequest(context, data);
    return c.json({ success: true, data: result });
  }
);
requestRoutes.post(
  "/:id/confirm-payment",
  validationMiddleware(confirmRequestPaymentSchema),
  async (c) => {
    const context = c.get("requestContext");
    const id = c.req.param("id");
    const verification = c.get("validData");
    const result = await requestService.confirmPaymentAndExecute(
      context,
      id,
      verification
    );
    return c.json({ success: true, data: result });
  }
);
requestRoutes.get("/:id", async (c) => {
  const context = c.get("requestContext");
  const id = c.req.param("id");
  const result = await requestService.getRequestById(context, id);
  return c.json({ success: true, data: result });
});
requestRoutes.get(
  "/",
  validationMiddleware(queryRequestSchema, "query"),
  async (c) => {
    const context = c.get("requestContext");
    const query = c.get("validData");
    const result = await requestService.queryRequests(context, query);
    return c.json({ success: true, ...result });
  }
);

// src/modules/pan/pan.schema.ts
var findPanSchema = external_exports.object({
  aadhaar: external_exports.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits")
});
var panDetailsSchema = external_exports.object({
  pan: external_exports.string().regex(
    /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i,
    "Invalid PAN number format"
  )
});

// src/modules/pan/pan.routes.ts
var panRoutes = new Hono2();
panRoutes.post(
  "/find",
  validationMiddleware(findPanSchema),
  async (c) => {
    const { aadhaar } = c.get("validData");
    const result = await panService.findPanByAadhaar(aadhaar);
    return c.json({ success: true, data: result });
  }
);
panRoutes.post(
  "/details",
  validationMiddleware(panDetailsSchema),
  async (c) => {
    const { pan } = c.get("validData");
    const result = await panService.getPanDetails(pan);
    return c.json({ success: true, data: result });
  }
);

// src/middleware/request-context.middleware.ts
var requestContextMiddleware = () => {
  return async (c, next) => {
    try {
      let session = await auth.api.getSession({
        headers: c.req.raw.headers
      }).catch(() => null);
      if (!session || !session.user) {
        const authHeader = c.req.header("Authorization");
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
        const customToken = c.req.header("x-session-token");
        const token = bearerToken || customToken;
        if (token) {
          const sessionRecord = await prisma.session.findUnique({
            where: { token },
            include: { user: true }
          });
          if (sessionRecord && sessionRecord.expiresAt > /* @__PURE__ */ new Date()) {
            session = {
              session: sessionRecord,
              user: sessionRecord.user
            };
          }
        }
      }
      if (session && session.user) {
        const userId = session.user.id;
        let organizationId = session.session.activeOrganizationId;
        if (!organizationId) {
          const membership = await prisma.member.findFirst({
            where: { userId },
            include: { organization: true },
            orderBy: { createdAt: "asc" }
          });
          if (membership) {
            organizationId = membership.organizationId;
            c.set("organization", membership.organization);
          }
        } else {
          const membership = await prisma.member.findFirst({
            where: { userId, organizationId },
            include: { organization: true }
          });
          if (membership) {
            c.set("organization", membership.organization);
          } else {
            logger2.warn(
              `User ${userId} attempted to access unauthorized org ${organizationId}`
            );
            organizationId = null;
          }
        }
        const requestContext = {
          accessMode: "RETAILER",
          userId,
          organizationId: organizationId || null,
          customerId: null,
          // Populated per-request payload if present
          pricingTier: "PARTNER",
          guestSessionId: null
        };
        c.set("user", session.user);
        c.set("session", session.session);
        c.set("organizationId", organizationId || void 0);
        c.set("requestContext", requestContext);
      } else {
        let guestSessionId = c.req.header("x-guest-session-id");
        if (!guestSessionId) {
          guestSessionId = `gst_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
        }
        const requestContext = {
          accessMode: "GUEST",
          userId: null,
          organizationId: null,
          customerId: null,
          pricingTier: "PUBLIC",
          guestSessionId
        };
        c.set("user", null);
        c.set("session", null);
        c.set("organizationId", void 0);
        c.set("organization", null);
        c.set("requestContext", requestContext);
      }
    } catch (error) {
      logger2.error("Error resolving request context:", error);
      const guestSessionId = `gst_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
      c.set("requestContext", {
        accessMode: "GUEST",
        userId: null,
        organizationId: null,
        customerId: null,
        pricingTier: "PUBLIC",
        guestSessionId
      });
    }
    await next();
  };
};

// src/app/routes.ts
var apiRouter = new Hono2();
apiRouter.use("*", requestContextMiddleware());
apiRouter.route("/auth", authRoutes);
apiRouter.route("/customers", customerRoutes);
apiRouter.route("/categories", categoryRouter);
apiRouter.route("/services", serviceRoutes);
apiRouter.route("/service-requests", requestRoutes);
apiRouter.route("/pan", panRoutes);
apiRouter.route("/integrations/pan", panRoutes);
apiRouter.route("/admin/categories", adminCategoryRouter);
apiRouter.route("/admin/services", adminServiceRoutes);

// src/app/app.ts
var app = new Hono2();
app.use(
  "*",
  cors({
    origin: (origin) => getAllowedCorsOrigin(origin),
    credentials: true,
    allowMethods: CORS_ALLOW_METHODS,
    allowHeaders: CORS_ALLOW_HEADERS,
    maxAge: 600
  })
);
app.use("*", logger());
app.use("*", requestIdMiddleware());
app.get("/api/auth/error", (c) => {
  const origin = env.CORS_ORIGIN[0] || "http://localhost:3000";
  const error = c.req.query("error") || "signup_disabled";
  return c.redirect(`${origin}/auth/login?error=${encodeURIComponent(error)}`);
});
app.all("/api/auth/*", async (c) => {
  const res = await auth.handler(c.req.raw);
  const allowedOrigin = getAllowedCorsOrigin(c.req.header("Origin"));
  const corsHeaders = new Headers(res.headers);
  if (allowedOrigin) {
    corsHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
    corsHeaders.set("Vary", "Origin");
  }
  corsHeaders.set("Access-Control-Allow-Credentials", "true");
  corsHeaders.set(
    "Access-Control-Allow-Methods",
    CORS_ALLOW_METHODS.join(", ")
  );
  corsHeaders.set(
    "Access-Control-Allow-Headers",
    CORS_ALLOW_HEADERS.join(", ")
  );
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: corsHeaders
  });
});
app.route(CONSTANTS.API_PREFIX, apiRouter);
app.get("/", (c) => {
  return c.json({
    name: "Nagrik Seva API",
    status: "ok",
    health: "/health",
    version: "1.0.0"
  });
});
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    requestId: c.get("requestId")
  });
});
app.get("/dashboard", (c) => {
  const origin = env.CORS_ORIGIN[0];
  return c.redirect(`${origin}/dashboard`);
});
app.get("/admin/dashboard", (c) => {
  const origin = env.CORS_ORIGIN[0];
  return c.redirect(`${origin}/admin/dashboard`);
});
app.onError(errorHandler2);

// src/serverless.ts
var config = {
  runtime: "nodejs"
};
async function nodeReqToWebRequest(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = `${proto}://${host}${req.url || "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method || "GET";
  let body = void 0;
  if (method !== "GET" && method !== "HEAD") {
    const vercelReq = req;
    if (vercelReq.rawBody && Buffer.isBuffer(vercelReq.rawBody)) {
      body = new Uint8Array(vercelReq.rawBody);
    } else if (vercelReq.body !== void 0 && typeof vercelReq.body === "object" && !Buffer.isBuffer(vercelReq.body)) {
      body = JSON.stringify(vercelReq.body);
    } else if (typeof vercelReq.body === "string") {
      body = vercelReq.body;
    } else {
      const chunks = [];
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
    duplex: "half"
  });
}
async function handler(req, res) {
  try {
    const webRequest = await nodeReqToWebRequest(req);
    const webResponse = await app.fetch(webRequest);
    res.statusCode = webResponse.status;
    res.statusMessage = webResponse.statusText;
    const setCookies = [];
    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        setCookies.push(value);
      } else {
        res.setHeader(key, value);
      }
    });
    if (webResponse.headers.getSetCookie) {
      const allCookies = webResponse.headers.getSetCookie();
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
  } catch (err) {
    console.error("Vercel Serverless Handler Error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: err?.message
        })
      );
    }
  }
}
export {
  config,
  handler as default
};
