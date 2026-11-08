<script lang="ts">
  interface Props {
    top?: number;
    right?: number;
  }

  let { top = $bindable(0), right = $bindable(0) }: Props = $props();
</script>

<!-- The window's immersive insets in px for a canvas or a camera: CSS custom properties hold rem, so it measures a box sized by them. -->
<div
  aria-hidden="true"
  class="pointer-events-none invisible absolute top-0 right-0 h-(--immersive-inset-top,0px) w-(--immersive-inset-right,0px)"
  bind:clientHeight={top}
  bind:clientWidth={right}
></div>
