import React, { useState, useEffect } from 'react';
import SearchableSelect from '../common/SearchableSelect';
import { XMarkIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import { tableConfigService } from '../../services/tableConfigService';
import LoadingSpinner from '../common/LoadingSpinner';

const ICON_OPTIONS = [
  'DocumentTextIcon', 'CpuChipIcon', 'BoltIcon', 'CircleStackIcon',
  'TableCellsIcon', 'SignalIcon', 'WrenchScrewdriverIcon', 'ChartBarIcon',
];

const DEFAULT_COLUMN = {
  field: '',
  header: '',
  type: 'string',
  sortable: true,
  searchable: false,
  format: '',
};

/**
 * TableConfigModal - 3-step wizard for creating or editing a table configuration.
 * Props:
 *   mode      {'create'|'edit'}
 *   config    {Object|null}  - Existing config for edit mode
 *   onClose   {fn}
 *   onSaved   {fn}           - Callback after successful save
 */
const TableConfigModal = ({ mode = 'create', config: existingConfig, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 fields
  const [tableKey, setTableKey] = useState('');
  const [tableName, setTableName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [iconName, setIconName] = useState('DocumentTextIcon');
  const [isExportable, setIsExportable] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  // Step 2 fields
  const [availableColumns, setAvailableColumns] = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState([]);

  // Step 3
  const [previewData, setPreviewData] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Populate form in edit mode
  useEffect(() => {
    if (mode === 'edit' && existingConfig) {
      setTableKey(existingConfig.table_key);
      setTableName(existingConfig.table_name);
      setDisplayName(existingConfig.display_name);
      setIconName(existingConfig.icon_name || 'DocumentTextIcon');
      setIsExportable(existingConfig.is_exportable !== false);
      setSortOrder(existingConfig.sort_order || 0);
      setSelectedColumns(existingConfig.column_config || []);
    }
  }, [mode, existingConfig]);

  // --- Step 1 → Step 2: load available columns ---
  const goToStep2 = async () => {
    setError(null);
    if (!tableKey || !tableName || !displayName) {
      setError('Table Key, Database Table Name, and Display Name are required');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(tableKey)) {
      setError('Table Key may only contain letters, numbers, and underscores');
      return;
    }

    setColumnsLoading(true);
    try {
      const result = await tableConfigService.getAvailableColumns(tableName);
      setAvailableColumns(result.data || []);

      // In edit mode, selectedColumns are already set; in create mode default all to selected
      if (mode === 'create') {
        setSelectedColumns(
          (result.data || []).map((col) => ({
            field: col.column_name,
            header: col.column_name,
            type: col.suggested_type,
            sortable: true,
            searchable: col.column_name === 'Device_ID',
            format: col.suggested_type === 'datetime' ? 'utc_to_ist' : '',
          }))
        );
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load columns from that table');
    } finally {
      setColumnsLoading(false);
    }
  };

  // --- Step 2: toggle / edit a selected column ---
  const isColumnSelected = (colName) => selectedColumns.some((c) => c.field === colName);

  const toggleColumn = (col) => {
    if (isColumnSelected(col.column_name)) {
      setSelectedColumns((prev) => prev.filter((c) => c.field !== col.column_name));
    } else {
      setSelectedColumns((prev) => [
        ...prev,
        {
          field: col.column_name,
          header: col.column_name,
          type: col.suggested_type,
          sortable: true,
          searchable: col.column_name === 'Device_ID',
          format: col.suggested_type === 'datetime' ? 'utc_to_ist' : '',
        },
      ]);
    }
  };

  const updateSelectedColumn = (field, key, value) => {
    setSelectedColumns((prev) =>
      prev.map((c) => (c.field === field ? { ...c, [key]: value } : c))
    );
  };

  const moveColumn = (index, direction) => {
    const newCols = [...selectedColumns];
    const target = index + direction;
    if (target < 0 || target >= newCols.length) return;
    [newCols[index], newCols[target]] = [newCols[target], newCols[index]];
    setSelectedColumns(newCols);
  };

  // --- Step 2 → Step 3: load preview data ---
  const goToStep3 = async () => {
    setError(null);
    if (selectedColumns.length === 0) {
      setError('Select at least one column');
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await tableConfigService.getAllConfigs(); // just a connectivity check
      // For preview, fetch the first page of actual data
      const { deviceTestingService } = await import('../../services/deviceTestingService');
      // We can't call device-testing endpoints with an unsaved tableKey, so just show the column list
      setPreviewData([]);
      setStep(3);
    } catch (err) {
      setStep(3); // continue anyway
    } finally {
      setPreviewLoading(false);
    }
  };

  // --- Final save ---
  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        table_key: tableKey,
        table_name: tableName,
        display_name: displayName,
        icon_name: iconName,
        is_exportable: isExportable,
        sort_order: parseInt(sortOrder, 10) || 0,
        column_config: selectedColumns,
      };

      if (mode === 'edit') {
        await tableConfigService.updateConfig(existingConfig.config_id, payload);
      } else {
        await tableConfigService.createConfig(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  // --- Render helpers ---
  const stepLabel = (n, label) => (
    <div className={`flex items-center gap-2 text-sm font-medium ${step >= n ? 'text-primary-700' : 'text-gray-400'}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
        ${step > n ? 'bg-primary-600 text-white' : step === n ? 'bg-primary-100 text-primary-700 border border-primary-400' : 'bg-gray-100 text-gray-400'}`}>
        {step > n ? <CheckIcon className="w-3.5 h-3.5" /> : n}
      </span>
      {label}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {mode === 'edit' ? 'Edit Table Configuration' : 'Add Table Configuration'}
            </h3>
            <div className="flex items-center gap-4 mt-2">
              {stepLabel(1, 'Basic Info')}
              <div className="h-px w-6 bg-gray-200" />
              {stepLabel(2, 'Columns')}
              <div className="h-px w-6 bg-gray-200" />
              {stepLabel(3, 'Preview')}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Table Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tableKey}
                    onChange={(e) => setTableKey(e.target.value)}
                    disabled={mode === 'edit'}
                    placeholder="e.g. raw_messages"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Unique identifier (letters, numbers, underscores)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Database Table Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="e.g. IoT_Raw_Messages"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Raw Messages"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <SearchableSelect
                    options={ICON_OPTIONS.map(icon => ({ value: icon, label: icon.replace('Icon', '') }))}
                    value={iconName}
                    onChange={setIconName}
                    placeholder="Select icon"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_exportable"
                  checked={isExportable}
                  onChange={(e) => setIsExportable(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <label htmlFor="is_exportable" className="text-sm font-medium text-gray-700">Allow CSV export</label>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-3">
              {columnsLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Select the columns to display, configure their display settings, and drag to reorder.
                  </p>
                  <div className="text-xs text-gray-500 mb-2">
                    {selectedColumns.length} of {availableColumns.length} columns selected
                  </div>

                  {/* Available columns checklist */}
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {availableColumns.map((col) => (
                      <label key={col.column_name} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={isColumnSelected(col.column_name)}
                          onChange={() => toggleColumn(col)}
                          className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-800 flex-1">{col.column_name}</span>
                        <span className="text-xs text-gray-400">{col.data_type}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{col.suggested_type}</span>
                      </label>
                    ))}
                  </div>

                  {/* Selected columns - per-column config */}
                  {selectedColumns.length > 0 && (
                    <>
                      <h4 className="text-sm font-semibold text-gray-700 mt-4">Configure Selected Columns</h4>
                      <div className="space-y-2">
                        {selectedColumns.map((col, idx) => (
                          <div key={col.field} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                            {/* Reorder buttons */}
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveColumn(idx, -1)}
                                disabled={idx === 0}
                                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                              >▲</button>
                              <button
                                type="button"
                                onClick={() => moveColumn(idx, 1)}
                                disabled={idx === selectedColumns.length - 1}
                                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                              >▼</button>
                            </div>

                            <span className="text-xs font-mono text-gray-600 w-36 shrink-0">{col.field}</span>

                            <input
                              type="text"
                              value={col.header}
                              onChange={(e) => updateSelectedColumn(col.field, 'header', e.target.value)}
                              placeholder="Header"
                              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />

                            <SearchableSelect
                              options={['string', 'number', 'datetime', 'boolean', 'json'].map(t => ({ value: t, label: t }))}
                              value={col.type}
                              onChange={(v) => updateSelectedColumn(col.field, 'type', v || 'string')}
                              placeholder="type"
                              className="w-28"
                            />

                            {col.type === 'datetime' && (
                              <SearchableSelect
                                options={[{ value: 'utc_to_ist', label: 'UTC → IST' }]}
                                value={col.format || ''}
                                onChange={(v) => updateSelectedColumn(col.field, 'format', v)}
                                placeholder="No conversion"
                                className="w-32"
                              />
                            )}

                            <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                              <input
                                type="checkbox"
                                checked={col.searchable}
                                onChange={(e) => updateSelectedColumn(col.field, 'searchable', e.target.checked)}
                                className="w-3 h-3"
                              />
                              Search
                            </label>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Review your configuration before saving.</p>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium text-gray-700">Table Key:</span> <code className="bg-gray-100 px-1 rounded text-xs">{tableKey}</code></div>
                <div><span className="font-medium text-gray-700">DB Table:</span> {tableName}</div>
                <div><span className="font-medium text-gray-700">Display Name:</span> {displayName}</div>
                <div><span className="font-medium text-gray-700">Sort Order:</span> {sortOrder}</div>
                <div><span className="font-medium text-gray-700">Icon:</span> {iconName.replace('Icon', '')}</div>
                <div><span className="font-medium text-gray-700">Exportable:</span> {isExportable ? 'Yes' : 'No'}</div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Columns ({selectedColumns.length})</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Field</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Header</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Format</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Searchable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {selectedColumns.map((col) => (
                        <tr key={col.field}>
                          <td className="px-3 py-2 font-mono">{col.field}</td>
                          <td className="px-3 py-2">{col.header}</td>
                          <td className="px-3 py-2">{col.type}</td>
                          <td className="px-3 py-2">{col.format || '—'}</td>
                          <td className="px-3 py-2">{col.searchable ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={loading || columnsLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={step === 1 ? goToStep2 : goToStep3}
                disabled={loading || columnsLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                Next
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Configuration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableConfigModal;
