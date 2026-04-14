<script lang="ts">
  import FretboardMap from './components/FretboardMap.svelte'
  import ChordFinder from './components/ChordFinder.svelte'
  import ChordIdentifier from './components/ChordIdentifier.svelte'
  import ShapeExplorer from './components/ShapeExplorer.svelte'
  import ProgressionBuilder from './components/ProgressionBuilder.svelte'
  import { progression, ProgressionState } from './lib/progression.svelte'
  import { pool } from './lib/pool.svelte'
  import { fretsToVoicing } from './lib/music'
  import { STANDARD } from './lib/tunings'
  import { toast } from './lib/toast.svelte'
  import { i18n, t } from './lib/i18n.svelte'
  import type { CAGEDShape } from './lib/voicings'

  type Tab = 'home' | 'map' | 'finder' | 'identifier' | 'shapes' | 'progression';
  let activeTab: Tab = $state('home');
  let finderChord: string | undefined = $state(undefined);
  let finderFrets: number[] | undefined = $state(undefined);

  // Check for shared progression URL on load
  {
    const hash = window.location.hash;
    let loaded = false;

    // Compact format: #p=title|chords|cells
    const compactMatch = hash.match(/^#p=(.+)$/);
    if (compactMatch) {
      try {
        const decoded = decodeURIComponent(compactMatch[1]);
        const parsed = ProgressionState.fromCompactUrl(decoded);
        if (parsed) {
          // Add chords to pool and build key mapping
          const keys: string[] = [];
          for (const c of parsed.chords) {
            const voicing = fretsToVoicing(c.frets, STANDARD.notes);
            pool.add(voicing, STANDARD, c.chordName);
            keys.push(pool.keyFor(c.frets, c.chordName));
          }
          // Build cells from indices
          const cellKeys = parsed.cells.map(idx => idx !== null && idx >= 0 && idx < keys.length ? keys[idx] : null);
          progression.loadFromSnapshot({
            title: parsed.title,
            poolEntries: [],
            cells: cellKeys,
          });
          loaded = true;
        }
      } catch {
        // Invalid URL data — ignore
      }
    }

    // Legacy format: #progression=base64json
    if (!loaded) {
      const legacyMatch = hash.match(/^#progression=(.+)$/);
      if (legacyMatch) {
        try {
          const json = decodeURIComponent(escape(atob(legacyMatch[1])));
          const snap = JSON.parse(json);
          if (snap && snap.cells && Array.isArray(snap.cells)) {
            progression.loadFromSnapshot(snap);
            loaded = true;
          }
        } catch {
          // Invalid URL data — ignore
        }
      }
    }

    if (loaded) {
      activeTab = 'progression';
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // Shape explorer navigation state
  let shapeNavShape: CAGEDShape | undefined = $state(undefined);
  let shapeNavPosition: number | undefined = $state(undefined);
  let shapeNavVariantIdx: number | undefined = $state(undefined);

  // Watch for pending navigation from ChordDiagram's add-to-cell flow
  $effect(() => {
    const nav = progression.pendingNav;
    if (nav) {
      activeTab = nav as Tab;
      progression.pendingNav = null;
    }
  });

  function navigateToChord(chordName: string, frets?: number[]) {
    finderChord = chordName;
    finderFrets = frets;
    activeTab = 'finder';
  }

  function navigateToShape(shape: CAGEDShape, position: number, variantIdx?: number) {
    shapeNavShape = shape;
    shapeNavPosition = position;
    shapeNavVariantIdx = variantIdx;
    activeTab = 'shapes';
  }

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: 'map', labelKey: 'tabs.map' },
    { id: 'finder', labelKey: 'tabs.finder' },
    { id: 'identifier', labelKey: 'tabs.identifier' },
    { id: 'shapes', labelKey: 'tabs.shapes' },
    { id: 'progression', labelKey: 'tabs.progression' },
  ];

  const tileKeys = [
    { id: 'map' as Tab, titleKey: 'tiles.map.title', descKey: 'tiles.map.desc' },
    { id: 'finder' as Tab, titleKey: 'tiles.finder.title', descKey: 'tiles.finder.desc' },
    { id: 'identifier' as Tab, titleKey: 'tiles.identifier.title', descKey: 'tiles.identifier.desc' },
    { id: 'shapes' as Tab, titleKey: 'tiles.shapes.title', descKey: 'tiles.shapes.desc' },
    { id: 'progression' as Tab, titleKey: 'tiles.progression.title', descKey: 'tiles.progression.desc' },
  ];
</script>

{#if activeTab === 'home'}
  <div class="home-page">
    <div class="home-header no-print">
      <h1 class="home-title">{t('app.title')}</h1>
      <div class="home-header-actions">
        <button class="locale-toggle" onclick={() => i18n.setLocale(i18n.locale === 'en' ? 'cn' : 'en')}>
          <span class:active={i18n.locale === 'en'}>EN</span><span class="locale-sep">|</span><span class:active={i18n.locale === 'cn'}>中文</span>
        </button>
        <a class="github-link" href="https://github.com/Leejere/guitar-helper" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        </a>
      </div>
    </div>
    <div class="home-grid">
      {#each tileKeys as tile}
        <button class="home-tile" onclick={() => activeTab = tile.id}>
          <h2>{t(tile.titleKey)}</h2>
          <div class="tile-diagram">
            {#if tile.id === 'map'}
              <!-- Mini fretboard with C major scale dots -->
              <svg viewBox="0 0 230 78" fill="none">
                <line x1="28" y1="7" x2="220" y2="7" stroke="var(--string-color)" stroke-width="1.2" opacity="0.3"/>
                <line x1="28" y1="20" x2="220" y2="20" stroke="var(--string-color)" stroke-width="1.1" opacity="0.3"/>
                <line x1="28" y1="33" x2="220" y2="33" stroke="var(--string-color)" stroke-width="1" opacity="0.3"/>
                <line x1="28" y1="46" x2="220" y2="46" stroke="var(--string-color)" stroke-width="0.9" opacity="0.3"/>
                <line x1="28" y1="59" x2="220" y2="59" stroke="var(--string-color)" stroke-width="0.8" opacity="0.3"/>
                <line x1="28" y1="72" x2="220" y2="72" stroke="var(--string-color)" stroke-width="0.7" opacity="0.3"/>
                <line x1="28" y1="3" x2="28" y2="76" stroke="var(--text-muted)" stroke-width="2"/>
                <line x1="76" y1="3" x2="76" y2="76" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="124" y1="3" x2="124" y2="76" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="172" y1="3" x2="172" y2="76" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="220" y1="3" x2="220" y2="76" stroke="var(--border)" stroke-width="0.6"/>
                <circle cx="148" cy="20" r="7" fill="var(--root-bg)"/>
                <circle cx="52" cy="59" r="7" fill="var(--root-bg)"/>
                <circle cx="14" cy="7" r="6" fill="var(--accent)"/>
                <circle cx="148" cy="7" r="6" fill="var(--accent)"/>
                <circle cx="100" cy="20" r="6" fill="var(--accent)"/>
                <circle cx="100" cy="33" r="6" fill="var(--accent)"/>
                <circle cx="14" cy="46" r="6" fill="var(--accent)"/>
                <circle cx="100" cy="46" r="6" fill="var(--accent)"/>
                <circle cx="14" cy="72" r="6" fill="var(--accent)"/>
                <circle cx="148" cy="72" r="6" fill="var(--accent)"/>
                <circle cx="52" cy="7" r="5" fill="var(--accent)" opacity="0.4"/>
                <circle cx="148" cy="33" r="5" fill="var(--accent)" opacity="0.4"/>
                <circle cx="52" cy="72" r="5" fill="var(--accent)" opacity="0.4"/>
              </svg>
            {:else if tile.id === 'finder'}
              <!-- Chord name → voicing diagram -->
              <svg viewBox="0 0 200 58" fill="none">
                <rect x="5" y="14" width="48" height="30" rx="8" fill="var(--accent)" opacity="0.15"/>
                <text x="29" y="30" text-anchor="middle" dominant-baseline="central" font-size="20" fill="var(--accent)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">Am</text>
                <line x1="64" y1="30" x2="92" y2="30" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"/>
                <polyline points="88,25 95,30 88,35" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="110" y1="10" x2="110" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="122" y1="10" x2="122" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="134" y1="10" x2="134" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="146" y1="10" x2="146" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="158" y1="10" x2="158" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="170" y1="10" x2="170" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="108" y1="10" x2="172" y2="10" stroke="var(--text-muted)" stroke-width="2"/>
                <line x1="108" y1="24" x2="172" y2="24" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="108" y1="38" x2="172" y2="38" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="108" y1="52" x2="172" y2="52" stroke="var(--border)" stroke-width="0.6"/>
                <text x="110" y="6" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-weight="700" font-family="system-ui">×</text>
                <circle cx="122" cy="4" r="2.5" fill="none" stroke="var(--text-muted)" stroke-width="1"/>
                <circle cx="134" cy="31" r="4.5" fill="var(--accent)"/>
                <circle cx="146" cy="31" r="4.5" fill="var(--accent)"/>
                <circle cx="158" cy="17" r="4.5" fill="var(--accent)"/>
                <circle cx="170" cy="4" r="2.5" fill="none" stroke="var(--text-muted)" stroke-width="1"/>
              </svg>
            {:else if tile.id === 'identifier'}
              <!-- Voicing diagram → chord name -->
              <svg viewBox="0 0 200 58" fill="none">
                <line x1="18" y1="10" x2="18" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="30" y1="10" x2="30" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="42" y1="10" x2="42" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="54" y1="10" x2="54" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="66" y1="10" x2="66" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="78" y1="10" x2="78" y2="54" stroke="var(--string-color)" stroke-width="0.6" opacity="0.4"/>
                <line x1="16" y1="10" x2="80" y2="10" stroke="var(--text-muted)" stroke-width="2"/>
                <line x1="16" y1="24" x2="80" y2="24" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="16" y1="38" x2="80" y2="38" stroke="var(--border)" stroke-width="0.6"/>
                <line x1="16" y1="52" x2="80" y2="52" stroke="var(--border)" stroke-width="0.6"/>
                <rect x="16" y="14.5" width="64" height="5" rx="2.5" fill="var(--accent)" opacity="0.7"/>
                <circle cx="30" cy="45" r="4.5" fill="var(--accent)"/>
                <circle cx="42" cy="45" r="4.5" fill="var(--accent)"/>
                <circle cx="54" cy="31" r="4.5" fill="var(--accent)"/>
                <line x1="98" y1="30" x2="126" y2="30" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"/>
                <polyline points="122,25 129,30 122,35" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="140" y="14" width="50" height="30" rx="8" fill="var(--accent)" opacity="0.15"/>
                <text x="165" y="30" text-anchor="middle" dominant-baseline="central" font-size="20" fill="var(--accent)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">F</text>
              </svg>
            {:else if tile.id === 'shapes'}
              <!-- CAGED shape badges -->
              <svg viewBox="0 0 230 36" fill="none">
                <rect x="5" y="3" width="36" height="30" rx="6" fill="var(--tag-caged)" opacity="0.18"/>
                <text x="23" y="19" text-anchor="middle" dominant-baseline="central" font-size="16" fill="var(--tag-caged)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">C</text>
                <rect x="49" y="3" width="36" height="30" rx="6" fill="var(--accent)" opacity="0.18"/>
                <text x="67" y="19" text-anchor="middle" dominant-baseline="central" font-size="16" fill="var(--accent)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">A</text>
                <rect x="93" y="3" width="36" height="30" rx="6" fill="var(--success)" opacity="0.18"/>
                <text x="111" y="19" text-anchor="middle" dominant-baseline="central" font-size="16" fill="var(--success)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">G</text>
                <rect x="137" y="3" width="36" height="30" rx="6" fill="var(--tag-barre)" opacity="0.18"/>
                <text x="155" y="19" text-anchor="middle" dominant-baseline="central" font-size="16" fill="var(--tag-barre)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">E</text>
                <rect x="181" y="3" width="36" height="30" rx="6" fill="var(--tag-other)" opacity="0.25"/>
                <text x="199" y="19" text-anchor="middle" dominant-baseline="central" font-size="16" fill="var(--tag-other)" font-weight="700" font-family="'Work Sans', system-ui, sans-serif">D</text>
              </svg>
            {:else if tile.id === 'progression'}
              <!-- Chord progression cells -->
              <svg viewBox="0 0 220 34" fill="none">
                <rect x="2" y="2" width="50" height="30" rx="5" stroke="var(--accent)" stroke-width="1" opacity="0.6"/>
                <text x="27" y="18" text-anchor="middle" dominant-baseline="central" font-size="11" fill="var(--accent)" font-weight="600" font-family="'Work Sans', system-ui, sans-serif">Am</text>
                <rect x="57" y="2" width="50" height="30" rx="5" stroke="var(--accent)" stroke-width="1" opacity="0.6"/>
                <text x="82" y="18" text-anchor="middle" dominant-baseline="central" font-size="11" fill="var(--accent)" font-weight="600" font-family="'Work Sans', system-ui, sans-serif">F</text>
                <rect x="112" y="2" width="50" height="30" rx="5" stroke="var(--accent)" stroke-width="1" opacity="0.6"/>
                <text x="137" y="18" text-anchor="middle" dominant-baseline="central" font-size="11" fill="var(--accent)" font-weight="600" font-family="'Work Sans', system-ui, sans-serif">C</text>
                <rect x="167" y="2" width="50" height="30" rx="5" stroke="var(--accent)" stroke-width="1" opacity="0.6"/>
                <text x="192" y="18" text-anchor="middle" dominant-baseline="central" font-size="11" fill="var(--accent)" font-weight="600" font-family="'Work Sans', system-ui, sans-serif">G</text>
              </svg>
            {/if}
          </div>
          <p>{t(tile.descKey)}</p>
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div class="app-header no-print">
    <h1>{t('app.title')}</h1>
    <button class="locale-toggle" onclick={() => i18n.setLocale(i18n.locale === 'en' ? 'cn' : 'en')}>
      <span class:active={i18n.locale === 'en'}>EN</span><span class="locale-sep">|</span><span class:active={i18n.locale === 'cn'}>中文</span>
    </button>
    <button class="home-button" onclick={() => activeTab = 'home'} aria-label="Home">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </button>
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
        {t(tab.labelKey)}
      </button>
    {/each}
  </nav>

  <div class="page-content">
    {#if activeTab === 'map'}
      <FretboardMap />
    {:else if activeTab === 'finder'}
      <ChordFinder initialChord={finderChord} initialFrets={finderFrets} onNavigateToShape={navigateToShape} />
    {:else if activeTab === 'shapes'}
      <ShapeExplorer
        onNavigateToChord={navigateToChord}
        initialShape={shapeNavShape}
        initialPosition={shapeNavPosition}
        initialVariantIdx={shapeNavVariantIdx}
      />
    {:else if activeTab === 'progression'}
      <ProgressionBuilder
        onNavigateToFinder={() => activeTab = 'finder'}
        onNavigateToChord={navigateToChord}
        onNavigateToIdentifier={() => activeTab = 'identifier'}
        onNavigateToShapes={() => activeTab = 'shapes'}
      />
    {:else}
      <ChordIdentifier onChordSelect={navigateToChord} />
    {/if}
  </div>
{/if}

{#if toast.visible}
  <div class="toast">{toast.message}</div>
{/if}

<style>
  .page-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    padding-top: 16px;
  }

  .toast {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--text);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 14px;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    animation: toast-in 0.2s ease-out;
    white-space: nowrap;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
