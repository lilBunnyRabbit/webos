<script lang="ts">
  interface Props {
    html: string;
    onlink: (event: MouseEvent) => void;
  }

  let { html, onlink }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="prose" onclick={onlink}>
  {@html html}
</div>

<style>
  .prose {
    font-size: 0.875rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
    color: var(--foreground);
  }

  .prose :global {
    > :first-child {
      margin-top: 0;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      position: relative;
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: -0.011em;
      text-wrap: balance;
      scroll-margin-top: 1rem;
    }

    h1 {
      font-size: 1.5rem;
      margin: 0 0 0.75rem;
    }

    h2 {
      font-size: 1.125rem;
      margin: 2.25rem 0 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
    }

    h3 {
      font-size: 0.9375rem;
      margin: 1.75rem 0 0.5rem;
    }

    h4,
    h5,
    h6 {
      font-size: 0.875rem;
      margin: 1.25rem 0 0.4rem;
    }

    .anchor {
      position: absolute;
      inset-inline-start: -1.1em;
      padding-inline-end: 0.3em;
      color: color-mix(in oklch, var(--foreground) 40%, transparent);
      text-decoration: none;
      opacity: 0;
      transition: opacity 150ms var(--ease-out);
    }

    :is(h2, h3, h4):hover .anchor {
      opacity: 1;
    }

    p,
    ul,
    ol,
    pre,
    .table-wrap,
    .code-block,
    blockquote,
    .callout {
      margin: 0 0 1rem;
    }

    ul,
    ol {
      padding-inline-start: 1.4em;
    }

    ul {
      list-style: disc;
    }

    ol {
      list-style: decimal;
    }

    li + li,
    li > ul,
    li > ol {
      margin-top: 0.3em;
    }

    li::marker {
      color: color-mix(in oklch, var(--foreground) 50%, transparent);
    }

    li:has(> input[type="checkbox"]) {
      list-style: none;
      margin-inline-start: -1.3em;
    }

    input[type="checkbox"] {
      accent-color: var(--primary);
      margin: 0 0.45em 0 0;
      vertical-align: -0.1em;
    }

    strong {
      font-weight: 600;
    }

    a {
      color: var(--primary);
      text-decoration: underline;
      text-decoration-color: color-mix(in oklch, var(--primary) 40%, transparent);
      text-underline-offset: 2px;
    }

    a:hover {
      text-decoration-color: var(--primary);
    }

    a[data-external]::after {
      content: "↗";
      font-size: 0.75em;
      margin-inline-start: 0.15em;
      color: color-mix(in oklch, var(--foreground) 50%, transparent);
    }

    code {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      background: color-mix(in oklch, var(--foreground) 7%, transparent);
      padding: 0.1em 0.35em;
      border-radius: calc(0.25rem * var(--radius-scale, 1));
    }

    .code-block {
      position: relative;
    }

    .code-lang {
      position: absolute;
      top: 0.4rem;
      inset-inline-end: 0.6rem;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: color-mix(in oklch, var(--foreground) 65%, transparent);
    }

    pre {
      margin: 0;
      background: light-dark(var(--background-lightest), var(--background-darker));
      padding: 0.85rem 1rem;
      border-radius: calc(0.625rem * var(--radius-scale, 1));
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 8%, transparent);
      overflow: auto;
      line-height: 1.55;
      overflow-wrap: normal;
    }

    pre code {
      background: none;
      padding: 0;
      font-size: 0.78rem;
    }

    blockquote {
      padding: 0.1rem 0 0.1rem 1rem;
      border-inline-start: 3px solid color-mix(in oklch, var(--foreground) 15%, transparent);
      color: color-mix(in oklch, var(--foreground) 80%, transparent);
    }

    .callout {
      padding: 0.75rem 1rem;
      border-radius: calc(0.875rem * var(--radius-scale, 1));
      background: color-mix(in oklch, var(--info) 8%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--info) 22%, transparent);
    }

    .callout[data-kind="revision"] {
      background: color-mix(in oklch, var(--primary) 7%, transparent);
      box-shadow: inset 3px 0 0 0 var(--primary), inset 0 0 0 1px color-mix(in oklch, var(--primary) 18%, transparent);
    }

    .callout > :last-child {
      margin-bottom: 0;
    }

    .callout[data-kind="revision"] > p:first-child > strong:first-child {
      display: block;
      color: var(--primary);
      font-size: 0.75rem;
      letter-spacing: 0.02em;
      margin-bottom: 0.15rem;
    }

    .table-wrap {
      overflow: auto;
      max-width: 100%;
      border-radius: calc(0.875rem * var(--radius-scale, 1));
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
    }

    table {
      width: 100%;
      overflow-wrap: break-word;
      border-collapse: collapse;
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    th {
      position: sticky;
      top: 0;
      background: var(--background-light);
      text-align: start;
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: color-mix(in oklch, var(--foreground) 65%, transparent);
      white-space: nowrap;
    }

    th,
    td {
      padding: 0.5rem 0.75rem;
      vertical-align: top;
      border-bottom: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
      min-width: 7rem;
      max-width: 26rem;
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }

    tbody tr:hover td {
      background: color-mix(in oklch, var(--foreground) 3%, transparent);
    }

    td code {
      overflow-wrap: anywhere;
    }

    hr {
      border: 0;
      border-top: 1px solid color-mix(in oklch, var(--foreground) 10%, transparent);
      margin: 2rem 0;
    }

    img {
      max-width: 100%;
    }

    .adr-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: -0.25rem;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: color-mix(in oklch, var(--foreground) 80%, transparent);
    }

    .adr-meta a {
      color: inherit;
    }

    :focus-visible {
      outline: 2px solid var(--cottontail);
      outline-offset: 2px;
    }
  }
</style>
