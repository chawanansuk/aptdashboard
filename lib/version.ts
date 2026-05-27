/**
 * Decide whether to prompt the user to reload for a new deploy.
 *
 * `loaded` is the build SHA baked into the running bundle
 * (NEXT_PUBLIC_BUILD_ID); `server` is what /api/version reports for the
 * live deployment. We prompt only when they genuinely differ — and never
 * in local/dev ("dev"), where there's nothing to update to.
 */
export function shouldPromptUpdate(
  loaded: string | undefined,
  server: string | undefined,
): boolean {
  if (!loaded || loaded === "dev") return false;
  if (!server || server === "dev") return false;
  return server !== loaded;
}
