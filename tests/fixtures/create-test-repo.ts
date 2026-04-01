import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { createTempDir } from "../helpers/setup.js";

/** Run a git command with explicit timestamps for deterministic history */
function gitAt(dir: string, cmd: string, isoDate: string): string {
  return execSync(`git ${cmd}`, {
    cwd: dir,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    },
  }).trim();
}

/** Write a file (creating parent dirs) and stage it */
function writeAndStage(dir: string, relPath: string, content: string): void {
  const absPath = join(dir, relPath);
  const parentDir = absPath.substring(0, absPath.lastIndexOf("/"));
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(absPath, content, "utf-8");
  execSync(`git add ${relPath}`, { cwd: dir });
}

/** Produce an ISO 8601 timestamp offset by `offsetDays` from a base date */
function dateAt(baseDays: number): string {
  const base = new Date("2025-01-01T10:00:00Z");
  base.setDate(base.getDate() + baseDays);
  return base.toISOString();
}

export function createTestRepo(): string {
  const dir = createTempDir();

  // ── init ──────────────────────────────────────────────────────────────────
  execSync("git init -b main", { cwd: dir });
  execSync("git config user.email test@example.com", { cwd: dir });
  execSync("git config user.name 'Test Author'", { cwd: dir });

  // ── Phase 1: Clean growth (commits 1-15, days 0-14) ──────────────────────
  // Commit 1 – initial scaffold
  writeAndStage(dir, "src/auth/index.ts", "// auth module\nexport {};");
  writeAndStage(dir, "src/api/index.ts", "// api module\nexport {};");
  writeAndStage(dir, "README.md", "# My App\n");
  gitAt(dir, "commit -m 'feat: initial scaffold'", dateAt(0));

  // Commit 2
  writeAndStage(dir, "src/auth/login.ts", "export function login() {}\n");
  writeAndStage(dir, "src/utils/logger.ts", "export function log(msg: string) { console.log(msg); }\n");
  gitAt(dir, "commit -m 'feat: add login and logger'", dateAt(1));

  // Commit 3
  writeAndStage(dir, "src/auth/logout.ts", "export function logout() {}\n");
  writeAndStage(dir, "src/api/routes.ts", "export const routes = [];\n");
  gitAt(dir, "commit -m 'feat: add logout and routes'", dateAt(2));

  // Commit 4
  writeAndStage(dir, "src/api/middleware.ts", "export function middleware() {}\n");
  writeAndStage(dir, "src/utils/errors.ts", "export class AppError extends Error {}\n");
  gitAt(dir, "commit -m 'feat: add middleware and error types'", dateAt(3));

  // Commit 5
  writeAndStage(dir, "src/auth/session.ts", "export function createSession() {}\n");
  writeAndStage(dir, "src/api/handlers.ts", "export function handle() {}\n");
  gitAt(dir, "commit -m 'feat: add session management and handlers'", dateAt(4));

  // Commit 6
  writeAndStage(dir, "src/utils/config.ts", "export const config = {};\n");
  writeAndStage(dir, "src/auth/tokens.ts", "export function generateToken() {}\n");
  gitAt(dir, "commit -m 'feat: add config and token generation'", dateAt(5));

  // Commit 7
  writeAndStage(dir, "src/api/validation.ts", "export function validate(data: unknown) {}\n");
  writeAndStage(dir, "src/utils/helpers.ts", "export function slugify(s: string) { return s; }\n");
  gitAt(dir, "commit -m 'feat: add validation and helpers'", dateAt(6));

  // Commit 8
  writeAndStage(dir, "src/auth/permissions.ts", "export function canAccess() { return true; }\n");
  writeAndStage(dir, "src/api/responses.ts", "export function ok(data: unknown) { return data; }\n");
  gitAt(dir, "commit -m 'feat: add permissions and response helpers'", dateAt(7));

  // Commit 9
  writeAndStage(dir, "src/utils/cache.ts", "export const cache = new Map();\n");
  writeAndStage(dir, "src/auth/refresh.ts", "export function refreshToken() {}\n");
  gitAt(dir, "commit -m 'feat: add cache and token refresh'", dateAt(8));

  // Commit 10
  writeAndStage(dir, "src/api/pagination.ts", "export function paginate(items: unknown[]) { return items; }\n");
  writeAndStage(dir, "src/utils/format.ts", "export function formatDate(d: Date) { return d.toISOString(); }\n");
  gitAt(dir, "commit -m 'feat: add pagination and date formatting'", dateAt(9));

  // Commit 11
  writeAndStage(dir, "src/auth/index.ts", "// auth module v2\nexport { login } from './login.js';\nexport { logout } from './logout.js';\n");
  writeAndStage(dir, "src/api/index.ts", "// api module v2\nexport { routes } from './routes.js';\n");
  gitAt(dir, "commit -m 'refactor: consolidate exports'", dateAt(10));

  // Commit 12
  writeAndStage(dir, "src/utils/validation.ts", "export function isEmail(s: string) { return s.includes('@'); }\n");
  writeAndStage(dir, "src/api/auth-middleware.ts", "export function requireAuth() {}\n");
  gitAt(dir, "commit -m 'feat: add email validation and auth middleware'", dateAt(11));

  // Commit 13
  writeAndStage(dir, "src/auth/password.ts", "export function hashPassword(p: string) { return p; }\n");
  writeAndStage(dir, "src/utils/crypto.ts", "export function randomBytes(n: number) { return ''; }\n");
  gitAt(dir, "commit -m 'feat: add password hashing and crypto utils'", dateAt(12));

  // Commit 14
  writeAndStage(dir, "src/api/rate-limit.ts", "export function rateLimit() {}\n");
  writeAndStage(dir, "src/utils/queue.ts", "export class Queue<T> { items: T[] = []; }\n");
  gitAt(dir, "commit -m 'feat: add rate limiting and queue'", dateAt(13));

  // Commit 15
  writeAndStage(dir, "src/auth/audit.ts", "export function auditLog(action: string) {}\n");
  writeAndStage(dir, "src/api/docs.ts", "export const openapi = {};\n");
  gitAt(dir, "commit -m 'feat: add audit logging and API docs stub'", dateAt(14));

  // ── Phase 2: Things go wrong (commits 16-30, days 15-29) ─────────────────

  // Create feature/notifications branch from current HEAD
  execSync("git branch feature/notifications", { cwd: dir });

  // Commit 16 – thrash src/auth/index.ts (edit 1 of 5)
  writeAndStage(dir, "src/auth/index.ts", "// auth v3 - attempt 1\nexport {};\n");
  gitAt(dir, "commit -m 'chore: refactor auth index (attempt 1)'", dateAt(15));

  // Commit 17 – thrash (edit 2)
  writeAndStage(dir, "src/auth/index.ts", "// auth v3 - attempt 2\nexport { login } from './login.js';\n");
  gitAt(dir, "commit -m 'chore: refactor auth index (attempt 2)'", dateAt(15));

  // Commit 18 – thrash (edit 3)
  writeAndStage(dir, "src/auth/index.ts", "// auth v3 - attempt 3\nexport { login, logout } from './login.js';\n");
  gitAt(dir, "commit -m 'chore: refactor auth index (attempt 3)'", dateAt(16));

  // Commit 19 – thrash (edit 4)
  writeAndStage(dir, "src/auth/index.ts", "// auth v3 - attempt 4\n");
  gitAt(dir, "commit -m 'chore: refactor auth index (attempt 4)'", dateAt(16));

  // Commit 20 – thrash (edit 5)
  writeAndStage(dir, "src/auth/index.ts", "// auth v3 - final\nexport * from './login.js';\n");
  gitAt(dir, "commit -m 'chore: refactor auth index (attempt 5 - final)'", dateAt(17));

  // Commit 21 – scope creep: 12 files in one commit
  writeAndStage(dir, "src/auth/sso.ts", "export function ssoLogin() {}\n");
  writeAndStage(dir, "src/auth/oauth.ts", "export function oauthFlow() {}\n");
  writeAndStage(dir, "src/auth/saml.ts", "export function samlInit() {}\n");
  writeAndStage(dir, "src/api/graphql.ts", "export const schema = '';\n");
  writeAndStage(dir, "src/api/websocket.ts", "export function wsHandler() {}\n");
  writeAndStage(dir, "src/api/upload.ts", "export function upload() {}\n");
  writeAndStage(dir, "src/utils/pdf.ts", "export function toPdf() {}\n");
  writeAndStage(dir, "src/utils/csv.ts", "export function toCsv() {}\n");
  writeAndStage(dir, "src/utils/xlsx.ts", "export function toXlsx() {}\n");
  writeAndStage(dir, "src/utils/email.ts", "export function sendEmail() {}\n");
  writeAndStage(dir, "src/utils/sms.ts", "export function sendSms() {}\n");
  writeAndStage(dir, "src/utils/push.ts", "export function sendPush() {}\n");
  gitAt(dir, "commit -m 'feat: add SSO, OAuth, SAML, GraphQL, WebSocket, file uploads, PDF/CSV/XLSX export, email/SMS/push notifications'", dateAt(18));

  // Commit 22 – introduce a bad change (will be reverted)
  writeAndStage(dir, "src/api/routes.ts", "export const routes = null; // BAD: broke routes\n");
  gitAt(dir, "commit -m 'fix: update routes (broken)'", dateAt(19));

  // Commit 23 – revert commit 22
  gitAt(dir, "revert --no-edit HEAD", dateAt(19));

  // Commit 24 – another bad change (will be reverted)
  writeAndStage(dir, "src/auth/login.ts", "export function login() { throw new Error('disabled'); }\n");
  gitAt(dir, "commit -m 'feat: disable login temporarily'", dateAt(20));

  // Commit 25 – revert commit 24
  gitAt(dir, "revert --no-edit HEAD", dateAt(20));

  // Commit 26 – fix-on-fix chain start
  writeAndStage(dir, "src/utils/logger.ts", "export function log(msg: string) { if (!msg) return; console.log(msg); }\n");
  gitAt(dir, "commit -m 'fix: guard against empty log messages'", dateAt(21));

  // Commit 27 – fix-on-fix
  writeAndStage(dir, "src/utils/logger.ts", "export function log(msg: string) { if (!msg) return; console.log('[APP]', msg); }\n");
  gitAt(dir, "commit -m 'fix: add log prefix'", dateAt(22));

  // Commit 28 – fix-on-fix
  writeAndStage(dir, "src/utils/logger.ts", "export function log(msg: string, level = 'info') { if (!msg) return; console.log(`[${level.toUpperCase()}]`, msg); }\n");
  gitAt(dir, "commit -m 'fix: add log level support'", dateAt(23));

  // Switch to feature/notifications branch
  execSync("git checkout feature/notifications", { cwd: dir });

  // Commit 29 – notifications feature work
  writeAndStage(dir, "src/notifications/index.ts", "export {};\n");
  writeAndStage(dir, "src/notifications/email.ts", "export function emailNotify() {}\n");
  writeAndStage(dir, "src/notifications/push.ts", "export function pushNotify() {}\n");
  gitAt(dir, "commit -m 'feat: add notifications module'", dateAt(24));

  // Commit 30 – more notifications
  writeAndStage(dir, "src/notifications/templates.ts", "export const templates: Record<string, string> = {};\n");
  writeAndStage(dir, "src/notifications/queue.ts", "export class NotificationQueue { items = []; }\n");
  gitAt(dir, "commit -m 'feat: add notification templates and queue'", dateAt(25));

  // Switch back to main
  execSync("git checkout main", { cwd: dir });

  // ── Phase 3: Recovery (commits 31-45, days 26-40) ─────────────────────────

  // Commit 31 – big refactor: new src/core/ directory
  writeAndStage(dir, "src/core/app.ts", "export class App { start() {} stop() {} }\n");
  writeAndStage(dir, "src/core/container.ts", "export class Container { private services = new Map(); }\n");
  writeAndStage(dir, "src/core/router.ts", "export class Router { routes: unknown[] = []; }\n");
  writeAndStage(dir, "src/core/middleware.ts", "export class MiddlewareStack { stack: unknown[] = []; }\n");
  writeAndStage(dir, "src/core/events.ts", "export class EventBus { emit(event: string) {} }\n");
  writeAndStage(dir, "src/core/errors.ts", "export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }\n");
  gitAt(dir, "commit -m 'refactor: introduce core application framework'", dateAt(26));

  // Commit 32 – new src/services/ directory
  writeAndStage(dir, "src/services/user.ts", "export class UserService { async find(id: string) { return null; } }\n");
  writeAndStage(dir, "src/services/auth.ts", "export class AuthService { async verify(token: string) { return false; } }\n");
  writeAndStage(dir, "src/services/cache.ts", "export class CacheService { get(key: string) {} set(key: string, val: unknown) {} }\n");
  writeAndStage(dir, "src/services/mailer.ts", "export class MailerService { async send(to: string, subject: string) {} }\n");
  writeAndStage(dir, "src/services/storage.ts", "export class StorageService { async upload(file: Buffer) { return ''; } }\n");
  writeAndStage(dir, "src/services/analytics.ts", "export class AnalyticsService { track(event: string) {} }\n");
  gitAt(dir, "commit -m 'refactor: introduce service layer'", dateAt(27));

  // Commits 33-39: clean, focused commits
  writeAndStage(dir, "src/core/app.ts", "export class App { private started = false; start() { this.started = true; } stop() { this.started = false; } }\n");
  gitAt(dir, "commit -m 'feat: track app started state'", dateAt(28));

  writeAndStage(dir, "src/services/user.ts", "export class UserService { private cache = new Map(); async find(id: string) { return this.cache.get(id) ?? null; } }\n");
  gitAt(dir, "commit -m 'feat: add in-memory cache to UserService'", dateAt(29));

  writeAndStage(dir, "src/core/router.ts", "export class Router { routes: {path: string; handler: () => void}[] = []; add(path: string, handler: () => void) { this.routes.push({path, handler}); } }\n");
  gitAt(dir, "commit -m 'feat: add route registration to Router'", dateAt(29));

  writeAndStage(dir, "src/services/auth.ts", "export class AuthService { async verify(token: string) { return token.length > 0; } async revoke(token: string) {} }\n");
  gitAt(dir, "commit -m 'feat: add token revocation to AuthService'", dateAt(30));

  writeAndStage(dir, "src/core/events.ts", "export class EventBus { private listeners = new Map<string, Array<() => void>>(); emit(event: string) { this.listeners.get(event)?.forEach(f => f()); } on(event: string, fn: () => void) { if (!this.listeners.has(event)) this.listeners.set(event, []); this.listeners.get(event)!.push(fn); } }\n");
  gitAt(dir, "commit -m 'feat: add event listener support to EventBus'", dateAt(30));

  writeAndStage(dir, "src/services/cache.ts", "export class CacheService { private store = new Map<string, {val: unknown; ttl: number}>(); get(key: string) { return this.store.get(key)?.val; } set(key: string, val: unknown, ttl = 60) { this.store.set(key, {val, ttl}); } }\n");
  gitAt(dir, "commit -m 'feat: add TTL support to CacheService'", dateAt(31));

  writeAndStage(dir, "src/core/middleware.ts", "export type Middleware = (ctx: unknown, next: () => void) => void; export class MiddlewareStack { stack: Middleware[] = []; use(m: Middleware) { this.stack.push(m); } }\n");
  gitAt(dir, "commit -m 'feat: type middleware and add use() method'", dateAt(32));

  writeAndStage(dir, "src/services/analytics.ts", "export class AnalyticsService { private events: {name: string; ts: number}[] = []; track(event: string) { this.events.push({name: event, ts: Date.now()}); } flush() { const e = this.events.splice(0); return e; } }\n");
  gitAt(dir, "commit -m 'feat: add event buffer and flush to AnalyticsService'", dateAt(33));

  writeAndStage(dir, "src/utils/errors.ts", "export class AppError extends Error { constructor(public code: string, msg: string) { super(msg); } }\n");
  gitAt(dir, "commit -m 'refactor: add error code to AppError'", dateAt(34));

  writeAndStage(dir, "src/core/container.ts", "export class Container { private services = new Map<string, unknown>(); register(name: string, service: unknown) { this.services.set(name, service); } resolve<T>(name: string): T { return this.services.get(name) as T; } }\n");
  gitAt(dir, "commit -m 'feat: add register/resolve to Container'", dateAt(35));

  writeAndStage(dir, "src/api/handlers.ts", "export function handle(req: unknown) { return { status: 200, body: req }; }\n");
  gitAt(dir, "commit -m 'refactor: clean up API handler signature'", dateAt(36));

  writeAndStage(dir, "src/utils/helpers.ts", "export function slugify(s: string) { return s.toLowerCase().replace(/\\s+/g, '-'); }\nexport function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }\n");
  gitAt(dir, "commit -m 'feat: improve slugify and add capitalize helper'", dateAt(37));

  // ── Phase 4: Release (commits 46-50, days 38-42) ─────────────────────────

  // Tag v1.0 at current HEAD
  gitAt(dir, "tag v1.0 -m 'Release v1.0'", dateAt(38));

  // Merge feature/notifications branch
  gitAt(dir, "merge feature/notifications --no-ff -m 'feat: merge notifications module'", dateAt(38));

  // 3 more commits after merge
  writeAndStage(dir, "src/notifications/index.ts", "export { emailNotify } from './email.js';\nexport { pushNotify } from './push.js';\n");
  gitAt(dir, "commit -m 'feat: export notifications from index'", dateAt(39));

  writeAndStage(dir, "src/notifications/templates.ts", "export const templates: Record<string, string> = { welcome: 'Welcome!', reset: 'Reset your password.' };\n");
  gitAt(dir, "commit -m 'feat: add default notification templates'", dateAt(40));

  writeAndStage(dir, "README.md", "# My App\n\nv1.1 — stable release with notifications support.\n");
  gitAt(dir, "commit -m 'docs: update README for v1.1'", dateAt(41));

  // Tag v1.1
  gitAt(dir, "tag v1.1 -m 'Release v1.1'", dateAt(41));

  return dir;
}
