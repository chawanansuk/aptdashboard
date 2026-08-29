/**
 * Expected Apps Script backend version.
 *
 * This is the version the CURRENT frontend was built to talk to. It must
 * match the `BACKEND_VERSION` constant in apps-script/Code.gs. When you
 * ship a Code.gs change, bump BOTH — then the Health banner nags until
 * the operator actually runs "Manage deployments → New version", turning
 * the previously-silent "did my redeploy take?" question into an explicit
 * on-screen answer.
 */
export const EXPECTED_BACKEND_VERSION = "3.27.0";

/**
 * Compare two dotted numeric versions ("3.21.0" vs "3.10.0").
 * Returns <0 if a<b, 0 if equal, >0 if a>b. Non-numeric / missing
 * segments are treated as 0 so "unknown" sorts below any real version.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Is the deployed backend older than what this frontend expects?
 * A deployed version we can't parse ("unknown") counts as outdated —
 * better a false nag than a silent stale backend. A NEWER backend
 * (frontend lagging a deploy) is NOT flagged: old clients still work.
 */
export function isBackendOutdated(
  deployedVersion: string,
  expected: string = EXPECTED_BACKEND_VERSION,
): boolean {
  return compareVersions(deployedVersion, expected) < 0;
}
