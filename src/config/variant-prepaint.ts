const VARIANT_PREPAINT_BRANCH =
  "if(v)document.documentElement.dataset.variant=v;else document.documentElement.removeAttribute('data-variant');";

export function injectBuildTimeVariantPrepaint(html: string, activeVariant: string): string {
  if (activeVariant === 'full' || !html.includes('<script data-wm-prepaint>')) return html;

  const replacement =
    `v=${JSON.stringify(activeVariant)};document.documentElement.dataset.variant=v;`;
  const transformed = html.replace(VARIANT_PREPAINT_BRANCH, replacement);

  if (transformed === html) {
    throw new Error('[vite] variant prepaint branch not found in index.html');
  }

  return transformed;
}
