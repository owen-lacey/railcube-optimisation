/**
 * Options with their defaults, applied exactly where a destructuring default
 * would be: to an option left out or given as undefined. Spreading the defaults
 * under the options instead would let an explicit undefined through, and a
 * caller forwarding a setting it does not have would switch the default off.
 */
export const withDefaults = (options, defaults) => ({
  ...options,
  ...Object.fromEntries(Object.entries(defaults).map(([name, value]) =>
    [name, options?.[name] === undefined ? value : options[name]])),
});
