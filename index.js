/** Host half of the Kumquat bundle. The real implementation lives in src/host/. */
export async function apply(ctx, config) {
  const mod = await import('./src/host/plugin.js')
  return mod.apply(ctx, config)
}
