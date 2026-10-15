<script>
  // How much one metric matters: a whole-number slider from 0 to `max`, its
  // value written on the thumb. As tall as the post's other buttons (36px), since
  // the thumb is one.
  import { Slider } from 'bits-ui';

  // `onchange` is handed the new value; `label` names the slider.
  let { value, max, onchange, label } = $props();
</script>

<Slider.Root
  type="single"
  {value}
  onValueChange={onchange}
  min={0}
  {max}
  step={1}
  class="weight-slider"
  aria-label={label}
>
  <span class="track"><Slider.Range class="weight-slider-range" /></span>
  <Slider.Thumb index={0} class="weight-slider-thumb" aria-label={label}>{value}</Slider.Thumb>
</Slider.Root>

<style>
  :global(.weight-slider) {
    position: relative;
    display: flex;
    align-items: center;
    height: 36px;
    touch-action: none;
  }

  .track {
    position: relative;
    flex: 1;
    height: 0.375rem;
    border-radius: 999px;
    background: var(--card-border);
    overflow: hidden;
  }

  :global(.weight-slider-range) {
    position: absolute;
    height: 100%;
    background: var(--grid-color);
  }

  :global(.weight-slider-thumb) {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 2px solid var(--grid-color);
    border-radius: 50%;
    background: var(--wash);
    color: var(--ink);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }
</style>
