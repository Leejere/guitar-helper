<script lang="ts">
  interface FilterOption {
    value: string;
    label: string;
  }

  interface Props {
    label: string;
    options: FilterOption[];
    selected: string[];
    multiSelect?: boolean;
    onchange: (selected: string[]) => void;
  }

  let { label, options, selected, multiSelect = true, onchange }: Props = $props();

  function toggle(value: string) {
    if (multiSelect) {
      if (selected.includes(value)) {
        onchange(selected.filter(v => v !== value));
      } else {
        onchange([...selected, value]);
      }
    } else {
      // Single-select: toggle off if already selected, otherwise select
      onchange(selected.includes(value) ? [] : [value]);
    }
  }

  function clear() {
    onchange([]);
  }
</script>

<div class="filter-row">
  <label class="filter-label">{label}</label>
  <div class="filter-options">
    {#each options as opt}
      <button
        class="filter-btn"
        class:active={selected.includes(opt.value)}
        onclick={() => toggle(opt.value)}
      >{opt.label}</button>
    {/each}
    {#if selected.length > 0}
      <button class="filter-row-clear" onclick={clear}>&times;</button>
    {/if}
  </div>
</div>

<style>
  .filter-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .filter-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 60px;
    flex-shrink: 0;
    padding-top: 5px;
  }

  .filter-options {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: flex-start;
  }

  .filter-btn {
    padding: 4px 10px;
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .filter-btn:hover {
    border-color: var(--accent);
    color: var(--text);
  }

  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .filter-row-clear {
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: 16px;
    line-height: 1;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .filter-row-clear:hover {
    opacity: 1;
    color: var(--accent);
  }
</style>
