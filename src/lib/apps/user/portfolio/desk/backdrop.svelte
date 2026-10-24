<div class="backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"></div>

<style>
  /* Light stops at `background-dark`: its deeper rungs turn loud. */
  .backdrop {
    background: radial-gradient(
      ellipse 75% 70% at 50% 44%,
      light-dark(var(--background-lightest), var(--background-light)) 0%,
      light-dark(var(--background-lighter), var(--background)) 34%,
      light-dark(var(--background), var(--background-dark)) 62%,
      light-dark(color-mix(in oklch, var(--background) 40%, var(--background-dark)), var(--background-darker)) 85%,
      light-dark(var(--background-dark), var(--background-darkest)) 100%
    );
  }

  /* Takes the stage's grid column so the light centres on the stage, not on stage plus rail. */
  :global(.portfolio:not(.stacked)) > .backdrop {
    grid-column: 2;
    grid-row: 1;
  }

  :global(.portfolio.stacked) > .backdrop {
    background: radial-gradient(
      ellipse 120% 55% at 50% 38%,
      light-dark(var(--background-lightest), var(--background-light)) 0%,
      light-dark(var(--background-lighter), var(--background)) 38%,
      light-dark(var(--background), var(--background-dark)) 70%,
      light-dark(var(--background-dark), var(--background-darkest)) 100%
    );
  }
</style>
