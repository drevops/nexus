/**
 * The Help panel's body and the Help links outside it.
 *
 * The panel shows the manual of src/manual.js: a search box, the contents
 * filtered by it beside the page, and the sections of the page under its
 * entry. A link with `data-page` opens that page in the panel. The page HTML
 * is built from docs/ by `npm run build-manual`, so it holds no user data.
 */

import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import htmBase from 'htm';
import { MANUAL_PAGES, MANUAL_SECTIONS } from './manual.js';
import { adjacentPages, findHelpPage, helpTarget, searchManual } from './help.js';
import { icon } from './icons.js';
import { openHelp, setHelpSearch } from './store.js';

const html = htmBase.bind(h);

// Below this body width the contents sit above the page instead of beside it.
const NARROW_WIDTH = 520;

// The room left above a heading or contents entry scrolled to the top.
const SCROLL_MARGIN = 8;

function rawIcon(name, size) {
  return html`<span class="help__icon" dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

function useNarrow(ref) {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW_WIDTH));
    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return narrow;
}

function Contents({ navRef, pages, current, anchor }) {
  const shown = new Set(pages.map((page) => page.id));
  const sections = MANUAL_SECTIONS.map((section) => ({ section, pages: MANUAL_PAGES.filter((page) => page.section === section && shown.has(page.id)) }));

  return html`<nav ref=${navRef} class="help__nav" aria-label="Manual contents">
    ${sections
      .filter((group) => group.pages.length)
      .map(
        (group) =>
          html`<div class="help__section" key=${group.section}>
            <h3 class="help__section-title">${group.section}</h3>
            ${group.pages.map(
              (page) =>
                html`<button
                    key=${page.id}
                    type="button"
                    class=${'help__link' + (page.id === current.id ? ' is-current' : '')}
                    aria-current=${page.id === current.id ? 'page' : null}
                    data-help-link=${page.id}
                    title=${page.summary}
                    onClick=${() => openHelp(page.id)}
                  >
                    ${page.title}
                  </button>
                  ${page.id === current.id
                    ? page.headings.map(
                        (heading) =>
                          html`<button
                            key=${heading.id}
                            type="button"
                            class=${'help__sublink' + (heading.id === anchor ? ' is-current' : '')}
                            data-help-anchor=${heading.id}
                            title=${'Go to "' + heading.text + '"'}
                            onClick=${() => openHelp(page.id, heading.id)}
                          >
                            ${heading.text}
                          </button>`,
                      )
                    : null}`,
            )}
          </div>`,
      )}
    ${pages.length ? null : html`<p class="panel__note help__empty">No page matches.</p>`}
    <button id="help-about" type="button" class="help__about" title="Show the version and licence of Nexus" onClick=${() => document.getElementById('about-dialog').show()}>
      ${rawIcon('nexus')}About Nexus
    </button>
  </nav>`;
}

function Pager({ page }) {
  const { previous, next } = adjacentPages(MANUAL_PAGES, page.id);
  const link = (target, label, cls) =>
    target
      ? html`<button type="button" class=${'help__pager-link ' + cls} title=${label + ': ' + target.title} onClick=${() => openHelp(target.id)}>
          <span class="help__pager-label">${label}</span><span class="help__pager-title">${target.title}</span>
        </button>`
      : html`<span></span>`;

  return html`<nav class="help__pager" aria-label="Previous and next page">${link(previous, 'Previous', 'is-previous')}${link(next, 'Next', 'is-next')}</nav>`;
}

/**
 * The body of the Help panel. `help` is the store's `{ page, anchor, jump }`
 * and `search` the text the contents are filtered by.
 */
export function HelpBody({ help, search }) {
  const rootRef = useRef(null);
  const navRef = useRef(null);
  const pageRef = useRef(null);
  const narrow = useNarrow(rootRef);
  const page = findHelpPage(MANUAL_PAGES, help.page) || MANUAL_PAGES[0];
  const pages = searchManual(MANUAL_PAGES, search);

  // Each openHelp() call scrolls again, even to the section already shown.
  useLayoutEffect(() => {
    const scroller = pageRef.current;
    const target = help.anchor && scroller.querySelector('[id="' + CSS.escape(help.anchor) + '"]');

    if (!target) {
      scroller.scrollTop = 0;

      return;
    }

    scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - SCROLL_MARGIN;
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
  }, [page.id, help.anchor, help.jump]);

  // The contents scroll on their own, so the open page's entry is brought
  // into view when it lies outside them.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const link = nav.querySelector('.help__link.is-current');

    if (!link) {
      return;
    }

    const box = link.getBoundingClientRect();
    const view = nav.getBoundingClientRect();

    if (box.top < view.top || box.bottom > view.bottom) {
      nav.scrollTop += box.top - view.top - SCROLL_MARGIN;
    }
  }, [page.id, help.jump, narrow]);

  function follow(evt) {
    const link = evt.target.closest('a[data-page]');

    if (link) {
      evt.preventDefault();
      openHelp(link.dataset.page, link.dataset.anchor || null);
    }
  }

  return html`<div class="panel__toolbar help__toolbar">
      <sl-input
        id="help-search"
        class="panel__search"
        size="small"
        type="search"
        placeholder="Search the manual…"
        title="Show only the pages that hold every word you type"
        clearable
        value=${search}
        onsl-input=${(e) => setHelpSearch(e.target.value)}
      ></sl-input>
    </div>
    <div ref=${rootRef} class=${'help' + (narrow ? ' is-narrow' : '')}>
      <${Contents} navRef=${navRef} pages=${pages} current=${page} anchor=${help.anchor} />
      <div ref=${pageRef} class="help__page" data-page=${page.id}>
        <article class="help__article">
          <p class="help__crumb">${page.section}</p>
          <h1 class="help__title">${page.title}</h1>
          <div class="help__content" onClick=${follow} dangerouslySetInnerHTML=${{ __html: page.html }}></div>
          <${Pager} page=${page} />
        </article>
      </div>
    </div>`;
}

/**
 * Wires the ? button of each dialog, which opens the dialog's page, and the
 * links with `data-help-page`, which open their page and section. Both close
 * the dialog they sit in, since a dialog covers the panel.
 */
export function initHelpLinks() {
  document.querySelectorAll('.dialog__help').forEach((button) => {
    const dialog = button.closest('sl-dialog');
    const target = helpTarget(dialog.id);

    button.addEventListener('click', () => {
      dialog.hide();
      openHelp(target.page, target.anchor || null);
    });
  });

  document.querySelectorAll('[data-help-page]').forEach((link) => {
    link.addEventListener('click', (evt) => {
      evt.preventDefault();

      const dialog = link.closest('sl-dialog');

      if (dialog) {
        dialog.hide();
      }

      openHelp(link.dataset.helpPage, link.dataset.helpAnchor || null);
    });
  });
}
