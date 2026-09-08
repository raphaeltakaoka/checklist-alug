<script>
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import AutoUpdater from "$lib/components/AutoUpdater.svelte";

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<AutoUpdater />
