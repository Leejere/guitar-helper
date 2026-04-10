<script lang="ts">
  import FretboardMap from './components/FretboardMap.svelte'
  import ChordFinder from './components/ChordFinder.svelte'
  import ChordIdentifier from './components/ChordIdentifier.svelte'
  import ShapeExplorer from './components/ShapeExplorer.svelte'
  import type { CAGEDShape } from './lib/voicings'

  type Tab = 'map' | 'finder' | 'identifier' | 'shapes';
  let activeTab: Tab = $state('map');
  let finderChord: string | undefined = $state(undefined);

  // Shape explorer navigation state
  let shapeNavShape: CAGEDShape | undefined = $state(undefined);
  let shapeNavPosition: number | undefined = $state(undefined);
  let shapeNavVariantIdx: number | undefined = $state(undefined);

  function navigateToChord(chordName: string) {
    finderChord = chordName;
    activeTab = 'finder';
  }

  function navigateToShape(shape: CAGEDShape, position: number, variantIdx?: number) {
    shapeNavShape = shape;
    shapeNavPosition = position;
    shapeNavVariantIdx = variantIdx;
    activeTab = 'shapes';
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'map', label: 'Fretboard Map' },
    { id: 'finder', label: 'Chord Finder' },
    { id: 'identifier', label: 'Chord Identifier' },
    { id: 'shapes', label: 'Shape Explorer' },
  ];
</script>

<div class="app-header no-print">
  <h1>Guitar Helper</h1>
  <a class="github-link" href="https://github.com/Leejere/guitar-helper" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
    <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
</div>

<nav class="tab-bar no-print">
  {#each tabs as tab}
    <button
      class:active={activeTab === tab.id}
      onclick={() => activeTab = tab.id}
    >
      {tab.label}
    </button>
  {/each}
</nav>

<div class="page-content">
  {#if activeTab === 'map'}
    <FretboardMap />
  {:else if activeTab === 'finder'}
    <ChordFinder initialChord={finderChord} onNavigateToShape={navigateToShape} />
  {:else if activeTab === 'shapes'}
    <ShapeExplorer
      onNavigateToChord={navigateToChord}
      initialShape={shapeNavShape}
      initialPosition={shapeNavPosition}
      initialVariantIdx={shapeNavVariantIdx}
    />
  {:else}
    <ChordIdentifier onChordSelect={navigateToChord} />
  {/if}
</div>

<style>
  .page-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    padding-top: 16px;
  }
</style>
