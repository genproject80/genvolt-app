import { useMemo } from 'react';
import { Select } from '@mantine/core';

/**
 * Drop-in replacement for the custom SearchableSelect using Mantine Select.
 *
 * Props (same contract as before):
 *   options     – [{ value, label }] or string[] (auto-normalized)
 *   value       – currently selected value ('' = nothing selected)
 *   onChange    – (value: string) => void
 *   placeholder – label shown when nothing is selected
 *   disabled    – bool
 *   className   – extra classes for the outer wrapper
 */
const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
}) => {
  const data = useMemo(() => {
    if (!options.length) return [];
    return typeof options[0] === 'string'
      ? options.map((o) => ({ value: o, label: o }))
      : options;
  }, [options]);

  const handleChange = (val) => {
    onChange(val ?? '');
  };

  return (
    <Select
      data={data}
      value={value || null}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      searchable
      clearable
      className={className}
      comboboxProps={{ withinPortal: true }}
    />
  );
};

export default SearchableSelect;
