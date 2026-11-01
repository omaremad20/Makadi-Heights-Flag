// Local stand-in for the parts of Supabase the app uses, for end-to-end tests ONLY.
//   /rest/v1/*     -> real PostgREST (port 3001) over the local test database
//   /auth/v1/user  -> resolves our locally signed JWTs (no real Auth server)
//   /storage/v1/*  -> minimal Storage API. Every permission decision is made by
//                     the DATABASE: inserts/selects/deletes on storage.objects
//                     run as the caller's role and JWT claims, so the real RLS
//                     policies from the migrations are what is being tested.
// Never point this at production.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import http from "node:http";

const SECRET = process.env.JWT_SECRET;
const PG = ["-h", process.env.PGHOST, "-p", process.env.PGPORT ?? "54329", "-U", "postgres", "-d", process.env.PGDATABASE ?? "flag_e2e"];
const PORT = Number(process.env.MOCK_PORT ?? 54321);
const objects = new Map(); // `${bucket}/${path}` -> { bytes, type }
const failRules = []; // { match: RegExp, remaining: number }

const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

function verifyJwt(token) {
  try {
    const [h, p, s] = token.split(".");
    if (sign(`${h}.${p}`) !== s) return null;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function caller(req) {
  const auth = req.headers.authorization?.replace(/^Bearer /i, "") ?? req.headers.apikey ?? "";
  return verifyJwt(auth) ?? { role: "anon" };
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** Runs SQL as the caller (role + claims) inside one transaction. */
function sqlAs(claims, sql) {
  const role = ["anon", "authenticated", "service_role"].includes(claims.role) ? claims.role : "anon";
  const script = [
    "begin;",
    `set local role ${role};`,
    `select set_config('request.jwt.claim.sub', ${lit(claims.sub ?? "")}, true);`,
    `select set_config('request.jwt.claim.email', ${lit(claims.email ?? "")}, true);`,
    `select set_config('request.jwt.claim.role', ${lit(role)}, true);`,
    sql,
    "commit;",
  ].join("\n");
  try {
    const raw = execFileSync("psql", [...PG, "-tAX", "-v", "ON_ERROR_STOP=1", "-c", script], { encoding: "utf8" });
    // drop psql command tags (BEGIN/SET/COMMIT…) so callers only see query output
    const out = raw
      .split("\n")
      .filter((l) => l && !/^(BEGIN|SET|COMMIT|ROLLBACK|INSERT \d+ \d+|DELETE \d+)$/.test(l))
      .join("\n");
    return { ok: true, out };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message) };
  }
}

function bucketConfig(bucket) {
  const r = sqlAs({ role: "service_role" }, `select coalesce(file_size_limit, 0) || '|' || coalesce(array_to_string(allowed_mime_types, ','), '') || '|' || public from storage.buckets where id = ${lit(bucket)};`);
  const line = r.ok ? r.out.trim().split("\n").filter(Boolean).pop() : "";
  if (!line) return null;
  const [limit, mimes, pub] = line.split("|");
  return { limit: Number(limit), mimes: mimes ? mimes.split(",") : [], public: pub === "t" };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/** Extracts the file part of a multipart body (field name ""), or returns the raw body. */
function fileFromBody(req, body) {
  const ct = req.headers["content-type"] ?? "";
  const m = /boundary=(.+)$/.exec(ct);
  if (!ct.startsWith("multipart/form-data") || !m) return { bytes: body, type: ct || "application/octet-stream" };
  const boundary = Buffer.from(`--${m[1]}`);
  let pos = 0;
  while ((pos = body.indexOf(boundary, pos)) !== -1) {
    const headerEnd = body.indexOf("\r\n\r\n", pos);
    if (headerEnd === -1) break;
    const headers = body.subarray(pos, headerEnd).toString();
    const next = body.indexOf(boundary, headerEnd);
    const content = body.subarray(headerEnd + 4, next - 2);
    if (/filename=/.test(headers)) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? "application/octet-stream";
      return { bytes: content, type };
    }
    pos = next;
  }
  return { bytes: Buffer.alloc(0), type: "application/octet-stream" };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function storageInsert(claims, bucket, path, file, upsert = false) {
  const cfg = bucketConfig(bucket);
  if (!cfg) return [404, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" }];
  if (cfg.limit && file.bytes.length > cfg.limit) return [413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" }];
  if (cfg.mimes.length && !cfg.mimes.includes(file.type)) return [400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${file.type} is not supported` }];
  for (const rule of failRules) {
    if (rule.remaining > 0 && rule.match.test(path)) {
      rule.remaining--;
      return [500, { statusCode: "500", error: "internal", message: "injected failure" }];
    }
  }
  const r = sqlAs(claims, `insert into storage.objects (bucket_id, name, owner, metadata) values (${lit(bucket)}, ${lit(path)}, ${claims.sub ? lit(claims.sub) : "null"}, jsonb_build_object('size', ${file.bytes.length}, 'mimetype', ${lit(file.type)}))${upsert ? " on conflict (bucket_id, name) do update set updated_at = now()" : ""};`);
  if (!r.ok) {
    if (/duplicate key/.test(r.error)) return [400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" }];
    if (/row-level security|permission denied/.test(r.error)) return [403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }];
    return [500, { statusCode: "500", error: "internal", message: r.error.slice(0, 200) }];
  }
  objects.set(`${bucket}/${path}`, file);
  return [200, { Key: `${bucket}/${path}` }];
}

function canSelect(claims, bucket, path) {
  const r = sqlAs(claims, `select count(*) from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(path)};`);
  return r.ok && r.out.trim().split("\n").filter(Boolean).pop() === "1";
}

async function storage(req, res, url) {
  const p = url.pathname.replace(/^\/storage\/v1/, "");
  const claims = caller(req);
  let m;

  if ((m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(p))) {
    const [, bucket, rawPath] = m;
    const path = decodeURIComponent(rawPath);
    if (req.method === "POST") {
      // creating a signed upload URL requires the caller to be allowed to insert (checked by rolling back a probe)
      if (claims.role !== "service_role") {
        const probe = sqlAs(claims, `insert into storage.objects (bucket_id, name) values (${lit(bucket)}, ${lit(path)}); rollback; begin;`);
        if (!probe.ok) return json(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      }
      const exp = Math.floor(Date.now() / 1000) + Number(process.env.SIGNED_UPLOAD_TTL ?? 7200);
      const payload = b64u(JSON.stringify({ bucket, path, exp, upsert: req.headers["x-upsert"] === "true" }));
      return json(res, 200, { url: `/object/upload/sign/${bucket}/${rawPath}?token=${payload}.${sign(payload)}` });
    }
    if (req.method === "PUT") {
      const [payload, sig] = (url.searchParams.get("token") ?? "").split(".");
      let tok = null;
      try {
        tok = sig === sign(payload) ? JSON.parse(Buffer.from(payload, "base64url").toString()) : null;
      } catch {}
      if (!tok || tok.bucket !== bucket || tok.path !== path) return json(res, 400, { statusCode: "403", error: "InvalidJWT", message: "invalid signature" });
      if (tok.exp * 1000 < Date.now()) return json(res, 400, { statusCode: "400", error: "InvalidJWT", message: "jwt expired" });
      const file = fileFromBody(req, await readBody(req));
      const [status, body] = storageInsert({ role: "service_role" }, bucket, path, file, tok.upsert && req.headers["x-upsert"] === "true");
      return json(res, status, body);
    }
  }

  if ((m = /^\/object\/sign\/([^/]+)$/.exec(p)) && req.method === "POST") {
    const bucket = m[1];
    const { paths = [], expiresIn = 60 } = JSON.parse((await readBody(req)).toString() || "{}");
    const out = paths.map((path) => {
      if (!canSelect(claims, bucket, path)) return { path, signedURL: null, error: "Either the object does not exist or you do not have access to it" };
      const payload = b64u(JSON.stringify({ bucket, path, exp: Math.floor(Date.now() / 1000) + expiresIn }));
      return { path, signedURL: `/object/sign/${bucket}/${encodeURIComponent(path).replace(/%2F/g, "/")}?token=${payload}.${sign(payload)}`, error: null };
    });
    return json(res, 200, out);
  }

  if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(p)) && req.method === "GET") {
    const [payload, sig] = (url.searchParams.get("token") ?? "").split(".");
    const tok = sig === sign(payload) ? JSON.parse(Buffer.from(payload, "base64url").toString()) : null;
    const key = `${m[1]}/${decodeURIComponent(m[2])}`;
    if (!tok || `${tok.bucket}/${tok.path}` !== key || tok.exp * 1000 < Date.now()) return json(res, 400, { error: "InvalidJWT" });
    const f = objects.get(key);
    if (!f) return json(res, 404, { error: "not_found" });
    res.writeHead(200, { "content-type": f.type });
    return res.end(f.bytes);
  }

  if ((m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(p))) {
    const cfg = bucketConfig(m[1]);
    const f = objects.get(`${m[1]}/${decodeURIComponent(m[2])}`);
    if (!cfg?.public || !f) return json(res, 400, { error: "not_found" });
    res.writeHead(200, { "content-type": f.type });
    return res.end(f.bytes);
  }

  if ((m = /^\/object\/([^/]+)$/.exec(p)) && req.method === "DELETE") {
    const bucket = m[1];
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
    const deleted = [];
    for (const path of prefixes) {
      const r = sqlAs(claims, `delete from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(path)} returning name;`);
      if (r.ok && r.out.includes(path)) {
        objects.delete(`${bucket}/${path}`);
        deleted.push({ name: path });
      }
    }
    return json(res, 200, deleted);
  }

  if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(p))) {
    const [, bucket, rawPath] = m;
    const path = decodeURIComponent(rawPath);
    if (req.method === "HEAD") {
      res.writeHead(canSelect(claims, bucket, path) ? 200 : 400);
      return res.end();
    }
    if (req.method === "POST") {
      const file = fileFromBody(req, await readBody(req));
      const [status, body] = storageInsert(claims, bucket, path, file, req.headers["x-upsert"] === "true");
      return json(res, status, body);
    }
  }

  return json(res, 404, { error: `mock: unsupported storage call ${req.method} ${p}` });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Browsers upload straight to Storage (signed URLs), like on Supabase: answer CORS.
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "authorization, apikey, x-upsert, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname.startsWith("/rest/v1")) {
      const path = req.url.replace(/^\/rest\/v1/, "");
      const proxied = http.request({ host: "127.0.0.1", port: 3001, path, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      proxied.on("error", (e) => json(res, 502, { error: String(e) }));
      return req.pipe(proxied);
    }
    if (url.pathname === "/auth/v1/user") {
      const claims = caller(req);
      if (!claims.sub) return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return json(res, 200, { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, user_metadata: {}, app_metadata: {} });
    }
    if (url.pathname.startsWith("/auth/v1/")) return json(res, 200, {});
    if (url.pathname.startsWith("/storage/v1/")) return storage(req, res, url);
    if (url.pathname === "/__mock/fail-uploads" && req.method === "POST") {
      const { pattern, count } = JSON.parse((await readBody(req)).toString());
      failRules.push({ match: new RegExp(pattern), remaining: count });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/__mock/seed-object" && req.method === "POST") {
      const { bucket, path, type } = JSON.parse((await readBody(req)).toString());
      objects.set(`${bucket}/${path}`, { bytes: Buffer.from("%PDF-1.4 seed"), type });
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "mock: not found" });
  })
  .listen(PORT, () => console.log(`mock supabase on ${PORT}`));
