/**
 * Decide whether an `npm audit` result should fail the build.
 *
 * Reads the audit JSON on stdin. Two things it does that `npm audit`'s own exit
 * code does not:
 *
 *  - It judges per package rather than from `metadata.vulnerabilities`, so a
 *    reviewed exception can be excluded by name while everything else still
 *    blocks.
 *  - It enforces the review date on every exception. An allowlist entry whose
 *    `reviewBy` has passed fails the build by itself, so an exception cannot
 *    quietly become permanent - which is the usual way a gate like this rots.
 *
 * Usage: node audit-verdict.js <app> <blocking:true|false> < audit.json
 */
const fs = require('fs');
const path = require('path');

const appName = process.argv[2];
const blocking = process.argv[3] !== 'false';
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadAllowlist() {
  const file = path.join(__dirname, '..', 'audit-allowlist.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsed[appName] ?? [];
}

const raw = readStdin().trim();
if (!raw) {
  console.error('::error::npm audit produced no output for ' + appName);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  console.error('::error::could not parse the audit report for ' + appName + ': ' + error.message);
  process.exit(1);
}

const allowlist = loadAllowlist();
const allowedByName = new Map(allowlist.map((entry) => [entry.package, entry]));
const today = new Date().toISOString().slice(0, 10);

// An expired exception is a finding in its own right, and it is reported even
// when the package it covers no longer has an advisory - the point is that
// somebody said they would look again by a date, and the date has passed.
const expired = allowlist.filter((entry) => !entry.reviewBy || entry.reviewBy < today);

const blockingFindings = [];
const accepted = [];

for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  if (!BLOCKING_SEVERITIES.has(entry.severity)) continue;
  if (allowedByName.has(name)) {
    accepted.push(name);
    continue;
  }
  blockingFindings.push({ name, severity: entry.severity, direct: Boolean(entry.isDirect) });
}

console.log(`--- ${appName} ---`);
const counts = report.metadata?.vulnerabilities ?? {};
console.log('npm reports:', JSON.stringify(counts));

if (accepted.length) {
  console.log('accepted by review:', accepted.join(', '));
}

if (blockingFindings.length === 0) {
  console.log('no unreviewed high or critical advisories in production dependencies');
} else {
  for (const finding of blockingFindings) {
    const where = finding.direct ? 'direct dependency' : 'transitive';
    const line = `${appName}: ${finding.severity} advisory in ${finding.name} (${where})`;
    console.log(blocking ? `::error::${line}` : `::warning::${line}`);
  }
}

for (const entry of expired) {
  console.log(
    `::error::${appName}: the review date on the ${entry.package} exception has passed ` +
      `(${entry.reviewBy ?? 'no date set'}). Re-check whether it still holds, then move the date or remove the entry.`,
  );
}

if (expired.length > 0) process.exit(1);
if (blockingFindings.length > 0 && blocking) process.exit(1);

if (blockingFindings.length > 0) {
  console.log(
    `${blockingFindings.length} advisory/advisories reported but not blocking for ${appName} - see the workflow comment for why.`,
  );
}
