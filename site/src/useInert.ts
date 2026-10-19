import { useEffect, type RefObject } from 'react';

/** While a modal dialog is open, everything outside it is inert: Tab and screen readers stay inside. On close it clears
 *  only what it set, so a dialog opened over another leaves the one below still shut off. */
export const useInert = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const made: HTMLElement[] = [];
    const shut = (element: Node) => {
      if (element instanceof HTMLElement && !element.inert) {
        element.inert = true;
        made.push(element);
      }
    };
    const watchers: MutationObserver[] = [];
    for (let node = ref.current; node && node.parentElement && node !== document.body; node = node.parentElement) {
      const keep = node;
      for (const sibling of Array.from(node.parentElement.children)) if (sibling !== keep) shut(sibling);
      // What mounts while it's open is shut off too (the desktop shop card once the shops load), except a dialog
      // opened over this one.
      const watcher = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((added) => {
        const modal = added instanceof Element && (added.matches('[aria-modal="true"]') || !!added.querySelector('[aria-modal="true"]'));
        if (added !== keep && !modal) shut(added);
      })));
      watcher.observe(node.parentElement, { childList: true });
      watchers.push(watcher);
    }
    return () => {
      watchers.forEach((watcher) => watcher.disconnect());
      made.forEach((element) => { element.inert = false; });
    };
  }, [ref]);
};
