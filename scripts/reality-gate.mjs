import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Local-only check: never calls a media provider.
export function realityGate(manifest, manifestPath) {
  const configured = manifest.policies?.realityAuditPath;
  const auditPath = path.resolve(path.dirname(manifestPath), configured || 'reality-audit.json');
  const required = manifest.policies?.realityRequired === true || Boolean(configured);
  if (!required && !fs.existsSync(auditPath)) return [];
  if (!fs.existsSync(auditPath)) return [`缺少真实性审计文件：${auditPath}`];
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./reality-audit.mjs', import.meta.url)), 'preflight', auditPath], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (result.error) return [`真实性预检执行失败：${result.error.message}`];
  return result.status === 0 ? [] : [(result.stderr || result.stdout || '真实性预检失败').trim()];
}
