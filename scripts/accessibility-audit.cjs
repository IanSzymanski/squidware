'use strict';

/** Runs in Chromium. Checks rendered HTML text against composited solid backgrounds.
 * SVG artwork and system-drawn menu options are excluded. Disabled controls
 * are excluded unless explicitly requested.
 * This is bounded computed-style evidence, not screen-reader certification. */
function auditText({ includeDisabled = false } = {}) {
  const failures = [];
  let checked = 0;
  const rgb = value => {
    const values = value.match(/[\d.]+/g)?.map(Number);
    return values?.length >= 3 ? [values[0], values[1], values[2], values[3] ?? 1] : [255, 255, 255, 0];
  };
  const blend = (top, bottom) => top.slice(0, 3).map((value, index) => value * top[3] + bottom[index] * (1 - top[3]));
  const luminance = color => {
    const values = color.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const inspect = (element, text, pseudo) => {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || element.closest('svg') || !includeDisabled && element.closest(':disabled, [aria-disabled="true"]') || element.tagName === 'OPTION') return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const style = getComputedStyle(element, pseudo);
    const chain = []; for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) chain.unshift(ancestor);
    let background = [255, 255, 255];
    for (const ancestor of chain) background = blend(rgb(getComputedStyle(ancestor).backgroundColor), background);
    const color = rgb(style.color);
    color[3] *= chain.reduce((opacity, ancestor) => opacity * Number(getComputedStyle(ancestor).opacity), 1);
    const foreground = blend(color, background);
    const ratio = (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
    checked++;
    if (parseFloat(style.fontSize) < 10.99 || ratio < 4.5) failures.push({ tag: element.tagName, className: element.className, text: text.slice(0, 100), font: style.fontSize, color: style.color, background, ratio: Number(ratio.toFixed(2)), pseudo });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim() && node.parentElement) inspect(node.parentElement, node.textContent);
  for (const input of document.querySelectorAll('input[placeholder], textarea[placeholder]')) if (!input.value) inspect(input, input.placeholder, '::placeholder');
  return { checked, failures };
}
module.exports = { auditText };
